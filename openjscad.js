OpenJsCad = function() {
};

OpenJsCad.log = function(txt) {
  var timeInMs = Date.now();
  var prevtime = OpenJsCad.log.prevLogTime;
  if(!prevtime) prevtime = timeInMs;
  var deltatime = timeInMs - prevtime;
  OpenJsCad.log.prevLogTime = timeInMs;
  var timefmt = (deltatime*0.001).toFixed(3);
  txt = "["+timefmt+"] "+txt;
  if( (typeof(console) == "object") && (typeof(console.log) == "function") )
  {
    console.log(txt);
  }
  else if( (typeof(self) == "object") && (typeof(self.postMessage) == "function") )
  {
    self.postMessage({cmd: 'log', txt: txt});
  }
  else throw new Error("Cannot log");
};

// A viewer is a WebGL canvas that lets the user view a mesh. The user can
// tumble it around by dragging the mouse.
OpenJsCad.Viewer = function(containerelement, width, height, initialdepth) {
  var gl = GL.create();
  this.gl = gl;
  this.angleX = 0;
  this.angleY = 0;
  this.viewpointX = 0;
  this.viewpointY = 0;
  this.viewpointZ = initialdepth;

  // Draw triangle lines:
  this.drawLines = false;
  // Set to true so lines don't use the depth buffer
  this.lineOverlay = false;

  // Set up the viewport
  gl.canvas.width = width;
  gl.canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.matrixMode(gl.PROJECTION);
  gl.loadIdentity();
  gl.perspective(45, width / height, 0.5, 1000);
  gl.matrixMode(gl.MODELVIEW);

  // Set up WebGL state
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0.93, 0.93, 0.93, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.polygonOffset(1, 1);

  // Black shader for wireframe
  this.blackShader = new GL.Shader('\
    void main() {\
      gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;\
    }\
  ', '\
    void main() {\
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.1);\
    }\
  ');

  // Shader with diffuse and specular lighting
  this.lightingShader = new GL.Shader('\
    varying vec3 color;\
    varying vec3 normal;\
    varying vec3 light;\
    void main() {\
      const vec3 lightDir = vec3(1.0, 2.0, 3.0) / 3.741657386773941;\
      light = lightDir;\
      color = gl_Color.rgb;\
      normal = gl_NormalMatrix * gl_Normal;\
      gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;\
    }\
  ', '\
    varying vec3 color;\
    varying vec3 normal;\
    varying vec3 light;\
    void main() {\
      vec3 n = normalize(normal);\
      float diffuse = max(0.0, dot(light, n));\
      float specular = pow(max(0.0, -reflect(light, n).z), 10.0) * sqrt(diffuse);\
      gl_FragColor = vec4(mix(color * (0.3 + 0.7 * diffuse), vec3(1.0), specular), 1.0);\
    }\
  ');

  containerelement.appendChild(gl.canvas);  

  var _this=this;

  gl.onmousemove = function(e) {
    _this.onMouseMove(e);
  };
  gl.ondraw = function() {
    _this.onDraw();
  };
  this.clear();
};

OpenJsCad.Viewer.prototype = {
  setCsg: function(csg) {
    this.mesh = OpenJsCad.Viewer.csgToMesh(csg);
    this.onDraw();    
  },

  clear: function() {
    // empty mesh:
    this.mesh = new GL.Mesh();
    this.onDraw();    
  },

  supported: function() {
    return !!this.gl; 
  },
  
  onMouseMove: function(e) {
    if (e.dragging) {
      e.preventDefault();
      if(e.altKey)
      {
        var factor = 1e-2;
        this.viewpointZ *= Math.pow(2,factor * e.deltaY);
      }
      else if(e.shiftKey)
      {
        var factor = 5e-3;
        this.viewpointX += factor * e.deltaX * this.viewpointZ; 
        this.viewpointY -= factor * e.deltaY * this.viewpointZ; 
      }
      else
      {
        this.angleY += e.deltaX * 2;
        this.angleX += e.deltaY * 2;
        this.angleX = Math.max(-90, Math.min(90, this.angleX));
      }
      this.onDraw();    
    }
  },

  onDraw: function(e) {
    var gl = this.gl;
    gl.makeCurrent();

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.loadIdentity();
    gl.translate(this.viewpointX, this.viewpointY, -this.viewpointZ);
    gl.rotate(this.angleX, 1, 0, 0);
    gl.rotate(this.angleY, 0, 1, 0);

    if (!this.lineOverlay) gl.enable(gl.POLYGON_OFFSET_FILL);
    this.lightingShader.draw(this.mesh, gl.TRIANGLES);
    if (!this.lineOverlay) gl.disable(gl.POLYGON_OFFSET_FILL);

    if(this.drawLines)
    {
      if (this.lineOverlay) gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      this.blackShader.draw(this.mesh, gl.LINES);
      gl.disable(gl.BLEND);
      if (this.lineOverlay) gl.enable(gl.DEPTH_TEST);
    }
  },  
}

// Convert from CSG solid to GL.Mesh object
OpenJsCad.Viewer.csgToMesh = function(csg) {
  var csg = csg.canonicalized();
  var mesh = new GL.Mesh({ normals: true, colors: true });
  var vertexTag2Index = {};
  var vertices = [];
  var colors = [];
  var triangles = [];
  // set to true if we want to use interpolated vertex normals
  // this creates nice round spheres but does not represent the shape of
  // the actual model
  var smoothlighting = false;   
  var polygons = csg.toPolygons();
  var numpolygons = polygons.length;
  for(var polygonindex = 0; polygonindex < numpolygons; polygonindex++)
  {
    var polygon = polygons[polygonindex];
    var color = [0,0,1];
    if(polygon.shared && polygon.shared.color)
    {
      color = polygon.shared.color;
    }
    var indices = polygon.vertices.map(function(vertex) {
      var vertextag = vertex.getTag();
      var vertexindex;
      if(smoothlighting && (vertextag in vertexTag2Index))
      {
        vertexindex = vertexTag2Index[vertextag];
      }
      else
      {
        vertexindex = vertices.length;
        vertexTag2Index[vertextag] = vertexindex;
        vertices.push([vertex.pos.x, vertex.pos.y, vertex.pos.z]);
        colors.push(color);
      }
      return vertexindex;
    });
    for (var i = 2; i < indices.length; i++) {
      triangles.push([indices[0], indices[i - 1], indices[i]]);
    }
  }
  mesh.triangles = triangles;
  mesh.vertices = vertices;
  mesh.colors = colors;
  mesh.computeWireframe();
  mesh.computeNormals();
  return mesh;
};

// this is a bit of a hack; doesn't properly supports urls that start with '/'
// but does handle relative urls containing ../
OpenJsCad.makeAbsoluteUrl = function(url, baseurl) {
  if(!url.match(/^[a-z]+\:/i))
  {
    var basecomps = baseurl.split("/");
    if(basecomps.length > 0)
    {
      basecomps.splice(basecomps.length - 1, 1);
    }
    var urlcomps = url.split("/");
    var comps = basecomps.concat(urlcomps);
    var comps2 = [];
    comps.map(function(c) {
      if(c == "..")
      {
        if(comps2.length > 0)
        {
          comps2.splice(comps2.length - 1, 1);
        }
      }
      else
      {
        comps2.push(c);
      }
    });  
    url = "";
    for(var i = 0; i < comps2.length; i++)
    {
      if(i > 0) url += "/";
      url += comps2[i];
    }
  }
  return url;
};

OpenJsCad.isChrome = function()
{
  return (navigator.userAgent.search("Chrome") >= 0);
};

// This is called from within the web worker. Execute the main() function of the supplied script
// and post a message to the calling thread when finished
OpenJsCad.runMainInWorker = function(mainParameters)
{
  try
  {
    if(typeof(main) != 'function') throw new Error('Your jscad file should contain a function main() which returns a CSG solid.');
    OpenJsCad.log.prevLogTime = Date.now();    
    var csg = main(mainParameters);
    if( (typeof(csg) != "object") || (!(csg instanceof CSG)) )
    {
      throw new Error("Your main() function should return a CSG solid.");
    }
    var csg_bin = csg.toCompactBinary();
    csg = null; // not needed anymore
    self.postMessage({cmd: 'rendered', csg: csg_bin});
  }
  catch(e)
  {
    var errtxt = e.stack;
    if(!errtxt)
    {
      errtxt = e.toString();
    } 
    self.postMessage({cmd: 'error', err: errtxt});
  }
};

OpenJsCad.javaScriptToSolidSync = function(script, mainParameters, debugging) {
  var workerscript = "";
  workerscript += script;
  if(debugging)
  {
    workerscript += "\n\n\n\n\n\n\n/* -------------------------------------------------------------------------\n";
    workerscript += "OpenJsCad debugging\n\nAssuming you are running Chrome:\nF10 steps over an instruction\nF11 steps into an instruction\n";
    workerscript += "F8  continues running\nPress the (||) button at the bottom to enable pausing whenever an error occurs\n";
    workerscript += "Click on a line number to set or clear a breakpoint\n";
    workerscript += "For more information see: http://code.google.com/chrome/devtools/docs/overview.html\n\n";
    workerscript += "------------------------------------------------------------------------- */\n"; 
    workerscript += "\n\n// Now press F11 twice to enter your main() function:\n\n";
    workerscript += "debugger;\n";
  }
  workerscript += "return main("+JSON.stringify(mainParameters)+");";  
  var f = new Function(workerscript);
  OpenJsCad.log.prevLogTime = Date.now();    
  var csg = f();
  return csg;
};

// callback: should be function(error, csg)
OpenJsCad.javaScriptToSolidASync = function(script, mainParameters, callback) {
  var baselibraries = [
    "csg.js",
    "openjscad.js"
  ];
  var baseurl = document.location + "";
  var workerscript = "";
  workerscript += script;
  workerscript += "\n\n\n\n//// The following code is added by OpenJsCad:\n";
  workerscript += "var _csg_libraries=" + JSON.stringify(baselibraries)+";\n";
  workerscript += "var _csg_baseurl=" + JSON.stringify(baseurl)+";\n";
  workerscript += "var _csg_makeAbsoluteURL=" + OpenJsCad.makeAbsoluteUrl.toString()+";\n";
//  workerscript += "if(typeof(libs) == 'function') _csg_libraries = _csg_libraries.concat(libs());\n";
  workerscript += "_csg_libraries = _csg_libraries.map(function(l){return _csg_makeAbsoluteURL(l,_csg_baseurl);});\n";
  workerscript += "_csg_libraries.map(function(l){importScripts(l)});\n";
  workerscript += "self.addEventListener('message', function(e) {if(e.data && e.data.cmd == 'render'){";
  workerscript += "  OpenJsCad.runMainInWorker("+JSON.stringify(mainParameters)+");";
//  workerscript += "  if(typeof(main) != 'function') throw new Error('Your jscad file should contain a function main() which returns a CSG solid.');\n";
//  workerscript += "  var csg; try {csg = main("+JSON.stringify(mainParameters)+"); self.postMessage({cmd: 'rendered', csg: csg});}";
//  workerscript += "  catch(e) {var errtxt = e.stack; self.postMessage({cmd: 'error', err: errtxt});}";
  workerscript += "}},false);\n";
    
  var blobURL = OpenJsCad.textToBlobUrl(workerscript);
  
  if(!window.Worker) throw new Error("Your browser doesn't support Web Workers. Please try the Chrome browser instead.");
  var worker = new Worker(blobURL);
  worker.onmessage = function(e) {
    if(e.data)
    { 
      if(e.data.cmd == 'rendered')
      {
        //var csg = CSG.fromObject(e.data.csg);
        var csg = CSG.fromCompactBinary(e.data.csg);
        callback(null, csg);
      }
      else if(e.data.cmd == "error")
      {
//        var errtxt = "Error in line "+e.data.err.lineno+": "+e.data.err.message;
        callback(e.data.err, null);
      }
      else if(e.data.cmd == "log")
      {
        console.log(e.data.txt);
      }
    }
  };
  worker.onerror = function(e) {
    var errtxt = "Error in line "+e.lineno+": "+e.message;
    callback(errtxt, null);
  };
  worker.postMessage({
    cmd: "render"
  }); // Start the worker.
  return worker;
};

OpenJsCad.textToBlobUrl = function(txt) {
  var bb;
  if(window.BlobBuilder) bb = new window.BlobBuilder()
  else if(window.WebKitBlobBuilder) bb = new window.WebKitBlobBuilder()
  else if(window.MozBlobBuilder) bb = new window.MozBlobBuilder()
  else throw new Error("Your browser doesn't support BlobBuilder");

  bb.append(txt);
  var blob = bb.getBlob();
  var blobURL;
  if(window.URL) blobURL = window.URL.createObjectURL(blob)
  else if(window.webkitURL) blobURL = window.webkitURL.createObjectURL(blob)
  else throw new Error("Your browser doesn't support window.URL");
  if(!blobURL) throw new Error("createObjectURL() failed"); 
  return blobURL;
};

OpenJsCad.revokeBlobUrl = function(url) {
  if(window.URL) window.URL.revokeObjectURL(url)
  else if(window.webkitURL) window.webkitURL.revokeObjectURL(url)
  else throw new Error("Your browser doesn't support window.URL");
};

OpenJsCad.FileSystemApiErrorHandler = function(fileError, operation) {
  var errormap = {
    1: 'NOT_FOUND_ERR',
    2: 'SECURITY_ERR',
    3: 'ABORT_ERR',
    4: 'NOT_READABLE_ERR',
    5: 'ENCODING_ERR',
    6: 'NO_MODIFICATION_ALLOWED_ERR',
    7: 'INVALID_STATE_ERR',
    8: 'SYNTAX_ERR',
    9: 'INVALID_MODIFICATION_ERR',
    10: 'QUOTA_EXCEEDED_ERR',
    11: 'TYPE_MISMATCH_ERR',
    12: 'PATH_EXISTS_ERR',
  };
  var errname;
  if(fileError.code in errormap)
  {
    errname = errormap[fileError.code];
  }
  else
  {
    errname = "Error #"+fileError.code;
  }
  var errtxt = "FileSystem API error: "+operation+" returned error "+errname;
  throw new Error(errtxt);
};

OpenJsCad.AlertUserOfUncaughtExceptions = function() {
  window.onerror = function(message, url, line) {
    message = message.replace(/^Uncaught /i, "");
    alert(message+"\n\n("+url+" line "+line+")");
  };
};

// parse the jscad script to get the parameter definitions
OpenJsCad.getParamDefinitions = function(script) {
  var scriptisvalid = true;
  try
  {
    // first try to execute the script itself
    // this will catch any syntax errors
    var f = new Function(script);
    f();
  }
  catch(e) {
    scriptisvalid = false;
  }
  var params = [];
  if(scriptisvalid)
  {
    var script1 = "if(typeof(getParameterDefinitions) == 'function') {return getParameterDefinitions();} else {return [];} ";
    script1 += script;
    var f = new Function(script1);
    params = f();
    if( (typeof(params) != "object") || (typeof(params.length) != "number") )
    {
      throw new Error("The getParameterDefinitions() function should return an array with the parameter definitions");
    }
  }
  return params;
};

OpenJsCad.Processor = function(containerdiv, onchange) {
  this.containerdiv = containerdiv;
  this.onchange = onchange;
  this.viewerdiv = null;
  this.viewer = null;
  this.viewerwidth = 800;
  this.viewerheight = 600;
  this.initialViewerDistance = 50;
  this.processing = false;
  this.solid = null;
  this.validcsg = false;
  this.hasstl = false;
  this.worker = null;
  this.paramDefinitions = [];
  this.paramControls = [];
  this.script = null;
  this.hasError = false;
  this.debugging = false;
  this.createElements();
};

OpenJsCad.Processor.prototype = {
  createElements: function() {
    while(this.containerdiv.children.length > 0)
    {
      this.containerdiv.removeChild(0);
    }
    if(!OpenJsCad.isChrome() )
    {
      var div = document.createElement("div");
      div.innerHTML = "Please note: OpenJsCad currently only runs reliably on Google Chrome!";
      this.containerdiv.appendChild(div);
    }
    var viewerdiv = document.createElement("div");
    viewerdiv.className = "viewer";
    viewerdiv.style.width = this.viewerwidth + "px";
    viewerdiv.style.height = this.viewerheight + "px";
    viewerdiv.style.backgroundColor = "rgb(200,200,200)";
    this.containerdiv.appendChild(viewerdiv);
    this.viewerdiv = viewerdiv;
    try
    {
      this.viewer = new OpenJsCad.Viewer(this.viewerdiv, this.viewerwidth, this.viewerheight, this.initialViewerDistance);
    } catch (e) {
//      this.viewer = null;
      this.viewerdiv.innerHTML = "<b><br><br>Error: "+e.toString()+"</b><br><br>OpenJsCad currently requires Google Chrome with WebGL enabled";
//      this.viewerdiv.innerHTML = e.toString();
    }
    this.errordiv = document.createElement("div");
    this.errorpre = document.createElement("pre"); 
    this.errordiv.appendChild(this.errorpre);
    this.statusdiv = document.createElement("div");
    this.statusdiv.className = "statusdiv";
    //this.statusdiv.style.width = this.viewerwidth + "px";
    this.statusspan = document.createElement("span");
    this.statusbuttons = document.createElement("div");
    this.statusbuttons.style.float = "right";
    this.statusdiv.appendChild(this.statusspan);
    this.statusdiv.appendChild(this.statusbuttons);
    this.abortbutton = document.createElement("button");
    this.abortbutton.innerHTML = "Abort";
    var that = this;
    this.abortbutton.onclick = function(e) {
      that.abort();
    };
    this.statusbuttons.appendChild(this.abortbutton);
    this.generateStlButton = document.createElement("button");
    this.generateStlButton.innerHTML = "Generate STL";
    this.generateStlButton.onclick = function(e) {
      that.generateStl();
    };
    this.statusbuttons.appendChild(this.generateStlButton);
    this.downloadStlLink = document.createElement("a");
    this.downloadStlLink.innerHTML = "Download STL";
    this.statusbuttons.appendChild(this.downloadStlLink);
    this.parametersdiv = document.createElement("div");
    this.parametersdiv.className = "parametersdiv";
    var headerdiv = document.createElement("div");
    headerdiv.innerText = "Parameters:";
    headerdiv.className = "header";
    this.parametersdiv.appendChild(headerdiv);
    this.parameterstable = document.createElement("table");
    this.parameterstable.className = "parameterstable";
    this.parametersdiv.appendChild(this.parameterstable);
    var parseParametersButton = document.createElement("button");
    parseParametersButton.innerHTML = "Update";
    parseParametersButton.onclick = function(e) {
      that.rebuildSolid();
    };
    this.parametersdiv.appendChild(parseParametersButton);
    this.enableItems();    
    this.containerdiv.appendChild(this.statusdiv);
    this.containerdiv.appendChild(this.errordiv);
    this.containerdiv.appendChild(this.parametersdiv);
    this.clearViewer();
  },
  
  clearViewer: function() {
    this.clearStl();
    this.solid = new CSG();
    if(this.viewer)
    {
      this.viewer.setCsg(this.solid);
    }
    this.validcsg = false;
    this.enableItems();
  },
  
  abort: function() {
    if(this.processing)
    {
      //todo: abort
      this.processing=false;
      this.statusspan.innerHTML = "Aborted.";
      this.worker.terminate();
      this.enableItems();
      if(this.onchange) this.onchange();
    }
  },
  
  enableItems: function() {
    this.abortbutton.style.display = this.processing? "inline":"none";
    this.generateStlButton.style.display = ((!this.hasstl)&&(this.validcsg))? "inline":"none";
    this.downloadStlLink.style.display = this.hasstl? "inline":"none";
    this.parametersdiv.style.display = (this.paramControls.length > 0)? "block":"none";
    this.errordiv.style.display = this.hasError? "block":"none";
    this.statusdiv.style.display = this.hasError? "none":"block";    
  },
  
  setError: function(txt) {
    this.hasError = (txt != "");
    this.errorpre.innerText = txt;
    this.enableItems();
  },
  
  setDebugging: function(debugging) {
    this.debugging = debugging;
  },
  
  // script: javascript code
  // filename: optional, the name of the .jscad file
  setJsCad: function(script, filename) {
    if(!filename) filename = "openjscad.jscad";
    filename = filename.replace(/\.jscad$/i, "");
    this.abort();
    this.clearViewer();
    this.paramDefinitions = [];
    this.paramControls = [];
    this.script = null;
    this.setError("");
    var scripthaserrors = false;
    try
    {
      this.paramDefinitions = OpenJsCad.getParamDefinitions(script);
      this.createParamControls();
    }
    catch(e)
    {
      this.setError(e.toString());
      this.statusspan.innerHTML = "Error.";
      scripthaserrors = true;
    }
    if(!scripthaserrors)
    {
      this.script = script;
      this.filename = filename;
      this.rebuildSolid();
    }
    else
    {
      this.enableItems();
      if(this.onchange) this.onchange();
    }
  },
  
  getParamValues: function()
  {
    var paramValues = {};
    for(var i = 0; i < this.paramDefinitions.length; i++)
    {
      var paramdef = this.paramDefinitions[i];
      var type = "text";
      if('type' in paramdef)
      {
        type = paramdef.type;
      }
      var control = this.paramControls[i];
      var value;
      if( (type == "text") || (type == "float") || (type == "int") )
      {
        value = control.value;
        if( (type == "float") || (type == "int") )
        {
          var isnumber = !isNaN(parseFloat(value)) && isFinite(value);
          if(!isnumber)
          {
            throw new Error("Not a number: "+value);
          }
          if(type == "int")
          {
            value = parseInt(value);
          }
          else
          {
            value = parseFloat(value);
          }
        }
      }
      else if(type == "choice")
      {
        value = control.options[control.selectedIndex].value;
      }
      paramValues[paramdef.name] = value;
    }
    return paramValues;
  },
  
  rebuildSolid: function()
  {
    this.abort();
    this.setError("");
    this.clearViewer();
    this.processing = true;
    this.statusspan.innerHTML = "Processing, please wait...";
    this.enableItems();
    var that = this;
    var paramValues = this.getParamValues();
    var useSync = this.debugging;
    if(!useSync)
    {
      try
      {
        this.worker = OpenJsCad.javaScriptToSolidASync(this.script, paramValues, function(err, csg) {
          that.processing = false;
          that.worker = null;
          if(err)
          {
            that.setError(err);
            that.statusspan.innerHTML = "Error.";
          }
          else
          {
            that.solid = csg;      
            if(that.viewer) that.viewer.setCsg(csg);
            that.validcsg = true;
            that.statusspan.innerHTML = "Ready.";
          }
          that.enableItems();
          if(that.onchange) that.onchange();
        });
      }
      catch(e)
      {
        useSync = true;
      }
    }
    
    if(useSync)
    {
      try
      {
        var csg = OpenJsCad.javaScriptToSolidSync(this.script, paramValues, this.debugging);
        that.processing = false;
        that.solid = csg;      
        if(that.viewer) that.viewer.setCsg(csg);
        that.validcsg = true;
        that.statusspan.innerHTML = "Ready.";
      }
      catch(e)
      {
        that.processing = false;
        var errtxt = e.stack;
        if(!errtxt)
        {
          errtxt = e.toString();
        }
        that.setError(errtxt);
        that.statusspan.innerHTML = "Error.";
      }
      that.enableItems();
      if(that.onchange) that.onchange();
    }
  },
  
  hasSolid: function() {
    return this.validcsg;
  },

  isProcessing: function() {
    return this.processing;
  },
  
/*
  clearStl1: function() {
    if(this.hasstl)
    {
      this.hasstl = false;
      OpenJsCad.revokeBlobUrl(this.stlBlobUrl);
      this.stlBlobUrl = null;
      this.enableItems();
      if(this.onchange) this.onchange();
    }
  },
  
*/
  
  clearStl: function() {
    if(this.hasstl)
    {
      this.hasstl = false;
      if(this.stlDirEntry)
      {
        this.stlDirEntry.removeRecursively(function(){});
        this.stlDirEntry=null;
      }
      if(this.stlBlobUrl)
      {
        OpenJsCad.revokeBlobUrl(this.stlBlobUrl);
        this.stlBlobUrl = null;
      }
      this.enableItems();
      if(this.onchange) this.onchange();
    }
  },

  generateStl: function() {
    this.clearStl();
    if(this.validcsg)
    {
      try
      {
        this.generateStlFileSystem();
      }
      catch(e)
      {
        this.generateStlBlobUrl();
      }
    }
  },
  
  generateStlBlobUrl: function() {
    var stltxt = this.solid.toStlString();
    this.stlBlobUrl = OpenJsCad.textToBlobUrl(stltxt);
    this.hasstl = true;
    this.downloadStlLink.href = this.stlBlobUrl;
    this.enableItems();
    if(this.onchange) this.onchange();
  },

  generateStlFileSystem: function() {
    var stltxt = this.solid.toStlString();
    window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
    window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;
    if(!window.requestFileSystem)
    {
      throw new Error("Your browser does not support the HTML5 FileSystem API. Please try the Chrome browser instead.");
    }
    if(!window.BlobBuilder)
    {
      throw new Error("Your browser does not support the HTML5 BlobBuilder API. Please try the Chrome browser instead.");
    }
    // create a random directory name:
    var dirname = "OpenJsCadStlOutput1_"+parseInt(Math.random()*1000000000, 10)+".stl";
    var filename = this.filename+".stl";
    var that = this;
    window.requestFileSystem(TEMPORARY, 20*1024*1024, function(fs){
        fs.root.getDirectory(dirname, {create: true, exclusive: true}, function(dirEntry) {
            that.stlDirEntry = dirEntry;
            dirEntry.getFile(filename, {create: true, exclusive: true}, function(fileEntry) {
                 fileEntry.createWriter(function(fileWriter) {
                    fileWriter.onwriteend = function(e) {
                      that.hasstl = true;
                      that.downloadStlLink.href = fileEntry.toURL();
                      that.enableItems();
                      if(that.onchange) that.onchange();
                    };
                    fileWriter.onerror = function(e) {
                      throw new Error('Write failed: ' + e.toString());
                    };
                    // Create a new Blob and write it to log.txt.
                    var bb = new window.BlobBuilder(); // Note: window.WebKitBlobBuilder in Chrome 12.
                    bb.append(stltxt);
                    fileWriter.write(bb.getBlob());                
                  }, 
                  function(fileerror){OpenJsCad.FileSystemApiErrorHandler(fileerror, "createWriter");} 
                );
              },
              function(fileerror){OpenJsCad.FileSystemApiErrorHandler(fileerror, "getFile('"+filename+"')");} 
            );
          },
          function(fileerror){OpenJsCad.FileSystemApiErrorHandler(fileerror, "getDirectory('"+dirname+"')");} 
        );         
      }, 
      function(fileerror){OpenJsCad.FileSystemApiErrorHandler(fileerror, "requestFileSystem");}
    );
  },
  
  createParamControls: function() {
    this.parameterstable.innerHTML = "";
    this.paramControls = [];
    var paramControls = [];
    var tablerows = [];
    for(var i = 0; i < this.paramDefinitions.length; i++)
    {
      var errorprefix = "Error in parameter definition #"+(i+1)+": ";
      var paramdef = this.paramDefinitions[i];
      if(!('name' in paramdef))
      {
        throw new Error(errorprefix + "Should include a 'name' parameter");
      }
      var type = "text";
      if('type' in paramdef)
      {
        type = paramdef.type;
      }
      if( (type !== "text") && (type !== "int") && (type !== "float") && (type !== "choice") )
      {
        throw new Error(errorprefix + "Unknown parameter type '"+type+"'");
      }
      var control;
      if( (type == "text") || (type == "int") || (type == "float") )
      {
        control = document.createElement("input");
        control.type = "text";
        if('default' in paramdef)
        {
          control.value = paramdef.default;
        }
        else
        {
          if( (type == "int") || (type == "float") )
          {
            control.value = "0";
          }
          else
          {
            control.value = "";
          }
        }
      }
      else if(type == "choice")
      {
        if(!('values' in paramdef))
        {
          throw new Error(errorprefix + "Should include a 'values' parameter");
        }        
        control = document.createElement("select");
        var values = paramdef.values;
        var captions;
        if('captions' in paramdef)
        {
          captions = paramdef.captions;
          if(captions.length != values.length)
          {
            throw new Error(errorprefix + "'captions' and 'values' should have the same number of items");
          }
        }
        else
        {
          captions = values;
        }
        var selectedindex = 0;
        for(var valueindex = 0; valueindex < values.length; valueindex++)
        {
          var option = document.createElement("option");
          option.value = values[valueindex];
          option.text = captions[valueindex];
          control.add(option);
          if('default' in paramdef)
          {
            if(paramdef.default == values[valueindex])
            {
              selectedindex = valueindex;
            }
          }
        }
        if(values.length > 0)
        {
          control.selectedIndex = selectedindex;
        }        
      }
      paramControls.push(control);
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      var label = paramdef.name + ":";
      if('caption' in paramdef)
      {
        label = paramdef.caption;
      }
       
      td.innerHTML = label;
      tr.appendChild(td);
      td = document.createElement("td");
      td.appendChild(control);
      tr.appendChild(td);
      tablerows.push(tr);
    }
    var that = this;
    tablerows.map(function(tr){
      that.parameterstable.appendChild(tr);
    }); 
    this.paramControls = paramControls;
  },
};

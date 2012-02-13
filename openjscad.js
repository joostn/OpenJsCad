OpenJsCad = function() {
};

// A viewer is a WebGL canvas that lets the user view a mesh. The user can
// tumble it around by dragging the mouse.
OpenJsCad.Viewer = function(containerelement, width, height, initialdepth) {
  try
  {
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
  }
  catch (e) {
    containerelement.innerHTML = "<b><br><br>Error: "+e.toString()+"</b><br><br>OpenJsCad currently requires Google Chrome with WebGL enabled";
  }
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
        colors.push([0,0,1]);
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

// parse javascript into solid:
OpenJsCad.javaScriptToSolid = function(script) {
  var csg = new Function(script)();
  if( (typeof(csg) != "object") || (!('polygons' in csg)))
  {
    throw new Error("Your javascript code should return a CSG object. Try for example: return CSG.cube();");
  }
  return csg;
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
}

// callback: should be function(error, csg)
OpenJsCad.javaScriptToSolidASync = function(script, callback) {
  var baselibraries = [
    "csg.js",
    "openjscad.js"
  ];
  var baseurl = document.location + "";
  var workerscript = "";
  workerscript += script;
  workerscript += "\n//// END OF USER SUPPLIED SCRIPT\n";
  workerscript += "var _csg_libraries=" + JSON.stringify(baselibraries)+";\n";
  workerscript += "var _csg_baseurl=" + JSON.stringify(baseurl)+";\n";
  workerscript += "var _csg_makeAbsoluteURL=" + OpenJsCad.makeAbsoluteUrl.toString()+";\n";
  workerscript += "if(typeof(libs) == 'function') _csg_libraries = _csg_libraries.concat(libs());\n";
  workerscript += "_csg_libraries = _csg_libraries.map(function(l){return _csg_makeAbsoluteURL(l,_csg_baseurl);});\n";
  //workerscript += "importScripts.call(null, _csg_libraries);\n";
  workerscript += "_csg_libraries.map(function(l){importScripts(l)});\n";
  workerscript += "self.addEventListener('message', function(e) {if(e.data && e.data.cmd == 'render'){";
  workerscript += "  if(typeof(main) != 'function') throw new Error('Your jscad file should contain a function main() which returns a CSG solid.');\n";
  workerscript += "  var csg = main(); self.postMessage({cmd: 'rendered', csg: csg});";
  workerscript += "}},false);\n";
  
  var blobURL = OpenJsCad.textToBlobUrl(workerscript);
  
  if(!window.Worker) throw new Error("Your browser doesn't support Web Workers");
  var worker = new Worker(blobURL);
  worker.onmessage = function(e) {
    if(e.data && e.data.cmd == 'rendered')
    {
      var csg = CSG.fromObject(e.data.csg);
      callback(null, csg);
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
  return blobURL;
};

OpenJsCad.revokeBlobUrl = function(url) {
  if(window.URL) window.URL.revokeObjectURL(url)
  else if(window.webkitURL) window.webkitURL.revokeObjectURL(url)
  else throw new Error("Your browser doesn't support window.URL");
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
  this.createElements();
};

OpenJsCad.FileSystemApiErrorHandler = function(fileError, operation) {
  var errormap = {
    1: NOT_FOUND_ERR,
    2: SECURITY_ERR,
    3: ABORT_ERR,
    4: NOT_READABLE_ERR,
    5: ENCODING_ERR,
    6: NO_MODIFICATION_ALLOWED_ERR,
    7: INVALID_STATE_ERR,
    8: SYNTAX_ERR,
    9: INVALID_MODIFICATION_ERR,
    10: QUOTA_EXCEEDED_ERR,
    11: TYPE_MISMATCH_ERR,
    12: PATH_EXISTS_ERR,
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
      this.viewerdiv.innerHTML = e.toString();
    }
    this.errordiv = document.createElement("div");
    this.errordiv.style.display = "none";
    this.statusdiv = document.createElement("div");
    this.statusdiv.style.width = this.viewerwidth + "px";
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
    }
    this.statusbuttons.appendChild(this.abortbutton);
    this.generateStlButton = document.createElement("button");
    this.generateStlButton.innerHTML = "Generate STL";
    this.generateStlButton.onclick = function(e) {
      that.generateStl();
    }
    this.statusbuttons.appendChild(this.generateStlButton);
    this.downloadStlLink = document.createElement("a");
    this.downloadStlLink.innerHTML = "Download STL";
    this.statusbuttons.appendChild(this.downloadStlLink);
    this.enableItems();    
    this.containerdiv.appendChild(this.statusdiv);
    this.containerdiv.appendChild(this.errordiv);
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
  },
  
  setError: function(txt) {
    this.errordiv.innerHTML = txt;
    this.errordiv.style.display = (txt == "")? "none":"block";    
  },
  
  // script: javascript code
  // filename: optional, the name of the .jscad file
  setJsCad: function(script, filename) {
    if(!filename) filename = "openjscad.jscad";
    filename = filename.replace(/\.jscad$/i, "");
    this.abort();
    this.clearViewer();
    this.setError("");
    this.processing = true;
    this.statusspan.innerHTML = "Processing, please wait...";
    this.filename = filename;
    var that = this;
    this.worker = OpenJsCad.javaScriptToSolidASync(script, function(err, csg) {
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
    this.enableItems();
    if(this.onchange) this.onchange();
  },
  
  hasSolid: function() {
    return this.validcsg;
  },

  isProcessing: function() {
    return this.processing;
  },
  
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
  
  generateStl1: function() {
    this.clearStl();
    if(this.validcsg)
    {
      var stltxt = this.solid.toStlString();
      this.stlBlobUrl = OpenJsCad.textToBlobUrl(stltxt);
      this.hasstl = true;
      this.downloadStlLink.href = this.stlBlobUrl;
      this.enableItems();
      if(this.onchange) this.onchange();
    }
  },
  
  clearStl: function() {
    if(this.hasstl)
    {
      this.hasstl = false;
      if(that.stlDirEntry)
      {
        that.stlDirEntry.removeRecursively();
        that.stlDirEntry=null;
      }
      this.enableItems();
      if(this.onchange) this.onchange();
    }
  },
  
  generateStl: function() {
    this.clearStl();
    if(this.validcsg)
    {
      var stltxt = this.solid.toStlString();
      window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
      window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;
      if(!window.requestFileSystem)
      {
        throw new Error("Your browser does not support the HTML5 FileSystem API");
      }
      if(!window.BlobBuilder)
      {
        throw new Error("Your browser does not support the HTML5 BlobBuilder API");
      }
      // create a random directory name:
      var dirname = "OpenJsCadStlOutput_"+parseInt(Math.random()*1000000000, 10)+".stl";
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
    }
  },
  

};
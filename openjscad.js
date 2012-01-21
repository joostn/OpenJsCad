OpenJsCad = function() {
};

// A viewer is a WebGL canvas that lets the user view a mesh. The user can
// tumble it around by dragging the mouse.
OpenJsCad.Viewer = function(containerelement, width, height, initialdepth) {
  var gl = GL.create();
  if(!gl)
  {
    containerelement.innerHTML = "WebGL is required for the 3D viewer, but your browser doesn't seem to support this."; 
  }
  else
  {   
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
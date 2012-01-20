// Draw triangle lines:
Viewer.drawLines = false;
// Set to true so lines don't use the depth buffer
Viewer.lineOverlay = false;

// Set the color of all polygons in this solid
CSG.prototype.setColor = function(r, g, b) {
  this.toPolygons().map(function(polygon) {
    polygon.shared = [r, g, b];
  });
};

// Convert from CSG solid to GL.Mesh object
CSG.prototype.toMesh = function() {
  var csg = this.canonicalized();
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


var viewers = [];


// A viewer is a WebGL canvas that lets the user view a mesh. The user can
// tumble it around by dragging the mouse.
function Viewer(csg, width, height, depth) {

  var angleX = 0;
  var angleY = 0;
  var viewpointX = 0;
  var viewpointY = 0;

  viewers.push(this);

  // Get a new WebGL canvas
  var gl = GL.create();
  this.gl = gl;
  this.mesh = csg.toMesh();

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

  var _this=this;
  gl.onmousemove = function(e) {
    if (e.dragging) {
      e.preventDefault();
      if(e.altKey)
      {
        var factor = 1e-2;
        depth *= Math.pow(2,factor * e.deltaY);
      }
      else if(e.shiftKey)
      {
        var factor = 5e-3;
        viewpointX += factor * e.deltaX * depth; 
        viewpointY -= factor * e.deltaY * depth; 
      }
      else
      {
        angleY += e.deltaX * 2;
        angleX += e.deltaY * 2;
        angleX = Math.max(-90, Math.min(90, angleX));
      }

      _this.gl.ondraw();
    }
  };

  gl.onmousewheel = function(e) {
    e.preventDefault();
    var delta = e.wheelDelta();
    var factor = 1e-5;
    depth *= Math.pow(factor * delta);
  };

  var that = this;
  gl.ondraw = function() {
    gl.makeCurrent();

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.loadIdentity();
    gl.translate(viewpointX, viewpointY, -depth);
    gl.rotate(angleX, 1, 0, 0);
    gl.rotate(angleY, 0, 1, 0);

    if (!Viewer.lineOverlay) gl.enable(gl.POLYGON_OFFSET_FILL);
    that.lightingShader.draw(that.mesh, gl.TRIANGLES);
    if (!Viewer.lineOverlay) gl.disable(gl.POLYGON_OFFSET_FILL);

    if(Viewer.drawLines)
    {
      if (Viewer.lineOverlay) gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      that.blackShader.draw(that.mesh, gl.LINES);
      gl.disable(gl.BLEND);
      if (Viewer.lineOverlay) gl.enable(gl.DEPTH_TEST);
    }
  };

  gl.ondraw();
}

var nextID = 0;
function addViewer(viewer) {
  document.getElementById(nextID++).appendChild(viewer.gl.canvas);
}

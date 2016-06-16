// A viewer is a WebGL canvas that lets the user view a mesh. The user can
// tumble it around by dragging the mouse.

/**
 * Converts RGB color value to 24 bit hex color value
 * Conversion formula:
 * - convert R, G, B into HEX
 * - return 24bit Number 0xRRGGBB
 */
function rgbTo24Bit (r, g, b){
  if (r.length) { b = r[2], g = r[1], r = r[0]; }
  if ('r' in r && 'g' in r && 'b' in r) {b = r.b, g = r.g, r = r.r;}
  var s = Number(0x1000000+Math.floor(r*255)*0x10000+Math.floor(g*255)*0x100+Math.floor(b*255));
  return s;
}


OpenJsCad.Viewer.ThreeEngine = function (containerEl, size, options) {
  // TODO: read from config

  this.perspective = 45; // in degrees

  this.options = options;
  this.size = size;

  // the element to contain the canvas
  this.containerEl = containerEl;

  this.createScene();
  this.createCamera();
  this.parseSizeParams();
  // createRenderer will also call render
  this.createRenderer(options.noWebGL);
  this.animate();
}

OpenJsCad.Viewer.ThreeEngine.prototype = {
  init: function() {

  },
  // adds axes too
  createScene: function() {
    var scene = new THREE.Scene();
    this.scene_ = scene;
    if (this.options.axes.draw) {
      this.drawAxes();
    }
    if (this.options.grid.draw) {
      this.drawGrid();
    }
  },
  createCamera: function() {
    var cameraAngle = this.options.camera.angle;
    var light = new THREE.PointLight();
    light.position.set(0, 0, 0);
    // aspect ration changes later - just a placeholder
    var camera = new THREE.PerspectiveCamera(this.perspective, 1/1, 0.01, 1000000);
    this.camera_ = camera;
    camera.add(light);
    camera.up.set(0, 0, 1);
    this.scene_.add(camera);
  },
  createControls: function(canvas) {
    // controls. just change this line (and script include) to other threejs controls if desired
    var controls = new THREE.OrbitControls(this.camera_, canvas);
    this.controls_ = controls;
    controls.noKeys = true;
    controls.zoomSpeed = 0.5;
    // controls.autoRotate = true;
    controls.autoRotateSpeed = 1;
    controls.addEventListener( 'change', this.render.bind(this));
  },
  webGLAvailable: function() {
    try {
      var canvas = document.createElement("canvas");
      return !!
        window.WebGLRenderingContext &&
        (canvas.getContext("webgl") ||
         canvas.getContext("experimental-webgl"));
    } catch(e) {
      return false;
    }
  },
  createRenderer: function(bool_noWebGL) {
    var Renderer = this.webGLAvailable() && !bool_noWebGL ?
        THREE.WebGLRenderer : THREE.CanvasRenderer;
    // we're creating new canvas on switching renderer, as same
    // canvas doesn't tolerate moving from webgl to canvasrenderer
    var renderer = new Renderer({precision: 'highp', antialias: true});
    this.renderer_ = renderer;

    if (this.canvas) {
      this.canvas.remove();
    }
    this.canvas = renderer.domElement;
    this.containerEl.appendChild(this.canvas);
    // this.scene_.fog = new THREE.FogExp2( 0xcccccc, 0.002 )

    var bgColor = this.options.background.color;

    var bgColor_ = new THREE.Color();
    bgColor_.setRGB.apply(bgColor_, [bgColor.r, bgColor.g, bgColor.b, bgColor.a || 1]);

    renderer.setClearColor(bgColor_);
    // renderer.setClearColor(scene.fog.color);
    // and add controls
    this.createControls(renderer.domElement, this.canvas);

    // if coming in from contextrestore, enable rendering here
    this.pauseRender_ = false;
    this.handleResize();
    // handling context lost
    var this_ = this;
    this.canvas.addEventListener("webglcontextlost", function(e) {
      e.preventDefault();
      this_.cancelAnimate();
    }, false);
    this.canvas.addEventListener("webglcontextrestored", function(e) {
      this_.createRenderer(true);
      this_.animate();
    }, false);
  },
  render: function() {
    if (!this.pauseRender_) {
      this.renderer_.render(this.scene_, this.camera_);
    }
  },
  animate: function() {
    // reduce fps? replace func with
    // setTimeout( function() {
    //     requestAnimationFrame(this.animate.bind(this));
    // }, 1000 / 40 ); // last num = fps
    this.requestID_ = requestAnimationFrame(this.animate.bind(this));
    this.controls_.update();
  },
  cancelAnimate: function() {
    this.pauseRender_ = true;
    cancelAnimationFrame(this.requestID_);
  },
  refreshRenderer: function(bool_noWebGL) {
    this.cancelAnimate();
    if (!bool_noWebGL) {
      // need to refresh scene objects except camera
      var objs = this.scene_.children.filter(function(ch) {
        return !(ch instanceof THREE.Camera);
      });
      this.scene_.remove.apply(this.scene_, objs);
      var newObjs = objs.map(function(obj) {
        obj.geometry = obj.geometry.clone();
        obj.material = obj.material.clone();
        return obj.clone();
      });
      this.scene_.add.apply(this.scene_, newObjs);
      this.applyDrawOptions();
    }
    this.createRenderer(bool_noWebGL);
    this.animate();
  },
  drawAxes: function(axLen) {
    var axes = this.options.axes;
    var size = (axes.size || this.options.grid.size)/2;

    function v(x,y,z){
      return new THREE.Vector3(x,y,z);
    }
    var origin = v(0, 0, 0);
    "x y z".split(" ").forEach(function(axis) {

      var linePos = new THREE.Geometry();
      linePos.vertices.push(origin, v(axis === "x" ? size : 0, axis === "y" ? size : 0, axis === "z" ? size : 0));
      this.scene_.add(new THREE.Line(
        linePos,
        new THREE.LineBasicMaterial({color: rgbTo24Bit(axes[axis].pos), opacity: axes[axis].pos.a, transparent: true, lineWidth: 1})
      ))
      var lineNeg = new THREE.Geometry();
      lineNeg.vertices.push(origin, v(axis === "x" ? -size : 0, axis === "y" ? -size : 0, axis === "z" ? -size : 0));
      this.scene_.add(new THREE.Line(
        lineNeg,
        new THREE.LineBasicMaterial({color: rgbTo24Bit(axes[axis].neg), opacity: axes[axis].neg.a, transparent: true, lineWidth: 1})
      ))
    }, this);
  },
  drawGrid: function () {
    var m = this.options.grid.m; // short cut
    var M = this.options.grid.M; // short cut
    var size = this.options.grid.size/2;
    var size = 100, step = 1;
    var g_m = new THREE.Geometry();
    var g_M = new THREE.Geometry();
    for ( var i = - size; i <= size; i += step ) {
      var g = i % 10 ? g_m : g_M;
      g.vertices.push( new THREE.Vector3( - size, i, 0 ) );
      g.vertices.push( new THREE.Vector3(   size, i, 0 ) );
      g.vertices.push( new THREE.Vector3( i, - size, 0 ) );
      g.vertices.push( new THREE.Vector3( i,   size, 0 ) );
    }
    var material_m = new THREE.LineBasicMaterial( { color: rgbTo24Bit(m.color), opacity: m.color.a, transparent: true } );
    var material_M = new THREE.LineBasicMaterial( { color: rgbTo24Bit(M.color), opacity: M.color.a, transparent: true } );
    var line_m = THREE.LineSegments ? new THREE.LineSegments( g_m, material_m ) : new THREE.Line( g_m, material_m, THREE.LinePieces );
    this.scene_.add( line_m );
    var line_M = THREE.LineSegments ? new THREE.LineSegments( g_M, material_M ) : new THREE.Line( g_M, material_M, THREE.LinePieces );
    this.scene_.add( line_M );
  },
  applyDrawOptions: function() {
    this.getUserMeshes('faces').forEach(function(faceMesh) {
      faceMesh.visible = !!this.options.solid.faces;
    }, this);
    this.getUserMeshes('lines').forEach(function(lineMesh) {
      lineMesh.visible = !!this.options.solid.lines;
    }, this);
    this.render();
  },
  setCsg: function(csg, resetZoom) {
    this.clear();

    var faceColor = this.options.solid.faceColor;

    // default is opaque if not defined otherwise
    var defaultColor_ = [faceColor.r, faceColor.g, faceColor.b, faceColor.a || 1];

    var res = THREE.CSG.fromCSG(csg, defaultColor_, this.options.solid.overlay);
    var colorMeshes = [].concat(res.colorMesh)
    .map(function(mesh) {
      mesh.userData = {faces: true};
      return mesh;
    });
    var wireMesh = res.wireframe;
    wireMesh.userData = {lines: true};
    this.scene_.add.apply(this.scene_, colorMeshes);
    this.scene_.add(wireMesh);
    resetZoom && this.resetZoom(res.boundLen);
    this.applyDrawOptions();
  },
  clear: function() {
    this.scene_.remove.apply(this.scene_, this.getUserMeshes());
  },
  // gets the meshes created by setCsg
  getUserMeshes: function(str) {
    return this.scene_.children.filter(function(ch) {
      if (str) {
        return ch.userData[str];
      } else {
        return ch.userData.lines || ch.userData.faces;
      }
    });
  },
  resetZoom: function(r) {
    if (!r) {
      // empty object - any default zoom
      r = 10;
    }
    var d = r / Math.tan(this.perspective * Math.PI / 180);
    // play here for different start zoom
    this.camera_.position.set(d*2, d*2, d);
    this.camera_.zoom = 1;
    this.camera_.lookAt(this.scene_.position);
    this.camera_.updateProjectionMatrix();
  },
  handleResize: function() {
    var canvas = this.canvas;

    this.resizeCanvas (canvas);

    this.camera_.aspect = canvas.width/canvas.height;
    this.camera_.updateProjectionMatrix();
    // set canvas attributes (false => don't set css)
    this.renderer_.setSize(canvas.width, canvas.height, false);
    this.render();
  }
};


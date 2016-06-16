// A viewer is a WebGL canvas that lets the user view a mesh. The user can
// tumble it around by dragging the mouse.
OpenJsCad.Viewer = function(containerElm, size, options) {
    // config stuff
    // fg and bg colors
    var defaultBgColor = [0.93, 0.93, 0.93];
    var defaultMeshColor = [0, 0, 1];
    var drawAxes = true;
    var axLength = 1000;
    this.perspective = 45; // in degrees
    this.drawOptions = {
      // Draw black triangle lines ("wireframe")
      lines: options.drawLines,
      // Draw surfaces
      faces: options.drawFaces
    };
    // end config stuff

    this.size = size;
    this.defaultColor_ = options.color || defaultMeshColor;
    // default is opaque if not defined otherwise
    if (this.defaultColor_.length == 3) {
      this.defaultColor_.push(1);
    }
    this.bgColor_ = new THREE.Color();
    this.bgColor_.setRGB.apply(this.bgColor_, options.bgColor || defaultBgColor);
    // the elm to contain the canvas
    this.containerElm_ = containerElm;

    this.createScene(drawAxes, axLength);
    this.createCamera();
    this.parseSizeParams();
    // createRenderer will also call render
    this.createRenderer(options.noWebGL);
    this.animate();
};

OpenJsCad.Viewer.prototype = {
    // adds axes too
    createScene: function(drawAxes, axLen) {
      var scene = new THREE.Scene();
      this.scene_ = scene;
      if (drawAxes) {
        this.drawAxes(axLen);
      }
    },
    createCamera: function() {
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
      var renderer = new Renderer({precision: 'highp'});
      this.renderer_ = renderer;

      if (this.canvas) {
        this.canvas.remove();
      }
      this.canvas = renderer.domElement;
      this.containerElm_.appendChild(this.canvas);
      // scene.fog = new THREE.FogExp2( 0xcccccc, 0.002 )
      renderer.setClearColor(this.bgColor_);
      // renderer.setClearColor(scene.fog.color);
      // and add controls
      this.createControls(renderer.domElement);

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
    // https://www.youtube.com/watch?v=c-O-tOYdAFY#t=858 (pause) for a basic grid
    drawAxes: function(axLen) {
        axLen = axLen || 1000;
        function v(x,y,z){
            return new THREE.Vector3(x,y,z);
        }
        var origin = v(0, 0, 0);
        [[v(axLen, 0, 0), 0xFF0000], [v(-axLen, 0, 0), 0xD3D3D3],
         [v(0, axLen, 0), 0x00FF00], [v(0, -axLen, 0), 0xD3D3D3],
         [v(0, 0, axLen), 0x0000FF], [v(0, 0, -axLen), 0xD3D3D3]]
            .forEach(function(axdef) {
                var lineGeometry = new THREE.Geometry();
                lineGeometry.vertices.push(origin, axdef[0]);
                this.scene_.add(new THREE.Line(lineGeometry,
                    new THREE.LineBasicMaterial({color: axdef[1], lineWidth: 1})))
        }, this);
    },
    setCsg: function(csg, resetZoom) {
        this.clear();
        var res = THREE.CSG.fromCSG(csg, this.defaultColor_);
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
    applyDrawOptions: function() {
        this.getUserMeshes('faces').forEach(function(faceMesh) {
          faceMesh.visible = !!this.drawOptions.faces;
        }, this);
        this.getUserMeshes('lines').forEach(function(lineMesh) {
          lineMesh.visible = !! this.drawOptions.lines;
        }, this);
        this.render();
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
    parseSizeParams: function() {
        // essentially, allow all relative + px. Not cm and such.
        var winResizeUnits = ['%', 'vh', 'vw', 'vmax', 'vmin'];
        var width, height;
        if (!this.size.width) {
            this.size.width = this.size.widthDefault;
        }
        if (!this.size.height) {
            this.size.height = this.size.heightDefault;
        }
        var wUnit = this.size.width.match(/^(\d+(?:\.\d+)?)(.*)$/)[2];
        var hUnit = typeof this.size.height == 'string' ?
            this.size.height.match(/^(\d+(?:\.\d+)?)(.*)$/)[2] :
            '';
        // whether unit scales on win resize
        var isDynUnit = winResizeUnits.indexOf(wUnit) != -1 ||
            winResizeUnits.indexOf(hUnit) != -1;
        // e.g if units are %, need to keep resizing canvas with dom
        if (isDynUnit) {
            window.addEventListener('resize', this.handleResize.bind(this))
        }
    },
    handleResize: function() {
        var hIsRatio = typeof this.size.height != 'string';
        // apply css, then check px size. This is in case css is not in px
        this.canvas.style.width = this.size.width;
        if (!hIsRatio) {
            this.canvas.style.height = this.size.height;
        }
        var widthInPx = this.canvas.clientWidth;
        var heightInPx = hIsRatio ?
            widthInPx * this.size.height :
            this.canvas.clientHeight;  // size.height.match(/^(\d+(?:\.\d+)?)(.*)$/)[1];

        this.camera_.aspect = widthInPx/heightInPx;
        this.camera_.updateProjectionMatrix();
        // set canvas attributes (false => don't set css)
        this.renderer_.setSize(widthInPx, heightInPx, false);
        this.render();
    }
};


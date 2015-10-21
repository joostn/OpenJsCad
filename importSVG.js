/*
## License

Copyright (c) 2015 Z3 Development https://github.com/z3dev

All code released under MIT license

Notes:
1) All functions extend CAG object definitions in order to maintain the namespace.
*/

// import the required modules if necessary
if(typeof module !== 'undefined') {    // used via nodejs
  if (typeof module.CAG === 'undefined') {
    CAG = require(lib+'csg.js').CAG;
  }
  var sax = require("./sax-js-1.1.3/lib/sax");
}

(function(module) {

////////////////////////////////////////////
//
// SVG is a language for describing two-dimensional graphics in XML
// See http://www.w3.org/TR/SVG/Overview.html
//
////////////////////////////////////////////

// standard pixel size at arms length on 90dpi screens
sax.SAXParser.prototype.cssPxUnit = 0.28;

// units for converting CSS2 points/length, i.e. CSS2 value / pxPmm
sax.SAXParser.prototype.pxPmm = 1 / 0.28;              // used for scaling SVG coordinates(PX) to CAG coordinates(MM)
sax.SAXParser.prototype.inchMM = 1 / (1/0.039370);     // used for scaling SVG coordinates(IN) to CAG coordinates(MM)
sax.SAXParser.prototype.ptMM = 1 / (1/0.039370/72);    // used for scaling SVG coordinates(IN) to CAG coordinates(MM)
sax.SAXParser.prototype.pcMM = 1 / (1/0.039370/72*12); // used for scaling SVG coordinates(PC) to CAG coordinates(MM)

// standard SVG named colors (sRGB values)
sax.SAXParser.prototype.svgColors = {
      'aliceblue':            [240, 248, 255],
      'antiquewhite':         [250, 235, 215],
      'aqua':                 [  0, 255, 255],
      'aquamarine':           [127, 255, 212],
      'azure':                [240, 255, 255],
      'beige':                [245, 245, 220],
      'bisque':               [255, 228, 196],
      'black':                [  0,   0,  0],
      'blanchedalmond':       [255, 235, 205],
      'blue':                 [  0,   0, 255],
      'blueviolet':           [138,  43, 226],
      'brown':                [165,  42,  42],
      'burlywood':            [222, 184, 135],
      'cadetblue':            [ 95, 158, 160],
      'chartreuse':           [127, 255,   0],
      'chocolate':            [210, 105,  30],
      'coral':                [255, 127,  80],
      'cornflowerblue':       [100, 149, 237],
      'cornsilk':             [255, 248, 220],
      'crimson':              [220,  20,  60],
      'cyan':                 [  0, 255, 255],
      'darkblue':             [  0,   0, 139],
      'darkcyan':             [  0, 139, 139],
      'darkgoldenrod':        [184, 134,  11],
      'darkgray':             [169, 169, 169],
      'darkgreen':            [  0, 100,   0],
      'darkgrey':             [169, 169, 169],
      'darkkhaki':            [189, 183, 107],
      'darkmagenta':          [139,   0, 139],
      'darkolivegreen':       [ 85, 107,  47],
      'darkorange':           [255, 140,   0],
      'darkorchid':           [153,  50, 204],
      'darkred':              [139,   0,   0],
      'darksalmon':           [233, 150, 122],
      'darkseagreen':         [143, 188, 143],
      'darkslateblue':        [ 72,  61, 139],
      'darkslategray':        [ 47,  79,  79],
      'darkslategrey':        [ 47,  79,  79],
      'darkturquoise':        [  0, 206, 209],
      'darkviolet':           [148,   0, 211],
      'deeppink':             [255,  20, 147],
      'deepskyblue':          [  0, 191, 255],
      'dimgray':              [105, 105, 105],
      'dimgrey':              [105, 105, 105],
      'dodgerblue':           [ 30, 144, 255],
      'firebrick':            [178,  34,  34],
      'floralwhite':          [255, 250, 240],
      'forestgreen':          [ 34, 139,  34],
      'fuchsia':              [255,   0, 255],
      'gainsboro':            [220, 220, 220],
      'ghostwhite':           [248, 248, 255],
      'gold':                 [255, 215,   0],
      'goldenrod':            [218, 165,  32],
      'gray':                 [128, 128, 128],
      'grey':                 [128, 128, 128],
      'green':                [  0, 128,   0],
      'greenyellow':          [173, 255,  47],
      'honeydew':             [240, 255, 240],
      'hotpink':              [255, 105, 180],
      'indianred':            [205,  92,  92],
      'indigo':               [ 75,   0, 130],
      'ivory':                [255, 255, 240],
      'khaki':                [240, 230, 140],
      'lavender':             [230, 230, 250],
      'lavenderblush':        [255, 240, 245],
      'lawngreen':            [124, 252,   0],
      'lemonchiffon':         [255, 250, 205],
      'lightblue':            [173, 216, 230],
      'lightcoral':           [240, 128, 128],
      'lightcyan':            [224, 255, 255],
      'lightgoldenrodyellow': [250, 250, 210],
      'lightgray':            [211, 211, 211],
      'lightgreen':           [144, 238, 144],
      'lightgrey':            [211, 211, 211],
      'lightpink':            [255, 182, 193],
      'lightsalmon':          [255, 160, 122],
      'lightseagreen':        [ 32, 178, 170],
      'lightskyblue':         [135, 206, 250],
      'lightslategray':       [119, 136, 153],
      'lightslategrey':       [119, 136, 153],
      'lightsteelblue':       [176, 196, 222],
      'lightyellow':          [255, 255, 224],
      'lime':                 [  0, 255,   0],
      'limegreen':            [ 50, 205,  50],
      'linen':                [250, 240, 230],
      'magenta':              [255,   0, 255],
      'maroon':               [128,   0,   0],
      'mediumaquamarine':     [102, 205, 170],
      'mediumblue':           [  0,   0, 205],
      'mediumorchid':         [186,  85, 211],
      'mediumpurple':         [147, 112, 219],
      'mediumseagreen':       [ 60, 179, 113],
      'mediumslateblue':      [123, 104, 238],
      'mediumspringgreen':    [  0, 250, 154],
      'mediumturquoise':      [ 72, 209, 204],
      'mediumvioletred':      [199,  21, 133],
      'midnightblue':         [ 25,  25, 112],
      'mintcream':            [245, 255, 250],
      'mistyrose':            [255, 228, 225],
      'moccasin':             [255, 228, 181],
      'navajowhite':          [255, 222, 173],
      'navy':                 [  0,   0, 128],
      'oldlace':              [253, 245, 230],
      'olive':                [128, 128,   0],
      'olivedrab':            [107, 142,  35],
      'orange':               [255, 165,   0],
      'orangered':            [255,  69,   0],
      'orchid':               [218, 112, 214],
      'palegoldenrod':        [238, 232, 170],
      'palegreen':            [152, 251, 152],
      'paleturquoise':        [175, 238, 238],
      'palevioletred':        [219, 112, 147],
      'papayawhip':           [255, 239, 213],
      'peachpuff':            [255, 218, 185],
      'peru':                 [205, 133,  63],
      'pink':                 [255, 192, 203],
      'plum':                 [221, 160, 221],
      'powderblue':           [176, 224, 230],
      'purple':               [128,   0, 128],
      'red':                  [255,   0,   0],
      'rosybrown':            [188, 143, 143],
      'royalblue':            [ 65, 105, 225],
      'saddlebrown':          [139,  69,  19],
      'salmon':               [250, 128, 114],
      'sandybrown':           [244, 164,  96],
      'seagreen':             [ 46, 139,  87],
      'seashell':             [255, 245, 238],
      'sienna':               [160,  82,  45],
      'silver':               [192, 192, 192],
      'skyblue':              [135, 206, 235],
      'slateblue':            [106,  90, 205],
      'slategray':            [112, 128, 144],
      'slategrey':            [112, 128, 144],
      'snow':                 [255, 250, 250],
      'springgreen':          [  0, 255, 127],
      'steelblue':            [ 70, 130, 180],
      'tan':                  [210, 180, 140],
      'teal':                 [  0, 128, 128],
      'thistle':              [216, 191, 216],
      'tomato':               [255,  99,  71],
      'turquoise':            [ 64, 224, 208],
      'violet':               [238, 130, 238],
      'wheat':                [245, 222, 179],
      'white':                [255, 255, 255],
      'whitesmoke':           [245, 245, 245],
      'yellow':               [255, 255,   0],
      'yellowgreen':          [154, 205,  50],
    };

// Calculate the CAG length/size from the given CSS (SVG) value
sax.SAXParser.prototype.cagLength = function(css) {
  var v = parseFloat(css); // number part
  if (isNaN(v)) { v = 0; }
  if (v == 0) return v;
  if (css.search(/EM/i) > 0) {
    return v; // font size
  } else
  if (css.search(/EX/i) > 0) {
    return v; // x-height of font
  } else
  if (css.search(/MM/i) > 0) {
    return v; // absolute milimeters
  } else
  if (css.search(/CM/i) > 0) {
    return (v * 10).toFixed(4); // absolute centimeters > millimeters
  } else
  if (css.search(/IN/i) > 0) {
    return (v / inchMM).toFixed(4); // absolute inches > millimeters
  } else
  if (css.search(/PT/i) > 0) {
    return (v / ptMM).toFixed(4); // absolute points > millimeters
  } else
  if (css.search(/PC/i) > 0) {
    return (v / pcMM).toFixed(4); // absolute picas > millimeters
  }
  return (v / this.pxPmm).toFixed(4); // absolute pixels > millimeters
}

// convert the SVG color specification to CAG RGB
sax.SAXParser.prototype.cagColor = function(value) {
//  var rgb = [0,0,0]; // default is black
  var rgb = null;
  value = value.toLowerCase();
  if (value in this.svgColors) {
    rgb = this.svgColors[value];
    rgb = [rgb[0]/255,rgb[1]/255,rgb[2]/255]; // converted to 0.0-1.0 values
  } else {
    if (value[0] == '#') {
      if (value.length == 4) {
      // short HEX specification
        value = '#'+value[1]+value[1]+value[2]+value[2]+value[3]+value[3];
      }
      if (value.length == 7) {
      // HEX specification
        rgb = [ parseInt('0x'+value.slice(1,3))/255,
                parseInt('0x'+value.slice(3,5))/255,
                parseInt('0x'+value.slice(5,7))/255 ];
      }
    } else {
      var pat = /rgb\(.+,.+,.+\)/;
      var s = pat.exec(value);
      if (s !== null) {
      // RGB specification
        s = s[0];
        s = s.slice(s.indexOf('(')+1,s.indexOf(')'));
        rgb = s.split(',');
        if (s.indexOf('%') > 0) {
        // rgb(#%,#%,#%)
          rgb = [parseInt(rgb[0]),parseInt(rgb[1]),parseInt(rgb[2])];
          rgb = [rgb[0]/100,rgb[1]/100,rgb[2]/100]; // converted to 0.0-1.0 values
        } else {
        // rgb(#,#,#)
          rgb = [parseInt(rgb[0]),parseInt(rgb[1]),parseInt(rgb[2])];
          rgb = [rgb[0]/255,rgb[1]/255,rgb[2]/255]; // converted to 0.0-1.0 values
        }
      }
    }
  }
  return rgb;
}

sax.SAXParser.prototype.cssStyle = function(element,name) {
  if ('STYLE' in element) {
    var list = element.STYLE;
    var pat = name+'\\s*:\\s*\\S+;';
    var exp = new RegExp(pat,'i');
    var v = exp.exec(list);
    if (v !== null) {
      v = v[0];
      var i = v.length;
      while (v[i] != ' ') i--;
      v = v.slice(i+1,v.length-1);
      return v;
    }
  }
  return null;
}

sax.SAXParser.prototype.svgCore = function(obj,element) {
  if ('ID' in element) { obj.id = element.ID; }
}

sax.SAXParser.prototype.svgPresentation = function(obj,element) {
// presentation attributes for all
  if ('DISPLAY' in element) { obj.visible = element.DISPLAY; }
// presentation attributes for solids
  if ('COLOR' in element) { obj.fill = cagColor(element.COLOR); }
  if ('OPACITY' in element) { obj.opacity = element.OPACITY; }
  if ('FILL' in element) {
    obj.fill = this.cagColor(element.FILL);
  } else {
    var s = this.cssStyle(element,'fill');
    if (s !== null) {
      obj.fill = this.cagColor(s);
    }
  }
  if ('FILL-OPACITY' in element) { obj.opacity = element.FILL-OPACITY; }
// presentation attributes for lines
  if ('STROKE-WIDTH' in element) {
    obj.strokeWidth = this.cagLength(element['STROKE-WIDTH']);
  } else {
    var sw = this.cssStyle(element,'stroke-width');
    if (sw !== null) {
      obj.strokeWidth = this.cagLength(sw);
    }
  }
  if ('STROKE' in element) {
    obj.stroke = this.cagColor(element.STROKE);
  } else {
    var s = this.cssStyle(element,'stroke');
    if (s !== null) {
      obj.stroke = this.cagColor(s);
    }
  }
  if ('STROKE-OPACITY' in element) { obj.strokeOpacity = element['STROKE-OPACITY']; }
}

sax.SAXParser.prototype.svgTransforms = function(cag,element) {
  var list = null;
  if ('TRANSFORM' in element) {
    list = element.TRANSFORM;
  } else {
    var s = this.cssStyle(element,'transform');
    if (s !== null) { list = s; }
  }
  if (list !== null) {
  // matrix | translate | scale | rotate | skewX | skewY
    var exp = new RegExp('\\w+\\(.+\\)','i');
    var v = exp.exec(list);
    while (v !== null) {
      var s = exp.lastIndex;
      var e = list.indexOf(')')+1;
      var t = list.slice(s,e); // the transform
      t = t.trim();
    // add the transform to the CAG
      var n = t.slice(0,t.indexOf('('));
      var a = t.slice(t.indexOf('(')+1,t.indexOf(')')).trim();
      if (a.indexOf(',') > 0) { a = a.split(','); } else { a = a.split(' '); }
      switch (n) {
        case 'translate':
          if (a.length == 1) a.push(0); // as per SVG
          cag.translate = [this.cagLength(a[0]),this.cagLength(a[1])];
          break;
        case 'scale':
          if (a.length == 1) a.push(a[0]); // as per SVG
          cag.scale = a;
          break;
        case 'rotate':
          cag.rotate = a;
          break;
        //case 'matrix':
        //case 'skewX':
        //case 'skewY':
        default:
          break;
      }
    // shorten the list and continue
      list = list.slice(e,list.length);
      v = exp.exec(list);
    }
  }
}

// treat each SVG element like a group
sax.SAXParser.prototype.svgSvg = function(element) {
  var obj = {type: 'svg', width: 300, height: 300}; // default viewport with CAG coordinates

  if ('WIDTH' in element) { obj.width = this.cagLength(element.WIDTH); }
  if ('HEIGHT' in element) { obj.height = this.cagLength(element.HEIGHT); }
  if ('PXPMM' in element) {
  // WOW! a supplied value for pixel widths!!!
    this.pxPmm = parseFloat(element.PXPMM);
    if (isNaN(this.pxPmm)) { this.pxPmm = 1/cssPxUnit; } // use the default calculation
    if (this.svgGroups.length == 0) {
      obj.pxpmm = this.pxPmm;
      console.log('*****PIXELS PER MM: '+this.pxPmm);
    }
  }

// core attributes
  this.svgCore(obj,element);
// presentation attributes
  this.svgPresentation(obj,element);

  obj.objects = [];
  return obj;
}

sax.SAXParser.prototype.svgEllipse = function(element) {
  var obj = {type: 'ellipse'};
  obj.cx = 0;
  obj.cy = 0;
  obj.rx = 0;
  obj.ry = 0;
  if ('RX' in element) { obj.rx = this.cagLength(element.RX); }
  if ('RY' in element) { obj.ry = this.cagLength(element.RY); }
// transforms
  this.svgTransforms(obj,element);
// core attributes
  this.svgCore(obj,element);
// presentation attributes
  this.svgPresentation(obj,element);
  return obj;
}

sax.SAXParser.prototype.svgLine = function(element) {
  var obj = {type: 'line'};
  obj.x1 = 0;
  obj.y1 = 0;
  obj.x2 = 0;
  obj.y2 = 0;
  obj.strokeWidth  = 0; // width of line, from style: stroke-width
  if ('X1' in element) { obj.x1 = this.cagLength(element.X1); }
  if ('Y1' in element) { obj.y1 = this.cagLength(element.Y1); }
  if ('X2' in element) { obj.x2 = this.cagLength(element.X2); }
  if ('Y2' in element) { obj.y2 = this.cagLength(element.Y2); }
// transforms
  this.svgTransforms(obj,element);
// core attributes
  this.svgCore(obj,element);
// presentation attributes
  this.svgPresentation(obj,element);
  return obj;
}

sax.SAXParser.prototype.svgListOfPoints = function(list) {
  var points = [];
  var exp = new RegExp('\\s*\\S+\\s*,\\s*\\S+','i');
  var v = exp.exec(list);
  while (v !== null) {
    var point = v[0];
    var next = exp.lastIndex+point.length;
    point = point.trim();
    point = point.split(',');
    point = {x: this.cagLength(point[0]), y: this.cagLength(point[1]) };
    points.push(point);
    list = list.slice(next,list.length);
    v = exp.exec(list);
  }
  return points;
}

sax.SAXParser.prototype.svgPolyline = function(element) {
  var obj = {type: 'polyline'};
// transforms
  this.svgTransforms(obj,element);
// core attributes
  this.svgCore(obj,element);
// presentation attributes
  this.svgPresentation(obj,element);

  if ('POINTS' in element) {
    obj.points = this.svgListOfPoints(element.POINTS);
  }
  return obj;
}

sax.SAXParser.prototype.svgPolygon = function(element) {
  var obj = {type: 'polygon'};
// transforms
  this.svgTransforms(obj,element);
// core attributes
  this.svgCore(obj,element);
// presentation attributes
  this.svgPresentation(obj,element);

  if ('POINTS' in element) {
    obj.points = this.svgListOfPoints(element.POINTS);
  }
  return obj;
}

sax.SAXParser.prototype.svgRect = function(element) {
  var obj = {type:'rect'};
  obj.x = 0;
  obj.y = 0;
  obj.rx = 0;
  obj.ry = 0;
  obj.width = 0;
  obj.height = 0;
  if ('X' in element) { obj.x = this.cagLength(element.X); }
  if ('Y' in element) { obj.y = this.cagLength(element.Y); }
  if ('RX' in element) {
    obj.rx = this.cagLength(element.RX);
    if (!('RY' in element)) { obj.ry = obj.rx } // by SVG specification
  }
  if ('RY' in element) {
    obj.ry = this.cagLength(element.RY);
    if (!('RX' in element)) { obj.rx = obj.ry } // by SVG specification
  }
  if (obj.rx != obj.ry) {
    console.log('Warning: SVG element contains unsupported RX RY radius');
  }
  if ('WIDTH' in element) { obj.width = this.cagLength(element.WIDTH); }
  if ('HEIGHT' in element) { obj.height = this.cagLength(element.HEIGHT); }
// transforms
  this.svgTransforms(obj,element);
// core attributes
  this.svgCore(obj,element);
// presentation attributes
  this.svgPresentation(obj,element);
  return obj;
}

sax.SAXParser.prototype.svgCircle = function(element) {
  var obj = {type: 'circle'};
  obj.x = 0;
  obj.y = 0;
  obj.radius = 0;
  if ('CX' in element) { obj.x = this.cagLength(element.CX); }
  if ('CY' in element) { obj.y = this.cagLength(element.CY); }
  if ('R' in element) { obj.radius = this.cagLength(element.R); }
// transforms
  this.svgTransforms(obj,element);
// core attributes
  this.svgCore(obj,element);
// presentation attributes
  this.svgPresentation(obj,element);
  return obj;
}

sax.SAXParser.prototype.svgGroup = function(element) {
  var obj = {type:'group'};
// transforms
  this.svgTransforms(obj,element);
// core attributes
  this.svgCore(obj,element);
// presentation attributes
  this.svgPresentation(obj,element);

  obj.objects = [];
  return obj;
}

// generate GROUP with attributes from USE element
// - except X,Y,HEIGHT,WIDTH,XLINK:HREF
// - append translate(x,y) if X,Y available
// deep clone the referenced OBJECT and add to group
// - clone using JSON.parse(JSON.stringify(obj))
sax.SAXParser.prototype.svgUse = function(element) {
  var obj = {type:'group'};
// transforms
  this.svgTransforms(obj,element);
// core attributes
  this.svgCore(obj,element);
// presentation attributes
  this.svgPresentation(obj,element);

  if ('X' in element && 'Y' in element) {
    var x = this.cagLength(element.X);
    var y = this.cagLength(element.Y);
    obj.translate = [this.cagLength(x),this.cagLength(y)];
  }

  obj.objects = [];
  if ('XLINK:HREF' in element) {
  // lookup the named object
    var ref = element['XLINK:HREF'];
    if (ref[0] == '#') { ref = ref.slice(1,ref.length); }
    if (this.svgObjects[ref] !== undefined) {
      ref = this.svgObjects[ref];
      ref = JSON.parse(JSON.stringify(ref));
    // TBD apply presentation attributes from the group
      obj.objects.push(ref);
    }
  }
  return obj;
}

// processing controls
sax.SAXParser.prototype.svgObjects = [];    // named objects
sax.SAXParser.prototype.svgGroups  = [];    // groups of objects
sax.SAXParser.prototype.svgInDefs  = false; // svg DEFS element in process
sax.SAXParser.prototype.svgObj     = null;  // svg in object form

CAG.codify = function(group,level) {
  var indent = '  ';
  var i = level;
  while (i > 0) {
    indent += '  ';
    i--;
  }
// pre-code
  var code = '';
  if (level == 0) {
    code += 'function main(p) {\n';
  }
  var ln = 'cag'+level;
  code += indent + 'var '+ln+' = CAG.rectangle({radius: [0.01,0.01]});\n';
// generate code for all objects
  for (i = 0; i < group.objects.length; i++) {
    var obj = group.objects[i];
    var on  = ln+i;
    switch (obj.type) {
      case 'group':
        code += CAG.codify(obj,level+1);
        code += indent+'var '+on+' = cag'+(level+1)+';\n';
        break;
      case 'rect':
        if (obj.rx == 0) {
          code += indent+'var '+on+' = CAG.rectangle({center: ['+obj.x+','+obj.y+'], radius: ['+obj.width/2+','+obj.height/2+']});\n';
        } else {
          code += indent+'var '+on+' = CAG.roundedRectangle({center: ['+obj.x+','+obj.y+'], radius: ['+obj.width/2+','+obj.height/2+'], roundradius: '+obj.rx+'});\n';
        }
        break;
      case 'circle':
        code += indent+'var '+on+' = CAG.circle({center: ['+obj.x+','+obj.y+'], radius: '+obj.radius+'});\n';
        break;
      case 'ellipse':
        code += indent+'var '+on+' = CAG.circle({center: ['+obj.cx+','+obj.cy+'], radius: '+obj.rx+'}).scale([1,'+obj.ry/obj.rx+']);\n';
        break;
      case 'line':
      // FIXME when CAG.line is available
        code += indent+'var '+on+' = new CSG.Path2D([['+obj.x1+','+obj.y1+'],['+obj.x2+','+obj.y2+']],false);\n';
        code += indent+on+' = '+on+'.expandToCAG('+obj.strokeWidth/2+',CSG.defaultResolution2D);\n';
        break;
      case 'polygon':
        code += indent+'var '+on+' = CAG.fromPoints([\n';
        var j = 0;
        for (j = 0; j < obj.points.length; j++) {
          var p = obj.points[j];
          if ('x' in p && 'y' in p) {
            code += indent+'  ['+p.x+','+p.y+'],\n';
          }
        }
        code += indent+']);\n';
        break;
      case 'polyline':
      // FIXME when CAG.line is available
        code += indent+'var '+on+' = new CSG.Path2D([\n';
        var j = 0;
        for (j = 0; j < obj.points.length; j++) {
          var p = obj.points[j];
          if ('x' in p && 'y' in p) {
            code += indent+'  ['+p.x+','+p.y+'],\n';
          }
        }
        code += indent+'],false);\n';
        code += indent+on+' = '+on+'.expandToCAG('+obj.strokeWidth/2+',CSG.defaultResolution2D);\n';
        break;
      default:
        break;
    }
    if ('rotate' in obj) {
      code += indent+on+' = '+on+'.rotateZ(-('+obj.rotate[0]+'));\n';
    }
    if ('translate' in obj) {
      code += indent+on+' = '+on+'.translate(['+obj.translate[0]+','+obj.translate[1]+']);\n';
    }
    if ('scale' in obj) {
      code += indent+on+' = '+on+'.scale(['+obj.scale[0]+','+obj.scale[1]+']);\n';
    }
    if ('fill' in obj) {
    // FIXME when CAG supports color
    //  code += indent+on+' = '+on+'.setColor(['+obj.fill[0]+','+obj.fill[1]+','+obj.fill[2]+']);\n';
    }
    code += indent + ln +' = '+ln+'.union('+on+');\n';
  }
// post-code
  if (level == 0) {
    code += indent+'return '+ln+';\n';
    code += '}\n';
  }
  return code;
}

CAG.parseSVG = function(src) {

// create a parser for the XML
  var parser = sax.parser(false, {trim: true, lowercase: false, position: true});
// extend the parser with functions
  parser.onerror = function (e) {
    console.log('error: line '+e.line+', column '+e.column+', bad character ['+e.c+']');
  };

  //parser.ontext = function (t) {
  //};

  parser.onopentag = function (node) {
    //console.log('opentag: '+node.name+' at line '+this.line+' position '+this.column);
    //for (x in node.attributes) {
    //  console.log('    '+x+'='+node.attributes[x]);
    //}
    var obj = null;
    switch (node.name) {
      case 'SVG':
        obj = this.svgSvg(node.attributes);
        break;
      case 'G':
        obj = this.svgGroup(node.attributes);
        break;
      case 'RECT':
        obj = this.svgRect(node.attributes);
        break;
      case 'CIRCLE':
        obj = this.svgCircle(node.attributes);
        break;
      case 'ELLIPSE':
        obj = this.svgEllipse(node.attributes);
        break;
      case 'LINE':
        obj = this.svgLine(node.attributes);
        break;
      case 'POLYLINE':
        obj = this.svgPolyline(node.attributes);
        break;
      case 'POLYGON':
        obj = this.svgPolygon(node.attributes);
        break;
      //case 'SYMBOL':
      // this is just like an embedded SVG but does NOT render directly, only named
      // only add to named objects for later USE
      //  break;
      case 'PATH':
        break;
      case 'USE':
        obj = this.svgUse(node.attributes);
        break;
      case 'DEFS':
        this.svgInDefs = true;
        console.log('DEFS start ['+this.svgInDefs+']');
        break;
      case 'DESC':
      case 'TITLE':
      case 'STYLE':
      // ignored by design
        break;
      default:
        console.log('Warning: Unsupported SVG element: '+node.name);
        break;
    }

    if (obj !== null) {
    // add to named objects if necessary
      if ('id' in obj) {
        this.svgObjects[obj.id] = obj;
        console.log('saved object ['+obj.id+','+obj.type+']');
      }
      if (obj.type == 'svg') {
      // initial SVG (group)
        this.svgGroups.push(obj);
      } else {
      // add the object to the active group if necessary
        if (this.svgGroups.length > 0 && this.svgInDefs == false) {
          var group = this.svgGroups.pop();
          if ('objects' in group) {
            console.log('push object ['+obj.type+']');
            //console.log(JSON.stringify(obj));
          // TBD apply presentation attributes from the group
            group.objects.push(obj);
          }
          this.svgGroups.push(group);
        }
        if (obj.type == 'group') {
        // add GROUPs to the stack
          this.svgGroups.push(obj);
        }
      }
    }
  };

  parser.onclosetag = function (node) {
    //console.log('closetag: '+node);
    var obj = null;
    switch (node) {
      case 'SVG':
        obj = this.svgGroups.pop();
        //console.log("groups: "+groups.length);
        break;
      case 'DEFS':
        this.svgInDefs = false;
        console.log('DEFS close ['+this.svgInDefs+']');
        break;
      case 'USE':
        obj = this.svgGroups.pop();
        //console.log("groups: "+groups.length);
        break;
      case 'G':
        obj = this.svgGroups.pop();
        //console.log("groups: "+groups.length);
        break;
      default:
        break;
    }
  // check for completeness
    if (this.svgGroups.length === 0) {
      this.svgObj = obj;
    }
  };

  //parser.onattribute = function (attr) {
  //};

  parser.onend = function () {
  //  console.log('SVG parsing completed');
  };
// start the parser
  parser.write(src).close();
// convert the final object to JSCAD code 
  console.log("");
  console.log("******************************");
  console.log("");
  var code = '';
  if (parser.svgObj !== null) {
    console.log(JSON.stringify(parser.svgObj));
    code = CAG.codify(parser.svgObj,0);
  }
  return code;
};

// re-export CAG with the extended prototypes
  module.CAG = CAG;
})(this);


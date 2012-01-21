var _CSGDEBUG=false;

/*
## License

Copyright (c) 2012 Joost Nieuwenhuijse (joost@newhouse.nl) under MIT license

Based on original CSG.js: http://evanw.github.com/csg.js/
Copyright (c) 2011 Evan Wallace under MIT license

## Overview

For an overview of the CSG process see the original csg.js code:
http://evanw.github.com/csg.js/

CSG operations through BSP trees suffer from one problem: heavy fragmentation
of polygons. If two CSG solids of n polygons are unified, the resulting solid may have
in the order of n*n polygons, because each polygon is split by the planes of all other
polygons. After a few operations the number of polygons explodes. 

This version of CSG.js solves the problem in 3 ways:

1. Every polygon split is recorded in a tree (CSG.PolygonTreeNode). This is a separate
tree, not to be confused with the CSG tree. If a polygon is split into two parts but in
the end both fragments have not been discarded by the CSG operation, we can retrieve 
the original unsplit polygon from the tree, instead of the two fragments.

This does not completely solve the issue though: if a polygon is split multiple times
the number of fragments depends on the order of subsequent splits, and we might still
end up with unncessary splits:
Suppose a polygon is first split into A and B, and then into A1, B1, A2, B2. Suppose B2 is
discarded. We will end up with 2 polygons: A and B1. Depending on the actual split boundaries
we could still have joined A and B1 into one polygon. Therefore a second approach is used as well:

2. After CSG operations all coplanar polygon fragments are joined by a retesselating
operation. See CSG.reTesselated(). Retesselation is done through a 
linear sweep over the polygon surface. The sweep line passes over the y coordinates
of all vertices in the polygon. Polygons are split at each sweep line, and the fragments
are joined horizontally and vertically into larger polygons (making sure that we
will end up with convex polygons).
This still doesn't solve the problem completely: due to floating point imprecisions
we may end up with small gaps between polygons, and polygons may not be exactly coplanar
anymore, and as a result the retesselation algorithm may fail to join those polygons.
Therefore:

3. A canonicalization algorithm is implemented: it looks for vertices that have
approximately the same coordinates (with a certain tolerance, say 1e-5) and replaces
them with the same vertex. If polygons share a vertex they will actually point to the 
same CSG.Vertex instance. The same is done for polygon planes. See CSG.canonicalized().


Performance improvements to the original CSG.js:

Replaced the flip() and invert() methods by flipped() and inverted() which don't
modify the source object. This allows to get rid of all clone() calls, so that
multiple polygons can refer to the same CSG.Plane instance etc.

The original union() used an extra invert(), clipTo(), invert() sequence just to remove the 
coplanar front faces from b; this is now combined in a single b.clipTo(a, true) call.    

Detection whether a polygon is in front or in back of a plane: for each polygon
we are caching the coordinates of the bounding sphere. If the bounding sphere is
in front or in back of the plane we don't have to check the individual vertices
anymore.
 

Other additions to the original CSG.js:

CSG.Vector class has been renamed into CSG.Vector3D

Classes for 3D lines, 2D vectors, 2D lines, and methods to find the intersection of 
a line and a plane etc.

Transformations: CSG.transform(), CSG.translate(), CSG.rotate(), CSG.scale()

Extrusion of 2D polygons (CSG.Polygon2D.extrude())

Expanding or contracting a solid: CSG.expand() and CSG.contract(). Creates nice
smooth corners.

The vertex normal has been removed since it complicates retesselation. It's not needed
for solid CAD anyway.

*/

// # class CSG

// Holds a binary space partition tree representing a 3D solid. Two solids can
// be combined using the `union()`, `subtract()`, and `intersect()` methods.

CSG = function() {
  this.polygons = [];
};

// Construct a CSG solid from a list of `CSG.Polygon` instances.
CSG.fromPolygons = function(polygons) {
  var csg = new CSG();
  csg.polygons = polygons;
  return csg;
};

CSG.prototype = {
  toPolygons: function() {
    return this.polygons;
  },

  // Return a new CSG solid representing space in either this solid or in the
  // solid `csg`. Neither this solid nor the solid `csg` are modified.
  // 
  //     A.union(B)
  // 
  //     +-------+            +-------+
  //     |       |            |       |
  //     |   A   |            |       |
  //     |    +--+----+   =   |       +----+
  //     +----+--+    |       +----+       |
  //          |   B   |            |       |
  //          |       |            |       |
  //          +-------+            +-------+
  // 
  union: function(csg) {
    return this.unionSub(csg, true, true);
  },
  
  unionSub: function(csg, retesselate, canonicalize) {
    var a = new CSG.Tree(this.polygons);
    var b = new CSG.Tree(csg.polygons);
    a.clipTo(b, false);
    b.clipTo(a, true);    
    var newpolygons = a.allPolygons().concat(b.allPolygons());
    var csg = CSG.fromPolygons(newpolygons);
    if(canonicalize) csg = csg.canonicalized();
    if(retesselate) csg = csg.reTesselated();              
    return csg;
  },

  // Return a new CSG solid representing space in this solid but not in the
  // solid `csg`. Neither this solid nor the solid `csg` are modified.
  // 
  //     A.subtract(B)
  // 
  //     +-------+            +-------+
  //     |       |            |       |
  //     |   A   |            |       |
  //     |    +--+----+   =   |    +--+
  //     +----+--+    |       +----+
  //          |   B   |
  //          |       |
  //          +-------+
  // 
  subtract: function(csg) {
    return this.subtractSub(csg, true, true);
  },
  
  subtractSub: function(csg, retesselate, canonicalize) {
    var a = new CSG.Tree(this.polygons);
    var b = new CSG.Tree(csg.polygons);
    a.invert();
    a.clipTo(b);
    b.clipTo(a, true);    
    a.addPolygons(b.allPolygons());
    a.invert();
    var csg = CSG.fromPolygons(a.allPolygons());
    if(canonicalize) csg = csg.canonicalized();
    if(retesselate) csg = csg.reTesselated();
    return csg;
  },

  // Return a new CSG solid representing space both this solid and in the
  // solid `csg`. Neither this solid nor the solid `csg` are modified.
  // 
  //     A.intersect(B)
  // 
  //     +-------+
  //     |       |
  //     |   A   |
  //     |    +--+----+   =   +--+
  //     +----+--+    |       +--+
  //          |   B   |
  //          |       |
  //          +-------+
  // 
  intersect: function(csg) {
    return this.intersectSub(csg, true, true);
  },
  
  intersectSub: function(csg, retesselate, canonicalize) {
    var a = new CSG.Tree(this.polygons);
    var b = new CSG.Tree(csg.polygons);
    a.invert();
    b.clipTo(a);
    b.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.addPolygons(b.allPolygons());
    a.invert();
    var csg = CSG.fromPolygons(a.allPolygons());
    if(canonicalize) csg = csg.canonicalized();
    if(retesselate) csg = csg.reTesselated();
    return csg;
  },

  // Return a new CSG solid with solid and empty space switched. This solid is
  // not modified.
  inverse: function() {
    var flippedpolygons = this.polygons.map(function(p) { return p.flipped(); });
    return CSG.fromPolygons(flippedpolygons);
  },
  
  // Affine transformation of CSG object. Returns a new CSG object
  transform: function(matrix4x4) {
    var newpolygons = this.polygons.map(function(p) { return p.transform(matrix4x4); } );
    return CSG.fromPolygons(newpolygons);  
  },

  mirrored: function(plane) {
    var newpolygons = this.polygons.map(function(p) { return p.mirrored(plane); } );
    return CSG.fromPolygons(newpolygons);  
  },
  
  mirroredX: function() {
    var plane = new CSG.Plane(new CSG.Vector3D(1,0,0), 0);
    return this.mirrored(plane);
  },
  
  mirroredY: function() {
    var plane = new CSG.Plane(new CSG.Vector3D(0,1,0), 0);
    return this.mirrored(plane);
  },
  
  mirroredZ: function() {
    var plane = new CSG.Plane(new CSG.Vector3D(0,0,1), 0);
    return this.mirrored(plane);
  },
  
  translate: function(v) {
    return this.transform(CSG.Matrix4x4.translation(v));
  },
  
  scale: function(f) {
    return this.transform(CSG.Matrix4x4.scaling(f));
  },
  
  rotateX: function(deg) {
    return this.transform(CSG.Matrix4x4.rotationX(deg));
  },
  
  rotateY: function(deg) {
    return this.transform(CSG.Matrix4x4.rotationY(deg));
  },
  
  rotateZ: function(deg) {
    return this.transform(CSG.Matrix4x4.rotationZ(deg));
  },
  
  toStlString: function() {
    var result="solid csg.js\n";
    this.polygons.map(function(p){ result += p.toStlString(); });
    result += "endsolid csg.js\n";
    return result;
  },
  
  toString: function() {
    var result = "";
    this.polygons.map(function(p){ result += p.toString(); });
    return result;
  },
  
  // Expand the solid
  // resolution: number of points per 360 degree for the rounded corners
  expand: function(radius, resolution) {
    var result=this;
    this.polygons.map(function(p) {
      var expanded=p.expand(radius, resolution);
      result=result.unionSub(expanded, true, false);
    });
    result = result.canonicalized();
    return result;
  },
  
  // Contract the solid
  // resolution: number of points per 360 degree for the rounded corners
  contract: function(radius, resolution) {
    var result=this;
    this.polygons.map(function(p) {
      var expanded=p.expand(radius, resolution);
      result=result.subtract(expanded);
    });
    return result;
  },

  canonicalized: function () {
    if(this.isCanonicalized)
    {
      return this;
    }
    else
    {
      var factory = new CSG.fuzzyCSGFactory();
      var result = factory.getCSG(this);
      result.isCanonicalized = true;
      return result;
    }
  },
  
  reTesselated: function () {
    if(this.isRetesselated)
    {
      return this;
    }
    else
    {
      var csg=this; //.canonicalized();
      var polygonsPerPlane = {};
      csg.polygons.map(function(polygon) {
        var planetag = polygon.plane.getTag();
        if(! (planetag in polygonsPerPlane) )
        {
          polygonsPerPlane[planetag] = [];
        }
        polygonsPerPlane[planetag].push(polygon);
      });
      var destpolygons = [];
      for(planetag in polygonsPerPlane)
      {
        var sourcepolygons = polygonsPerPlane[planetag];
        if(sourcepolygons.length < 2)
        {
          destpolygons = destpolygons.concat(sourcepolygons);
        }
        else
        {
          var retesselayedpolygons = [];
          CSG.reTesselateCoplanarPolygons(sourcepolygons, retesselayedpolygons);
          destpolygons = destpolygons.concat(retesselayedpolygons);
        }
      }
      var result = CSG.fromPolygons(destpolygons);
      result.isRetesselated = true;
      return result;
    }
  },
  
  // returns an array of two CSG.Vector3Ds (minimum coordinates and maximum coordinates)
  getBounds: function() {
    if(!this.cachedBoundingBox)
    {
      var minpoint = new CSG.Vector3D(0,0,0);
      var maxpoint = new CSG.Vector3D(0,0,0);
      var polygons = this.polygons;
      var numpolygons = polygons.length;
      for(var i=0; i < numpolygons; i++)
      {
        var polygon = polygons[i];
        var bounds = polygon.boundingBox();
        if(i == 0)
        {
          minpoint = bounds[0].clone();
          maxpoint = bounds[1].clone();
        }
        else
        {
          minpoint.x = Math.min(minpoint.x, bounds[0].x);
          minpoint.y = Math.min(minpoint.y, bounds[0].y);
          minpoint.z = Math.min(minpoint.z, bounds[0].z);
          maxpoint.x = Math.max(maxpoint.x, bounds[1].x);
          maxpoint.y = Math.max(maxpoint.y, bounds[1].y);
          maxpoint.z = Math.max(maxpoint.z, bounds[1].z);
        }
      }
      this.cachedBoundingBox = [minpoint, maxpoint];
    }
    return this.cachedBoundingBox;
  },
  
  // Cut the solid by a plane. Returns the solid on the back side of the plane
  cutByPlane: function(plane) {
    // Ideally we would like to do an intersection with a polygon of inifinite size
    // but this is not supported by our implementation. As a workaround, we will create
    // a cube, with one face on the plane, and a size larger enough so that the entire
    // solid fits in the cube.

    // find the max distance of any vertex to the center of the plane:
    var planecenter = plane.normal.times(plane.w);
    var maxdistance = 0;
    this.polygons.map(function(polygon){
      polygon.vertices.map(function(vertex){
        var distance = vertex.pos.distanceToSquared(planecenter);
        if(distance > maxdistance) maxdistance = distance;
      });
    });
    maxdistance = Math.sqrt(maxdistance);
    maxdistance *= 1.01; // make sure it's really larger
    
    // Now build a polygon on the plane, at any point farther than maxdistance from the plane center:
    var vertices = [];
    var orthobasis = new CSG.OrthoNormalBasis(plane);
    vertices.push(new CSG.Vertex(orthobasis.to3D(new CSG.Vector2D(maxdistance,maxdistance))));
    vertices.push(new CSG.Vertex(orthobasis.to3D(new CSG.Vector2D(-maxdistance,maxdistance))));
    vertices.push(new CSG.Vertex(orthobasis.to3D(new CSG.Vector2D(-maxdistance,-maxdistance))));
    vertices.push(new CSG.Vertex(orthobasis.to3D(new CSG.Vector2D(maxdistance,-maxdistance))));
    var polygon = new CSG.Polygon(vertices, null, plane.flipped());
    
    // and extrude the polygon into a cube, backwards of the plane:
    var cube = polygon.extrude(plane.normal.times(-maxdistance));
    
    // Now we can do the intersection:
    return this.intersect(cube);
  },
    
};

// Parse an option from the options object
// If the option is not present, return the default value
CSG.parseOption = function(options, optionname, defaultvalue) {
  var result = defaultvalue;
  if(options)
  {
    if(optionname in options)
    {
      result = options[optionname];
    }
  }
  return result;
};

// Parse an option and force into a CSG.Vector3D. If a scalar is passed it is converted
// into a vector with equal x,y,z
CSG.parseOptionAs3DVector = function(options, optionname, defaultvalue) {
  var result = CSG.parseOption(options, optionname, defaultvalue);
  result = new CSG.Vector3D(result);
  return result;
};

CSG.parseOptionAsFloat = function(options, optionname, defaultvalue) {
  var result = CSG.parseOption(options, optionname, defaultvalue);
  if(typeof(result) == "string")
  {
    result = Number(result);
  }
  else if(typeof(result) != "number")
  {
    throw new Error("Parameter "+optionname+" should be a number");
  }
  return result;
};

CSG.parseOptionAsInt = function(options, optionname, defaultvalue) {
  var result = CSG.parseOption(options, optionname, defaultvalue);
  return Number(Math.floor(result));
};

// Construct an axis-aligned solid cuboid.
// Parameters:
//   center: center of cube (default [0,0,0])
//   radius: radius of cube (default [1,1,1]), can be specified as scalar or as 3D vector
// 
// Example code:
// 
//     var cube = CSG.cube({
//       center: [0, 0, 0],
//       radius: 1
//     });
CSG.cube = function(options) {
  var c = CSG.parseOptionAs3DVector(options, "center", [0,0,0]);
  var r = CSG.parseOptionAs3DVector(options, "radius", [1,1,1]);
  return CSG.fromPolygons([
    [[0, 4, 6, 2], [-1, 0, 0]],
    [[1, 3, 7, 5], [+1, 0, 0]],
    [[0, 1, 5, 4], [0, -1, 0]],
    [[2, 6, 7, 3], [0, +1, 0]],
    [[0, 2, 3, 1], [0, 0, -1]],
    [[4, 5, 7, 6], [0, 0, +1]]
  ].map(function(info) {
    var normal = new CSG.Vector3D(info[1]);
    //var plane = new CSG.Plane(normal, 1);
    var vertices = info[0].map(function(i) {
      var pos = new CSG.Vector3D(
        c.x + r.x * (2 * !!(i & 1) - 1),
        c.y + r.y * (2 * !!(i & 2) - 1),
        c.z + r.z * (2 * !!(i & 4) - 1)
      );
      return new CSG.Vertex(pos);
    });
    return new CSG.Polygon(vertices, null /* , plane */);
  }));
};

// Construct a solid sphere
//
// Parameters:
//   center: center of sphere (default [0,0,0])
//   radius: radius of sphere (default 1), must be a scalar
//   resolution: determines the number of polygons per 360 degree revolution (default 12)
// 
// Example usage:
// 
//     var sphere = CSG.sphere({
//       center: [0, 0, 0],
//       radius: 2,
//       resolution: 32,
//     });
CSG.sphere = function(options) {
  options = options || {};
  var center = CSG.parseOptionAs3DVector(options, "center", [0,0,0]);
  var radius = CSG.parseOptionAsFloat(options, "radius", 1);
  var resolution = CSG.parseOptionAsInt(options, "resolution", 12);
  if(resolution < 4) resolution = 4;
  var qresolution = Math.round(resolution / 4);
  var xvector = new CSG.Vector3D([1,0,0]).times(radius);
  var yvector = new CSG.Vector3D([0,-1,0]).times(radius);
  var zvector = new CSG.Vector3D([0,0,1]).times(radius);
  var prevcylinderpoint;
  var polygons = [];
  for(var slice1 = 0; slice1 <= resolution; slice1++)
  {
    var angle = Math.PI * 2.0 * slice1 / resolution;
    var cylinderpoint = xvector.times(Math.cos(angle)).plus(yvector.times(Math.sin(angle)));
    if(slice1 > 0)
    {
      // cylinder vertices:
      var vertices = [];
      var prevcospitch, prevsinpitch;
      for(var slice2 = 0; slice2 <= qresolution; slice2++)
      {
        var pitch = 0.5 * Math.PI * slice2 / qresolution;
        var cospitch = Math.cos(pitch);
        var sinpitch = Math.sin(pitch);
        if(slice2 > 0)
        {
          vertices = [];
          vertices.push(new CSG.Vertex(center.plus(prevcylinderpoint.times(prevcospitch).minus(zvector.times(prevsinpitch)))));
          vertices.push(new CSG.Vertex(center.plus(cylinderpoint.times(prevcospitch).minus(zvector.times(prevsinpitch)))));
          if(slice2 < qresolution)
          {
            vertices.push(new CSG.Vertex(center.plus(cylinderpoint.times(cospitch).minus(zvector.times(sinpitch)))));
          }
          vertices.push(new CSG.Vertex(center.plus(prevcylinderpoint.times(cospitch).minus(zvector.times(sinpitch)))));
          polygons.push(new CSG.Polygon(vertices));
          vertices = [];
          vertices.push(new CSG.Vertex(center.plus(prevcylinderpoint.times(prevcospitch).plus(zvector.times(prevsinpitch)))));
          vertices.push(new CSG.Vertex(center.plus(cylinderpoint.times(prevcospitch).plus(zvector.times(prevsinpitch)))));
          if(slice2 < qresolution)
          {
            vertices.push(new CSG.Vertex(center.plus(cylinderpoint.times(cospitch).plus(zvector.times(sinpitch)))));
          }
          vertices.push(new CSG.Vertex(center.plus(prevcylinderpoint.times(cospitch).plus(zvector.times(sinpitch)))));
          vertices.reverse();
          polygons.push(new CSG.Polygon(vertices));
        }
        prevcospitch = cospitch; 
        prevsinpitch = sinpitch; 
      }
    }
    prevcylinderpoint = cylinderpoint;
  }
  return CSG.fromPolygons(polygons);  
};

// Construct a solid cylinder.
//
// Parameters:
//   start: start point of cylinder (default [0, -1, 0])
//   end: end point of cylinder (default [0, 1, 0])
//   radius: radius of cylinder (default 1), must be a scalar
//   resolution: determines the number of polygons per 360 degree revolution (default 12)
// 
// Example usage:
// 
//     var cylinder = CSG.cylinder({
//       start: [0, -1, 0],
//       end: [0, 1, 0],
//       radius: 1,
//       resolution: 16
//     });
CSG.cylinder = function(options) {
  var s = CSG.parseOptionAs3DVector(options, "start", [0, -1, 0]);
  var e = CSG.parseOptionAs3DVector(options, "end", [0, 1, 0]);
  var r = CSG.parseOptionAsFloat(options, "radius", 1);
  var slices = CSG.parseOptionAsFloat(options, "resolution", 12);
  var ray = e.minus(s);
  var axisZ = ray.unit(), isY = (Math.abs(axisZ.y) > 0.5);
  var axisX = new CSG.Vector3D(isY, !isY, 0).cross(axisZ).unit();
  var axisY = axisX.cross(axisZ).unit();
  var start = new CSG.Vertex(s);
  var end = new CSG.Vertex(e);
  var polygons = [];
  function point(stack, slice, normalBlend) {
    var angle = slice * Math.PI * 2;
    var out = axisX.times(Math.cos(angle)).plus(axisY.times(Math.sin(angle)));
    var pos = s.plus(ray.times(stack)).plus(out.times(r));
    var normal = out.times(1 - Math.abs(normalBlend)).plus(axisZ.times(normalBlend));
    return new CSG.Vertex(pos);
  }
  for (var i = 0; i < slices; i++) {
    var t0 = i / slices, t1 = (i + 1) / slices;
    polygons.push(new CSG.Polygon([start, point(0, t0, -1), point(0, t1, -1)]));
    polygons.push(new CSG.Polygon([point(0, t1, 0), point(0, t0, 0), point(1, t0, 0), point(1, t1, 0)]));
    polygons.push(new CSG.Polygon([end, point(1, t1, 1), point(1, t0, 1)]));
  }
  return CSG.fromPolygons(polygons);
};

// Like a cylinder, but with rounded ends instead of flat
//
// Parameters:
//   start: start point of cylinder (default [0, -1, 0])
//   end: end point of cylinder (default [0, 1, 0])
//   radius: radius of cylinder (default 1), must be a scalar
//   resolution: determines the number of polygons per 360 degree revolution (default 12)
//   normal: a vector determining the starting angle for tesselation. Should be non-parallel to start.minus(end)
// 
// Example usage:
// 
//     var cylinder = CSG.roundedCylinder({
//       start: [0, -1, 0],
//       end: [0, 1, 0],
//       radius: 1,
//       resolution: 16
//     });
CSG.roundedCylinder = function(options) {
  var p1 = CSG.parseOptionAs3DVector(options, "start", [0, -1, 0]);
  var p2 = CSG.parseOptionAs3DVector(options, "end", [0, 1, 0]);
  var radius = CSG.parseOptionAsFloat(options, "radius", 1);
  var direction = p2.minus(p1);
  var defaultnormal;
  if(Math.abs(direction.x) > Math.abs(direction.y))
  {
    defaultnormal = new CSG.Vector3D(0,1,0);
  }
  else
  {
    defaultnormal = new CSG.Vector3D(1,0,0);
  }
  var normal = CSG.parseOptionAs3DVector(options, "normal", defaultnormal);
  var resolution = CSG.parseOptionAsFloat(options, "resolution", 12);
  if(resolution < 4) resolution = 4;
  var polygons = [];
  var qresolution = Math.floor(0.25*resolution);
  var length = direction.length();
  if(length < 1e-10)
  {
    return CSG.sphere({center: p1, radius: radius, resolution: resolution});
  }
  var zvector = direction.unit().times(radius);
  var xvector = zvector.cross(normal).unit().times(radius);
  var yvector = xvector.cross(zvector).unit().times(radius);
  var prevcylinderpoint;
  for(var slice1 = 0; slice1 <= resolution; slice1++)
  {
    var angle = Math.PI * 2.0 * slice1 / resolution;
    var cylinderpoint = xvector.times(Math.cos(angle)).plus(yvector.times(Math.sin(angle)));
    if(slice1 > 0)
    {
      // cylinder vertices:
      var vertices = [];
      vertices.push(new CSG.Vertex(p1.plus(cylinderpoint)));
      vertices.push(new CSG.Vertex(p1.plus(prevcylinderpoint)));
      vertices.push(new CSG.Vertex(p2.plus(prevcylinderpoint)));
      vertices.push(new CSG.Vertex(p2.plus(cylinderpoint)));
      polygons.push(new CSG.Polygon(vertices));
      var prevcospitch, prevsinpitch;
      for(var slice2 = 0; slice2 <= qresolution; slice2++)
      {
        var pitch = 0.5 * Math.PI * slice2 / qresolution;
        var cospitch = Math.cos(pitch);
        var sinpitch = Math.sin(pitch);
        if(slice2 > 0)
        {
          vertices = [];
          vertices.push(new CSG.Vertex(p1.plus(prevcylinderpoint.times(prevcospitch).minus(zvector.times(prevsinpitch)))));
          vertices.push(new CSG.Vertex(p1.plus(cylinderpoint.times(prevcospitch).minus(zvector.times(prevsinpitch)))));
          if(slice2 < qresolution)
          {
            vertices.push(new CSG.Vertex(p1.plus(cylinderpoint.times(cospitch).minus(zvector.times(sinpitch)))));
          }
          vertices.push(new CSG.Vertex(p1.plus(prevcylinderpoint.times(cospitch).minus(zvector.times(sinpitch)))));
          polygons.push(new CSG.Polygon(vertices));
          vertices = [];
          vertices.push(new CSG.Vertex(p2.plus(prevcylinderpoint.times(prevcospitch).plus(zvector.times(prevsinpitch)))));
          vertices.push(new CSG.Vertex(p2.plus(cylinderpoint.times(prevcospitch).plus(zvector.times(prevsinpitch)))));
          if(slice2 < qresolution)
          {
            vertices.push(new CSG.Vertex(p2.plus(cylinderpoint.times(cospitch).plus(zvector.times(sinpitch)))));
          }
          vertices.push(new CSG.Vertex(p2.plus(prevcylinderpoint.times(cospitch).plus(zvector.times(sinpitch)))));
          vertices.reverse();
          polygons.push(new CSG.Polygon(vertices));
        }
        prevcospitch = cospitch; 
        prevsinpitch = sinpitch; 
      }
    }
    prevcylinderpoint = cylinderpoint;
  }
  return CSG.fromPolygons(polygons);
};

// Construct an axis-aligned solid rounded cuboid.
// Parameters:
//   center: center of cube (default [0,0,0])
//   radius: radius of cube (default [1,1,1]), can be specified as scalar or as 3D vector
//   roundradius: radius of rounded corners (default 0.2), must be a scalar
//   resolution: determines the number of polygons per 360 degree revolution (default 8)
// 
// Example code:
// 
//     var cube = CSG.roundedCube({
//       center: [0, 0, 0],
//       radius: 1,
//       roundradius: 0.2,
//       resolution: 8,
//     });
CSG.roundedCube = function(options) {
  var center = CSG.parseOptionAs3DVector(options, "center", [0,0,0]);
  var cuberadius = CSG.parseOptionAs3DVector(options, "radius", [1,1,1]);
  var resolution = CSG.parseOptionAsFloat(options, "resolution", 8);
  if(resolution < 4) resolution = 4;
  var roundradius = CSG.parseOptionAsFloat(options, "roundradius", 0.2);
  var innercuberadius=cuberadius.clone();
  innercuberadius.x -= roundradius;
  innercuberadius.y -= roundradius;
  innercuberadius.z -= roundradius;
  var result = CSG.cube({center: center, radius: [cuberadius.x, innercuberadius.y, innercuberadius.z]});
  result = result.unionSub( CSG.cube({center: center, radius: [innercuberadius.x, cuberadius.y, innercuberadius.z]}),false,false);
  result = result.unionSub( CSG.cube({center: center, radius: [innercuberadius.x, innercuberadius.y, cuberadius.z]}),false,false);
  for(var level=0; level < 2; level++)
  {
    var z = innercuberadius.z;
    if(level == 1) z = -z;
    var p1 = new CSG.Vector3D(innercuberadius.x, innercuberadius.y, z).plus(center);
    var p2 = new CSG.Vector3D(innercuberadius.x, -innercuberadius.y, z).plus(center);
    var p3 = new CSG.Vector3D(-innercuberadius.x, -innercuberadius.y, z).plus(center);
    var p4 = new CSG.Vector3D(-innercuberadius.x, innercuberadius.y, z).plus(center);
    var sphere = CSG.sphere({center: p1, radius: roundradius, resolution: resolution});
    result = result.unionSub(sphere,false,false);
    sphere = CSG.sphere({center: p2, radius: roundradius, resolution: resolution});
    result = result.unionSub(sphere,false,false);
    sphere = CSG.sphere({center: p3, radius: roundradius, resolution: resolution});
    result = result.unionSub(sphere,false,false);
    sphere = CSG.sphere({center: p4, radius: roundradius, resolution: resolution});
    result = result.unionSub(sphere,true,true);
    var cylinder = CSG.cylinder({start:p1, end: p2, radius: roundradius, resolution: resolution});
    result = result.unionSub(cylinder,false,false);
    cylinder = CSG.cylinder({start:p2, end: p3, radius: roundradius, resolution: resolution});
    result = result.unionSub(cylinder,false,false);
    cylinder = CSG.cylinder({start:p3, end: p4, radius: roundradius, resolution: resolution});
    result = result.unionSub(cylinder,false,false);
    cylinder = CSG.cylinder({start:p4, end: p1, radius: roundradius, resolution: resolution});
    result = result.unionSub(cylinder,false,false);
    if(level == 0) {
      var d = new CSG.Vector3D(0, 0, -2*z);
      cylinder = CSG.cylinder({start:p1, end: p1.plus(d), radius: roundradius, resolution: resolution});
      result = result.unionSub(cylinder);
      cylinder = CSG.cylinder({start:p2, end: p2.plus(d), radius: roundradius, resolution: resolution});
      result = result.unionSub(cylinder);
      cylinder = CSG.cylinder({start:p3, end: p3.plus(d), radius: roundradius, resolution: resolution});
      result = result.unionSub(cylinder);
      cylinder = CSG.cylinder({start:p4, end: p4.plus(d), radius: roundradius, resolution: resolution});
      result = result.unionSub(cylinder,true,true);
    }
  }
  return result;
}



// # class Vector3D

// Represents a 3D vector.
// 
// Example usage:
// 
//     new CSG.Vector3D(1, 2, 3);
//     new CSG.Vector3D([1, 2, 3]);
//     new CSG.Vector3D({ x: 1, y: 2, z: 3 });

CSG.Vector3D = function(x, y, z) {
  var ok = true;
  if (arguments.length == 1)
  {
    if(typeof(x) == "object")
    {
      if(x instanceof Array)
      {
        this.x = x[0];
        this.y = x[1];
        this.z = x[2];
      }  
      else if( ('x' in x) && ('y' in x) && ('z' in x) )
      {
        this.x = x.x;
        this.y = x.y;
        this.z = x.z;
      }
      else ok = false;
    }
    else
    {
      var v = Number(x);
      this.x = v;
      this.y = v;
      this.z = v;
    }
  }
  else if (arguments.length == 3)
  {
    this.x = Number(x);
    this.y = Number(y);
    this.z = Number(z);
  }
  else ok = false;
  if(!ok)
  {
    throw new Error("wrong arguments");
  }
};

CSG.Vector3D.prototype = {
  clone: function() {
    return new CSG.Vector3D(this.x, this.y, this.z);
  },

  negated: function() {
    return new CSG.Vector3D(-this.x, -this.y, -this.z);
  },

  plus: function(a) {
    return new CSG.Vector3D(this.x + a.x, this.y + a.y, this.z + a.z);
  },

  minus: function(a) {
    return new CSG.Vector3D(this.x - a.x, this.y - a.y, this.z - a.z);
  },

  times: function(a) {
    return new CSG.Vector3D(this.x * a, this.y * a, this.z * a);
  },

  dividedBy: function(a) {
    return new CSG.Vector3D(this.x / a, this.y / a, this.z / a);
  },

  dot: function(a) {
    return this.x * a.x + this.y * a.y + this.z * a.z;
  },

  lerp: function(a, t) {
    return this.plus(a.minus(this).times(t));
  },

  lengthSquared: function() {
    return this.dot(this);
  },

  length: function() {
    return Math.sqrt(this.lengthSquared());
  },

  unit: function() {
    return this.dividedBy(this.length());
  },

  cross: function(a) {
    return new CSG.Vector3D(
      this.y * a.z - this.z * a.y,
      this.z * a.x - this.x * a.z,
      this.x * a.y - this.y * a.x
    );
  },
  
  distanceTo: function(a) {
    return this.minus(a).length();
  },

  distanceToSquared: function(a) {
    return this.minus(a).lengthSquared();
  },

  equals: function(a) {
    return (this.x == a.x) && (this.y == a.y) && (this.z == a.z);
  },
  
  // Right multiply by a 4x4 matrix (the vector is interpreted as a row vector)
  // Returns a new CSG.Vector3D
  multiply4x4: function(matrix4x4) {
    return matrix4x4.rightMultiply1x3Vector(this);
  },
  
  toStlString: function() {
    return this.x+" "+this.y+" "+this.z;
  },
  
  toString: function() {
    return "("+this.x+", "+this.y+", "+this.z+")";
  },
  
};

// # class Vertex

// Represents a vertex of a polygon. Use your own vertex class instead of this
// one to provide additional features like texture coordinates and vertex
// colors. Custom vertex classes need to provide a `pos` property
// `flipped()`, and `interpolate()` methods that behave analogous to the ones
// defined by `CSG.Vertex`.

CSG.Vertex = function(pos) {
  this.pos = pos;
};

CSG.Vertex.prototype = {
  // Return a vertex with all orientation-specific data (e.g. vertex normal) flipped. Called when the
  // orientation of a polygon is flipped.
  flipped: function() {
    return this;
  },

  getTag: function() {
    var result = this.tag;
    if(!result)
    {
      result = CSG.getTag();
      this.tag = result;
    }
    return result;
  },

  // Create a new vertex between this vertex and `other` by linearly
  // interpolating all properties using a parameter of `t`. Subclasses should
  // override this to interpolate additional properties.
  interpolate: function(other, t) {
    var newpos = this.pos.lerp(other.pos, t);
    return new CSG.Vertex(newpos);
  },
  
  // Affine transformation of vertex. Returns a new CSG.Vertex
  transform: function(matrix4x4) {
    var newpos = this.pos.multiply4x4(matrix4x4);
    return new CSG.Vertex(newpos);  
  },
  
  toStlString: function() {
    return "vertex "+this.pos.toStlString()+"\n";
  },
  
  toString: function() {
    return this.pos.toString();
  },
};

// # class Plane

// Represents a plane in 3D space.

CSG.Plane = function(normal, w) {
  this.normal = normal;
  this.w = w;
};

// `CSG.Plane.EPSILON` is the tolerance used by `splitPolygon()` to decide if a
// point is on the plane.
CSG.Plane.EPSILON = 1e-5;

CSG.Plane.fromVector3Ds = function(a, b, c) {
  var n = b.minus(a).cross(c.minus(a)).unit();
  return new CSG.Plane(n, n.dot(a));
};

CSG.Plane.fromPoints = function(a, b, c) {
  a = new CSG.Vector3D(a);
  b = new CSG.Vector3D(b);
  c = new CSG.Vector3D(c);
  return CSG.Plane.fromVector3Ds(a, b, c);
};

CSG.Plane.fromNormalAndPoint = function(normal, point) {
  normal = new CSG.Vector3D(normal);
  point = new CSG.Vector3D(point);
  normal = normal.unit();
  var w = point.dot(normal);
  return new CSG.Plane(normal, w);
};

CSG.Plane.prototype = {
  flipped: function() {
    return new CSG.Plane(this.normal.negated(), -this.w);
  },
  
  getTag: function() {
    var result = this.tag;
    if(!result)
    {
      result = CSG.getTag();
      this.tag = result;
    }
    return result;
  },

  equals: function(n) {
    return this.normal.equals(n.normal) && this.w == n.w;
  },
  
  transform: function(matrix4x4) {
    var origin = new CSG.Vector3D(0,0,0);
    var pointOnPlane = this.normal.times(this.w);
    var neworigin = origin.multiply4x4(matrix4x4);
    var neworiginPlusNormal = this.normal.multiply4x4(matrix4x4);
    var newnormal = neworiginPlusNormal.minus(neworigin);
    var newpointOnPlane = pointOnPlane.multiply4x4(matrix4x4);
    var neww = newnormal.dot(newpointOnPlane);
    return new CSG.Plane(newnormal, neww);
  },

  // Returns object:
  // .type:
  //   0: coplanar-front
  //   1: coplanar-back
  //   2: front
  //   3: back
  //   4: spanning
  // In case the polygon is spanning, returns:
  // .front: a CSG.Polygon of the front part 
  // .back: a CSG.Polygon of the back part 
  splitPolygon: function(polygon) {
    var result = {
      type: null,
      front: null,
      back: null,
    };    
    // cache in local vars (speedup):
    var planenormal = this.normal;      
    var vertices = polygon.vertices;
    var numvertices = vertices.length;
    if(polygon.plane.equals(this))
    {
      result.type = 0;
    }
    else
    {
      var EPS = CSG.Plane.EPSILON;
      var thisw = this.w;
      // first check if the polygon's bounding sphere is completely in front or in back:
      var bound = polygon.boundingSphere();
      var spherecenter = bound[0];
      var sphereradius = bound[1];
      sphereradius += EPS;
      //var d = this.signedDistanceToPoint(spherecenter);
      var d = planenormal.dot(spherecenter) - thisw;
     
      if(d > sphereradius)
      {
        result.type = 2;
      }
      else if(d < -sphereradius)
      {
        result.type = 3;
      }
      else
      {
        // no, we really have to check each vertex separately:         
        var hasfront = false;
        var hasback = false;
        var vertexIsBack = [];
        var MINEPS = -EPS;
        for (var i = 0; i < numvertices; i++) {
          var t = planenormal.dot(vertices[i].pos) - thisw;
          var isback = (t < 0);
          vertexIsBack.push(isback);
          if(t > EPS) hasfront = true; 
          if(t < MINEPS) hasback = true; 
        }
        if( (!hasfront) && (!hasback) )
        {
          // all points coplanar
          var t = planenormal.dot(polygon.plane.normal);
          result.type = (t >= 0)? 0:1;
        }
        else if(!hasback)
        {
          result.type = 2;
        }
        else if(!hasfront)
        {
          result.type = 3;
        }
        else
        {
          // spanning
          result.type = 4;
          var frontvertices = [], backvertices = [];
          var isback = vertexIsBack[0];
          for(var vertexindex = 0; vertexindex < numvertices; vertexindex++)
          {
            var vertex = vertices[vertexindex];
            var nextvertexindex = vertexindex + 1;
            if(nextvertexindex >= numvertices) nextvertexindex = 0;
            var nextisback = vertexIsBack[nextvertexindex];
            if(isback == nextisback)
            {
              // line segment is on one side of the plane:
              if(isback)
              {
                backvertices.push(vertex);
              }
              else
              {
                frontvertices.push(vertex);
              }          
            }
            else
            {
              // line segment intersects plane:
              var point = vertex.pos;
              var nextpoint = vertices[nextvertexindex].pos;
              var line = CSG.Line3D.fromPoints(point, nextpoint);
              var intersectionpoint =  this.intersectWithLine(line);
              var intersectionvertex = new CSG.Vertex(intersectionpoint);
              if(isback)
              {
                backvertices.push(vertex);
                backvertices.push(intersectionvertex);
                frontvertices.push(intersectionvertex);
              }
              else
              {
                frontvertices.push(vertex);
                frontvertices.push(intersectionvertex);
                backvertices.push(intersectionvertex);
              }          
            }
            isback = nextisback;
          }  // for vertexindex
  
          // remove duplicate vertices:
          var EPS_SQUARED = CSG.Plane.EPSILON * CSG.Plane.EPSILON;  
          if(backvertices.length >= 3)
          {
            var prevvertex = backvertices[backvertices.length - 1];
            for(var vertexindex = 0; vertexindex < backvertices.length; vertexindex++)
            {
              var vertex = backvertices[vertexindex];
              if(vertex.pos.distanceToSquared(prevvertex.pos) < EPS_SQUARED)
              {
                backvertices.splice(vertexindex,1);
                vertexindex--;
              }
              prevvertex = vertex;
            }        
          }
          if(frontvertices.length >= 3)
          {
            var prevvertex = frontvertices[frontvertices.length - 1];
            for(var vertexindex = 0; vertexindex < frontvertices.length; vertexindex++)
            {
              var vertex = frontvertices[vertexindex];
              if(vertex.pos.distanceToSquared(prevvertex.pos) < EPS_SQUARED)
              {
                frontvertices.splice(vertexindex,1);
                vertexindex--;
              }
              prevvertex = vertex;
            }        
          }
          if (frontvertices.length >= 3)
          {
            result.front = new CSG.Polygon(frontvertices, polygon.shared, polygon.plane); 
          }
          if (backvertices.length >= 3)
          {
            result.back = new CSG.Polygon(backvertices, polygon.shared, polygon.plane); 
          }
        }
      }
    }
    return result;
  },

  // returns CSG.Point3D
  intersectWithLine: function(line3d) {
    return line3d.intersectWithPlane(this);
  },

  // intersection of two planes
  intersectWithPlane: function(plane) {
    return CSG.Line3D.fromPlanes(this, plane);
  },

  signedDistanceToPoint: function(point) {
    var t = this.normal.dot(point) - this.w;
    return t;
  },

  toString: function() {
    return "[normal: "+this.normal.toString()+", w: "+this.w+"]";
  },
  
  mirrorPoint: function(point3d) {
    var distance = this.signedDistanceToPoint(point3d);
    var mirrored = point3d.minus(this.normal.times(distance * 2.0));
    return mirrored;
  },
};


// # class Polygon

// Represents a convex polygon. The vertices used to initialize a polygon must
// be coplanar and form a convex loop. They do not have to be `CSG.Vertex`
// instances but they must behave similarly (duck typing can be used for
// customization).
// 
// Each convex polygon has a `shared` property, which is shared between all
// polygons that are clones of each other or were split from the same polygon.
// This can be used to define per-polygon properties (such as surface color).
// 
// The plane of the polygon is calculated from the vertex coordinates
// To avoid unnecessary recalculation, the plane can alternatively be
// passed as the third argument 
CSG.Polygon = function(vertices, shared, plane) {
  this.vertices = vertices;
  this.shared = shared;
  var numvertices = vertices.length;

  if(arguments.length >= 3)
  {
    this.plane = plane;
  }
  else
  {
    this.plane = CSG.Plane.fromVector3Ds(vertices[0].pos, vertices[1].pos, vertices[2].pos);
  }

  if(_CSGDEBUG)
  {
    this.checkIfConvex();
  }
};

CSG.Polygon.prototype = {
  // check whether the polygon is convex (it should be, otherwise we will get unexpected results)
  checkIfConvex: function() {
    if(! CSG.Polygon.verticesConvex(this.vertices, this.plane.normal))
    {
      throw new Error("Not convex!");
    }
  },
  
  // Extrude a polygon into the direction offsetvector
  // Returns a CSG object
  extrude: function(offsetvector) {
    var newpolygons = [];
  
    var polygon1=this;
    var direction = polygon1.plane.normal.dot(offsetvector);
    if(direction > 0)
    {
      polygon1 = polygon1.flipped();
    }
    newpolygons.push(polygon1);
    var polygon2=polygon1.translate(offsetvector);
    var numvertices=this.vertices.length;
    for(var i=0; i < numvertices; i++)
    {
      var sidefacepoints = [];
      var nexti = (i < (numvertices-1))? i+1:0;
      sidefacepoints.push(polygon1.vertices[i].pos);
      sidefacepoints.push(polygon2.vertices[i].pos);
      sidefacepoints.push(polygon2.vertices[nexti].pos);
      sidefacepoints.push(polygon1.vertices[nexti].pos);
      var sidefacepolygon=CSG.Polygon.createFromPoints(sidefacepoints);
      newpolygons.push(sidefacepolygon);
    }
    polygon2 = polygon2.flipped();
    newpolygons.push(polygon2);
    return CSG.fromPolygons(newpolygons);
  },
  
  translate: function(offset) {
    return this.transform(CSG.Matrix4x4.translation(offset));
  },
  
  // Expand the polygon with a certain radius
  // This extrudes the face of the polygon and adds rounded corners 
  // Returns a CSG object (not a polygon anymore!)
  // resolution: number of points per 360 degree for the rounded corners
  expand: function(radius, resolution) {
    if( (!resolution) || (resolution < 4) ) resolution = 4;
    resolution = 4 * Math.floor(resolution / 4);
  
    var result=new CSG();
    
    // expand each side of the polygon. The expansion of a line is a roundedCylinder:
    var numvertices=this.vertices.length;
    for(var i=0; i < numvertices; i++)
    {
      var previ = (i == 0) ? (numvertices-1):i-1;
      var p1 = this.vertices[previ].pos;
      var p2 = this.vertices[i].pos;
  
      var roundedCylinder = CSG.roundedCylinder({start: p1, end: p2, normal: this.plane.normal, radius: radius, resolution: resolution});
      result = result.unionSub(roundedCylinder, false, false);
    }
    var extrudevector=this.plane.normal.unit().times(2*radius);
    var translatedpolygon = this.translate(extrudevector.times(-0.5));
    var extrudedface = translatedpolygon.extrude(extrudevector);  
    result=result.unionSub(extrudedface, true, false);
    return result;
  },
  
  // returns an array with a CSG.Vector3D (center point) and a radius
  boundingSphere: function() {
    if(!this.cachedBoundingSphere)
    {
      var box = this.boundingBox();
      var middle = box[0].plus(box[1]).times(0.5);
      var radius3 = box[1].minus(middle);
      var radius = radius3.length();
      this.cachedBoundingSphere = [middle, radius];
    }
    return this.cachedBoundingSphere;
  },

  // returns an array of two CSG.Vector3Ds (minimum coordinates and maximum coordinates)
  boundingBox: function() {
    if(!this.cachedBoundingBox)
    {
      var minpoint, maxpoint;
      var vertices = this.vertices;
      var numvertices = vertices.length;
      if(numvertices == 0)
      {
        minpoint=new CSG.Vector3D(0,0,0);
        maxpoint=new CSG.Vector3D(0,0,0);
      }
      else
      {
        minpoint=vertices[0].pos.clone();
        maxpoint=vertices[0].pos.clone();
      }
      for(var i=1; i < numvertices; i++)
      {
        var point = vertices[i].pos;
        minpoint.x = Math.min(minpoint.x, point.x);
        minpoint.y = Math.min(minpoint.y, point.y);
        minpoint.z = Math.min(minpoint.z, point.z);
        maxpoint.x = Math.max(maxpoint.x, point.x);
        maxpoint.y = Math.max(maxpoint.y, point.y);
        maxpoint.z = Math.max(maxpoint.z, point.z);
      }
      this.cachedBoundingBox = [minpoint, maxpoint];
    }
    return this.cachedBoundingBox;
  },

  flipped: function() {
    var newvertices = this.vertices.map(function(v) { return v.flipped(); });
    newvertices.reverse();
    var newplane = this.plane.flipped();
    return new CSG.Polygon(newvertices, this.shared, newplane);
  },
  
  mirrored: function(plane) {
    var newvertices = this.vertices.map(function(v) {
      var newpos = plane.mirrorPoint(v.pos);
      return new CSG.Vertex(newpos);
    });
    newvertices.reverse();
    return new CSG.Polygon(newvertices, this.shared);
  },
  
  // Affine transformation of polygon. Returns a new CSG.Polygon
  transform: function(matrix4x4) {
    var newvertices = this.vertices.map(function(v) { return v.transform(matrix4x4); } );
    var newplane = this.plane.transform(matrix4x4);
    return new CSG.Polygon(newvertices, this.shared, newplane);
  },
  
  toStlString: function() {
    var result="";
    if(this.vertices.length >= 3) // should be!
    {
      // STL requires triangular polygons. If our polygon has more vertices, create
      // multiple triangles:
      var firstVertexStl = this.vertices[0].toStlString();
      for(var i=0; i < this.vertices.length-2; i++)
      {
        result += "facet normal "+this.plane.normal.toStlString()+"\nouter loop\n";
        result += firstVertexStl;
        result += this.vertices[i+1].toStlString();
        result += this.vertices[i+2].toStlString();
        result += "endloop\nendfacet\n";    
      } 
    }
    return result;
  },
  
  toString: function() {
    var result = "Polygon plane: "+this.plane.toString()+"\n";
    this.vertices.map(function(vertex) {
      result += "  "+vertex.toString()+"\n";
    });
    return result;
  },  
};

CSG.Polygon.verticesConvex = function(vertices, planenormal) {
  var numvertices = vertices.length;
  if(numvertices > 2)
  {
    var prevprevpos=vertices[numvertices-2].pos;
    var prevpos=vertices[numvertices-1].pos;
    for(var i=0; i < numvertices; i++)
    {
      var pos=vertices[i].pos;
      if(!CSG.Polygon.isConvexPoint(prevprevpos, prevpos, pos, planenormal))
      {
        return false;
      }
      prevprevpos=prevpos;
      prevpos=pos;
    }
  }
  return true;
};

// Create a polygon from the given points
CSG.Polygon.createFromPoints = function(points, shared, plane) {
  var normal;
  if(arguments.length < 3)
  {
    // initially set a dummy vertex normal:
    normal = new CSG.Vector3D(0, 0, 0);
  }
  else
  {
    normal = plane.normal;
  }
  var vertices = [];
  points.map( function(p) {
    var vec = new CSG.Vector3D(p);
    var vertex = new CSG.Vertex(vec);
    vertices.push(vertex); 
  });            
  var polygon;
  if(arguments.length < 3)
  {
    polygon = new CSG.Polygon(vertices, shared);
  }
  else
  {
    polygon = new CSG.Polygon(vertices, shared, plane);
  }
  return polygon;
};

// calculate whether three points form a convex corner 
//  prevpoint, point, nextpoint: the 3 coordinates (CSG.Vector3D instances)
//  normal: the normal vector of the plane
CSG.Polygon.isConvexPoint = function(prevpoint, point, nextpoint, normal) {
  var crossproduct=point.minus(prevpoint).cross(nextpoint.minus(point));
  var crossdotnormal=crossproduct.dot(normal);
  return (crossdotnormal >= 0);
};

CSG.Polygon.isStrictlyConvexPoint = function(prevpoint, point, nextpoint, normal) {
  var crossproduct=point.minus(prevpoint).cross(nextpoint.minus(point));
  var crossdotnormal=crossproduct.dot(normal);
  return (crossdotnormal >= 1e-5);
};

// # class PolygonTreeNode

// This class manages hierarchical splits of polygons
// At the top is a root node which doesn hold a polygon, only child PolygonTreeNodes
// Below that are zero or more 'top' nodes; each holds a polygon. The polygons can be in different planes 
// splitByPlane() splits a node by a plane. If the plane intersects the polygon, two new child nodes
// are created holding the splitted polygon.
// getPolygons() retrieves the polygon from the tree. If for PolygonTreeNode the polygon is split but 
// the two split parts (child nodes) are still intact, then the unsplit polygon is returned.
// This ensures that we can safely split a polygon into many fragments. If the fragments are untouched,
//  getPolygons() will return the original unsplit polygon instead of the fragments.
// remove() removes a polygon from the tree. Once a polygon is removed, the parent polygons are invalidated 
// since they are no longer intact. 

// constructor creates the root node:
CSG.PolygonTreeNode = function() {
  this.parent = null;
  this.children = [];
  this.polygon = null;
  this.removed = false;
};

CSG.PolygonTreeNode.prototype = {
  // fill the tree with polygons. Should be called on the root node only; child nodes must
  // always be a derivate (split) of the parent node.
  addPolygons: function(polygons) {
    if(!this.isRootNode()) throw new Error("Assertion failed");  // new polygons can only be added to root node; children can only be splitted polygons
    var _this = this;
    polygons.map(function(polygon) {
      _this.addChild(polygon);
    });
  },
  
  // remove a node
  // - the siblings become toplevel nodes
  // - the parent is removed recursively
  remove: function() {
    if(!this.removed)
    {
      this.removed=true;
  
      if(_CSGDEBUG)
      {
        if(this.isRootNode()) throw new Error("Assertion failed");  // can't remove root node
        if(this.children.length) throw new Error("Assertion failed"); // we shouldn't remove nodes with children
      }
      
      // remove ourselves from the parent's children list:
      var parentschildren = this.parent.children;
      var i = parentschildren.indexOf(this);
      if(i < 0) throw new Error("Assertion failed");
      parentschildren.splice(i,1);
      
      // invalidate the parent's polygon, and of all parents above it:
      this.parent.recursivelyInvalidatePolygon();
    }
  },
  
  isRemoved: function() {
    return this.removed;
  },

  isRootNode: function() {
    return !this.parent;
  },  

  // invert all polygons in the tree. Call on the root node
  invert: function() {
    if(!this.isRootNode()) throw new Error("Assertion failed");  // can only call this on the root node
    this.invertSub();
  },

  getPolygon: function () {
    if(!this.polygon) throw new Error("Assertion failed");  // doesn't have a polygon, which means that it has been broken down
    return this.polygon;
  },

  getPolygons: function (result) {
    if(this.polygon)
    {
      // the polygon hasn't been broken yet. We can ignore the children and return our polygon:
      result.push(this.polygon);
    }
    else
    {
      // our polygon has been split up and broken, so gather all subpolygons from the children:
      var childpolygons = [];
      this.children.map(function(child) {
        child.getPolygons(childpolygons);
      });
      childpolygons.map(function(p) {
        result.push(p);
      });
    }
  },

  // split the node by a plane; add the resulting nodes to the frontnodes and backnodes array  
  // If the plane doesn't intersect the polygon, the 'this' object is added to one of the arrays
  // If the plane does intersect the polygon, two new child nodes are created for the front and back fragments,
  //  and added to both arrays. 
  splitByPlane: function(plane, coplanarfrontnodes, coplanarbacknodes, frontnodes, backnodes) {
    var children = this.children;
    var numchildren = children.length; 
    if(numchildren > 0)
    {
      // if we have children, split the children
      for(var i = 0; i < numchildren; i++)
      {
        children[i].splitByPlane(plane, coplanarfrontnodes, coplanarbacknodes, frontnodes, backnodes);
      }
    }
    else
    {
      // no children. Split the polygon:
      if(this.polygon)
      {
        var splitresult = plane.splitPolygon(this.polygon);
        switch(splitresult.type)
        {
          case 0:   // coplanar front:
            coplanarfrontnodes.push(this);
            break;
            
          case 1:   // coplanar back:
            coplanarbacknodes.push(this);
            break;
            
          case 2:   // front:
            frontnodes.push(this);
            break;
            
          case 3:   // back:
            backnodes.push(this);
            break;
            
          case 4:  // spanning:
            if(splitresult.front)
            {
              var frontnode = this.addChild(splitresult.front);
              frontnodes.push(frontnode);
            }
            if(splitresult.back)
            {
              var backnode = this.addChild(splitresult.back);
              backnodes.push(backnode);
            }
            break;
        }
      }      
    }
  },
  
 
  // PRIVATE methods from here:

  // add child to a node
  // this should be called whenever the polygon is split
  // a child should be created for every fragment of the split polygon 
  // returns the newly created child
  addChild: function(polygon) {
    var newchild = new CSG.PolygonTreeNode();
    newchild.parent = this;
    newchild.polygon = polygon;
    this.children.push(newchild);
    return newchild;
  },

  invertSub: function() {
    if(this.polygon)
    {
      this.polygon = this.polygon.flipped();
    }
    this.children.map(function(child) {
      child.invertSub();
    });
  },
  
  recursivelyInvalidatePolygon: function() {
    if(this.polygon)
    {
      this.polygon = null;
      if(this.parent)
      {
        this.parent.recursivelyInvalidatePolygon();
      }
    }
  },
  
};



// # class Tree
// This is the root of a BSP tree
// We are using this separate class for the root of the tree, to hold the PolygonTreeNode root
// The actual tree is kept in this.rootnode
CSG.Tree = function(polygons) {
  this.polygonTree = new CSG.PolygonTreeNode();
  this.rootnode = new CSG.Node();
  if (polygons) this.addPolygons(polygons);
};

CSG.Tree.prototype = {
  invert: function() {
    this.polygonTree.invert();
    this.rootnode.invert();
  },
  
  // Remove all polygons in this BSP tree that are inside the other BSP tree
  // `tree`.
  clipTo: function(tree, alsoRemovecoplanarFront) {
    alsoRemovecoplanarFront = alsoRemovecoplanarFront? true:false;
    this.rootnode.clipTo(tree, alsoRemovecoplanarFront);
  },

  allPolygons: function() {
    var result = [];
    this.polygonTree.getPolygons(result);
    return result;
  },

  addPolygons: function(polygons) {
    var _this = this;
    polygons.map(function(p) {
      _this.addPolygon(p);
    });
  },

  addPolygon: function(polygon) {
    var polygontreenode=this.polygonTree.addChild(polygon);
    this.rootnode.addPolygonTreeNode(polygontreenode);
  },  
};

// # class Node

// Holds a node in a BSP tree. A BSP tree is built from a collection of polygons
// by picking a polygon to split along.
// Polygons are not stored directly in the tree, but in PolygonTreeNodes, stored in
// this.polygontreenodes. Those PolygonTreeNodes are children of the owning
// CSG.Tree.polygonTree
// This is not a leafy BSP tree since there is
// no distinction between internal and leaf nodes.

CSG.Node = function() {
  this.plane = null;
  this.front = null;
  this.back = null;
  this.polygontreenodes = [];
};

CSG.Node.prototype = {
  // Convert solid space to empty space and empty space to solid space.
  invert: function() {
    this.plane = this.plane.flipped();
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    var temp = this.front;
    this.front = this.back;
    this.back = temp;
  },

  // clip polygontreenodes to our plane
  // calls remove() for all clipped PolygonTreeNodes
  clipPolygons: function(polygontreenodes, alsoRemovecoplanarFront) {
    if(this.plane)
    {
      var backnodes = [];
      var frontnodes = [];
      var coplanarfrontnodes = alsoRemovecoplanarFront? backnodes:frontnodes;
      var plane = this.plane;
      var numpolygontreenodes = polygontreenodes.length;
      for(i=0; i < numpolygontreenodes; i++)
      {
        var node = polygontreenodes[i];
        if(!node.isRemoved() )
        {
          node.splitByPlane(plane, coplanarfrontnodes, backnodes, frontnodes, backnodes);
        }
      }
      if(this.front && (frontnodes.length > 0) )
      {
        this.front.clipPolygons(frontnodes, alsoRemovecoplanarFront);
      }
      var numbacknodes = backnodes.length;
      if(this.back && (numbacknodes > 0) )
      {
        this.back.clipPolygons(backnodes, alsoRemovecoplanarFront);
      }
      else
      {
        // there's nothing behind this plane. Delete the nodes behind this plane:
        for(i=0; i < numbacknodes; i++)
        {
          backnodes[i].remove();
        }
      }
    }
  },

  // Remove all polygons in this BSP tree that are inside the other BSP tree
  // `tree`.
  clipTo: function(tree, alsoRemovecoplanarFront) {
    if(this.polygontreenodes.length > 0)
    {
      tree.rootnode.clipPolygons(this.polygontreenodes, alsoRemovecoplanarFront);
    }
    if (this.front) this.front.clipTo(tree, alsoRemovecoplanarFront);
    if (this.back) this.back.clipTo(tree, alsoRemovecoplanarFront);
  },
  
  addPolygonTreeNode: function(polygontreenode) {
    if(!this.plane)
    {
      this.plane = polygontreenode.getPolygon().plane;
    }
    var frontnodes = [];
    var backnodes = [];
    polygontreenode.splitByPlane(this.plane, this.polygontreenodes, this.polygontreenodes, frontnodes, backnodes);
    if(frontnodes.length > 0)
    {
      if (!this.front) this.front = new CSG.Node();
      this.front.addPolygonTreeNode(frontnodes[0]);
    }
    if(backnodes.length > 0)
    {
      if (!this.back) this.back = new CSG.Node();
      this.back.addPolygonTreeNode(backnodes[0]);
    }
  },
};

//////////

// # class Matrix4x4:
// Represents a 4x4 matrix. Elements are specified in row order
CSG.Matrix4x4 = function(elements) {
  if (arguments.length >= 1) {
    this.elements=elements;
  }
  else
  {
    // if no arguments passed: create unity matrix  
    this.elements=[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }
}

CSG.Matrix4x4.prototype = {
  plus: function(m) {
    var r=[];
    for(var i=0; i < 16; i++)
    {
      r[i]=this.elements[i]+m.elements[i];
    }
    return new CSG.Matrix4x4(r);
  },
  
  minus: function(m) {
    var r=[];
    for(var i=0; i < 16; i++)
    {
      r[i]=this.elements[i]-m.elements[i];
    }
    return new CSG.Matrix4x4(r);
  },

  // right multiply by another 4x4 matrix:
  multiply: function(m) {
    // cache elements in local variables, for speedup:
    var this0=this.elements[0];
    var this1=this.elements[1];
    var this2=this.elements[2];
    var this3=this.elements[3];
    var this4=this.elements[4];
    var this5=this.elements[5];
    var this6=this.elements[6];
    var this7=this.elements[7];
    var this8=this.elements[8];
    var this9=this.elements[9];
    var this10=this.elements[10];
    var this11=this.elements[11];
    var this12=this.elements[12];
    var this13=this.elements[13];
    var this14=this.elements[14];
    var this15=this.elements[15];
    var m0=m.elements[0];
    var m1=m.elements[1];
    var m2=m.elements[2];
    var m3=m.elements[3];
    var m4=m.elements[4];
    var m5=m.elements[5];
    var m6=m.elements[6];
    var m7=m.elements[7];
    var m8=m.elements[8];
    var m9=m.elements[9];
    var m10=m.elements[10];
    var m11=m.elements[11];
    var m12=m.elements[12];
    var m13=m.elements[13];
    var m14=m.elements[14];
    var m15=m.elements[15];
    
    var result=[];
    result[0] = this0*m0 + this1*m4 + this2*m8 + this3*m12;
    result[1] = this0*m1 + this1*m5 + this2*m9 + this3*m13;
    result[2] = this0*m2 + this1*m6 + this2*m10 + this3*m14;
    result[3] = this0*m3 + this1*m7 + this2*m11 + this3*m15;
    result[4] = this4*m0 + this5*m4 + this6*m8 + this7*m12;
    result[5] = this4*m1 + this5*m5 + this6*m9 + this7*m13;
    result[6] = this4*m2 + this5*m6 + this6*m10 + this7*m14;
    result[7] = this4*m3 + this5*m7 + this6*m11 + this7*m15;
    result[8] = this8*m0 + this9*m4 + this10*m8 + this11*m12;
    result[9] = this8*m1 + this9*m5 + this10*m9 + this11*m13;
    result[10] = this8*m2 + this9*m6 + this10*m10 + this11*m14;
    result[11] = this8*m3 + this9*m7 + this10*m11 + this11*m15;
    result[12] = this12*m0 + this13*m4 + this14*m8 + this15*m12;
    result[13] = this12*m1 + this13*m5 + this14*m9 + this15*m13;
    result[14] = this12*m2 + this13*m6 + this14*m10 + this15*m14;
    result[15] = this12*m3 + this13*m7 + this14*m11 + this15*m15;
    return new CSG.Matrix4x4(result);
  },
  
  clone: function() {
    var elements = this.elements.map(function(p) { return p; }); 
    return new CSG.Matrix4x4(elements);
  },
  
  // Multiply a CSG.Vector3D (interpreted as 1 row, 3 column) by this matrix 
  // Fourth element is taken as 1
  rightMultiply1x3Vector: function(v) {
    var v0 = v.x;
    var v1 = v.y;
    var v2 = v.z;
    var v3 = 1;    
    var x = v0*this.elements[0] + v1*this.elements[1] + v2*this.elements[2] + v3*this.elements[3];    
    var y = v0*this.elements[4] + v1*this.elements[5] + v2*this.elements[6] + v3*this.elements[7];    
    var z = v0*this.elements[8] + v1*this.elements[9] + v2*this.elements[10] + v3*this.elements[11];    
    var w = v0*this.elements[12] + v1*this.elements[13] + v2*this.elements[14] + v3*this.elements[15];
    // scale such that fourth element becomes 1:
    if(w != 1)
    {
      var invw=1.0/w;
      x *= invw;
      y *= invw;
      z *= invw;
    }
    return new CSG.Vector3D(x,y,z);       
  },
  
  // Multiply a CSG.Vector2D (interpreted as 1 row, 2 column) by this matrix 
  // Fourth element is taken as 1
  rightMultiply1x2Vector: function(v) {
    var v0 = v.x;
    var v1 = v.y;
    var v2 = 0;
    var v3 = 1;    
    var x = v0*this.elements[0] + v1*this.elements[1] + v2*this.elements[2] + v3*this.elements[3];    
    var y = v0*this.elements[4] + v1*this.elements[5] + v2*this.elements[6] + v3*this.elements[7];    
    var z = v0*this.elements[8] + v1*this.elements[9] + v2*this.elements[10] + v3*this.elements[11];    
    var w = v0*this.elements[12] + v1*this.elements[13] + v2*this.elements[14] + v3*this.elements[15];
    // scale such that fourth element becomes 1:
    if(w != 1)
    {
      var invw=1.0/w;
      x *= invw;
      y *= invw;
      z *= invw;
    }
    return new CSG.Vector2D(x,y);       
  },
};

// return the unity matrix
CSG.Matrix4x4.unity = function() {
  return new CSG.Matrix4x4(); 
};

// Create a rotation matrix for rotating around the x axis
CSG.Matrix4x4.rotationX = function(degrees) {
  var radians = degrees * Math.PI * (1.0/180.0);
  var cos = Math.cos(radians);
  var sin = Math.sin(radians);
  var els = [
    1, 0, 0, 0,
    0, cos, -sin, 0,
    0, sin, cos, 0,
    0, 0, 0, 1
  ];
  return new CSG.Matrix4x4(els);
};

// Create a rotation matrix for rotating around the y axis
CSG.Matrix4x4.rotationY = function(degrees) {
  var radians = degrees * Math.PI * (1.0/180.0);
  var cos = Math.cos(radians);
  var sin = Math.sin(radians);
  var els = [
    cos, 0, sin, 0,
    0, 1, 0, 0,
    -sin, 0, cos, 0,
    0, 0, 0, 1
  ];
  return new CSG.Matrix4x4(els);
};

// Create a rotation matrix for rotating around the z axis
CSG.Matrix4x4.rotationZ = function(degrees) {
  var radians = degrees * Math.PI * (1.0/180.0);
  var cos = Math.cos(radians);
  var sin = Math.sin(radians);
  var els = [
    cos, -sin, 0, 0,
    sin, cos, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
  return new CSG.Matrix4x4(els);
};

// Create an affine matrix for translation:
CSG.Matrix4x4.translation = function(v) {
  // parse as CSG.Vector3D, so we can pass an array or a CSG.Vector3D
  var vec = new CSG.Vector3D(v);
  var els = [
    1, 0, 0, vec.x,
    0, 1, 0, vec.y,
    0, 0, 1, vec.z,
    0, 0, 0, 1
  ];
  return new CSG.Matrix4x4(els);
};

// Create an affine matrix for scaling:
CSG.Matrix4x4.scaling = function(v) {
  // parse as CSG.Vector3D, so we can pass an array or a CSG.Vector3D
  var vec = new CSG.Vector3D(v);
  var els = [
    vec.x, 0, 0, 0,
    0, vec.y, 0, 0,
    0, 0, vec.z, 0,
    0, 0, 0, 1
  ];
  return new CSG.Matrix4x4(els);
};

///////////////////////////////////////////////////

// # class Vector2D:
// Represents a 2 element vector
CSG.Vector2D = function(x, y) {
  var ok = true;
  if (arguments.length == 1)
  {
    if(typeof(x) == "object")
    {
      if(x instanceof Array)
      {
        this.x = x[0];
        this.y = x[1];
      }  
      else if( ('x' in x) && ('y' in x) )
      {
        this.x = x.x;
        this.y = x.y;
      }
      else ok = false;
    }
    else
    {
      var v = Number(x);
      this.x = v;
      this.y = v;
    }
  }
  else if (arguments.length == 2)
  {
    this.x = Number(x);
    this.y = Number(y);
  }
  else ok = false;
  if(!ok)
  {
    throw new Error("wrong arguments");
  }
};

CSG.Vector2D.prototype = {
  // extend to a 3D vector by adding a z coordinate:
  toVector3D: function(z) {
    return new CSG.Vector3D(this.x, this.y, z);
  },
  
  equals: function(a) {
    return (this.x == a.x) && (this.y == a.y);
  },
  
  clone: function() {
    return new CSG.Vector2D(this.x, this.y);
  },

  negated: function() {
    return new CSG.Vector2D(-this.x, -this.y);
  },

  plus: function(a) {
    return new CSG.Vector2D(this.x + a.x, this.y + a.y);
  },

  minus: function(a) {
    return new CSG.Vector2D(this.x - a.x, this.y - a.y);
  },

  times: function(a) {
    return new CSG.Vector2D(this.x * a, this.y * a);
  },

  dividedBy: function(a) {
    return new CSG.Vector2D(this.x / a, this.y / a);
  },

  dot: function(a) {
    return this.x * a.x + this.y * a.y;
  },

  lerp: function(a, t) {
    return this.plus(a.minus(this).times(t));
  },

  length: function() {
    return Math.sqrt(this.dot(this));
  },

  distanceTo: function(a) {
    return this.minus(a).length();
  },

  unit: function() {
    return this.dividedBy(this.length());
  },

  // returns the vector rotated by 90 degrees clockwise
  normal: function() {
    return new CSG.Vector2D(this.y, -this.x);
  },

  // Right multiply by a 4x4 matrix (the vector is interpreted as a row vector)
  // Returns a new CSG.Vector2D
  multiply4x4: function(matrix4x4) {
    return matrix4x4.rightMultiply1x2Vector(this);
  },
};

// A polygon in 2D space:
CSG.Polygon2D = function(points, shared) {
  var vectors = [];
  if(arguments.length >= 1) {
    points.map( function(p) {
      vectors.push(new CSG.Vector2D(p) );
    });    
  }
  this.points = vectors;
  this.shared = shared;
};

CSG.Polygon2D.prototype = {
  // Matrix transformation of polygon. Returns a new CSG.Polygon2D
  transform: function(matrix4x4) {
    var newpoints = this.points.map(function(p) { return p.multiply4x4(matrix4x4); } );
    return new CSG.Polygon2D(newpoints, this.shared);
  },
  
  translate: function(v) {
    v=new CSG.Vector2D(v);
    return this.transform(CSG.Matrix4x4.translation(v.toVector3D(0)));
  },
  
  scale: function(f) {
    f=new CSG.Vector2D(f);
    return this.transform(CSG.Matrix4x4.scaling(f.toVector3D(1)));
  },
  
  rotate: function(deg) {
    return this.transform(CSG.Matrix4x4.rotationZ(deg));
  },    
  
  // convert into a CSG.Polygon; set z coordinate to the given value
  toPolygon3D: function(z) {
    var points3d=[];
    this.points.map( function(p) {
      var vec3d = p.toVector3D(z);      
      points3d.push(vec3d);
    });
    var polygon = CSG.Polygon.createFromPoints(points3d, this.shared);
    polygon.checkIfConvex();
    return polygon;
  },
  
  // extruded=shape2d.extrude({offset: [0,0,10], twistangle: 360, twiststeps: 100});
  // linear extrusion of 2D polygon, with optional twist
  // The 2d polygon is placed in in z=0 plane and extruded into direction <offset> (a CSG.Vector3D)
  // The final face is rotated <twistangle> degrees. Rotation is done around the origin of the 2d shape (i.e. x=0, y=0)
  // twiststeps determines the resolution of the twist (should be >= 1)  
  // returns a CSG object
  extrude: function(options) {
    var offsetvector = CSG.parseOptionAs3DVector(options, "offset", [0,0,1]);
    var twistangle = CSG.parseOptionAsFloat(options, "twistangle", 0);
    var twiststeps = CSG.parseOptionAsInt(options, "twiststeps", 10);

    // create the polygons:        
    var newpolygons = [];
    
    // bottom face polygon:
    var bottomfacepolygon = this.toPolygon3D(0);
    var direction = bottomfacepolygon.plane.normal.dot(offsetvector);
    if(direction > 0)
    {
      bottomfacepolygon = bottomfacepolygon.flipped();
    }
    newpolygons.push(bottomfacepolygon);
    
    var getTwistedPolygon = function(twiststep) {
      var fraction = (twiststep + 1) / twiststeps;
      var rotation = twistangle * fraction;
      var offset = offsetvector.times(fraction);
      var transformmatrix = CSG.Matrix4x4.rotationZ(rotation).multiply( CSG.Matrix4x4.translation(offset) );
      var polygon = bottomfacepolygon.transform(transformmatrix);      
      return polygon;
    };

    // create the side face polygons:
    var numvertices = bottomfacepolygon.vertices.length;
    var prevlevelpolygon = bottomfacepolygon;
    for(var twiststep=0; twiststep < twiststeps; ++twiststep)
    {
      var levelpolygon = getTwistedPolygon(twiststep);
      for(var i=0; i < numvertices; i++)
      {
        var sidefacepoints = [];
        var nexti = (i < (numvertices-1))? i+1:0;
        sidefacepoints.push(prevlevelpolygon.vertices[i].pos);
        sidefacepoints.push(levelpolygon.vertices[i].pos);
        sidefacepoints.push(levelpolygon.vertices[nexti].pos);
        sidefacepoints.push(prevlevelpolygon.vertices[nexti].pos);
        var sidefacepolygon=CSG.Polygon.createFromPoints(sidefacepoints, this.shared);
        newpolygons.push(sidefacepolygon);
      }
      if(twiststep == (twiststeps -1) )
      {
        // last level; add the top face polygon:
        levelpolygon = levelpolygon.flipped(); // flip so that the normal points outwards
        newpolygons.push(levelpolygon);
      }
      prevlevelpolygon = levelpolygon;
    }

    return CSG.fromPolygons(newpolygons);
  }
};



// # class Line2D

// Represents a directional line in 2D space
// A line is parametrized by its normal vector (perpendicular to the line, rotated 90 degrees counter clockwise)
// and w. The line passes through the point <normal>.times(w).
// normal must be a unit vector!
// Equation: p is on line if normal.dot(p)==w
CSG.Line2D = function(normal, w) {
  this.normal = normal;
  this.w = w;
};

CSG.Line2D.fromPoints = function(p1, p2) {
  var direction = p2.minus(p1);
  var normal = direction.normal().negated().unit();
  var w = p1.dot(normal);
  return new CSG.Line2D(normal, w); 
};

CSG.Line2D.prototype = {
  // same line but opposite direction:
  inverse: function() {
    return new CSG.Line2D(this.normal.negated(), -this.w);
  },
  
  equals: function(l) {
    return (l.normal.equals(this.normal) && (l.w == this.w));
  },
  
  origin: function() {
    return this.normal.times(this.w);
  },

  direction: function() {
    return this.normal.normal(); 
  },
  
  xAtY: function(y) {
    // (py == y) && (normal * p == w)
    // -> px = (w - normal.y * y) / normal.x
    var x = (this.w - this.normal.y * y) / this.normal.x;
    return x; 
  },
  
  absDistanceToPoint: function(point) {
    var point_projected = point.dot(this.normal);
    var distance = Math.abs(point_projected - this.w);
    return distance;
  },
  
  closestPoint: function(point) {
    var vector = point.dot(this.direction());
    return origin.plus(vector);  
  },
};

// # class Line3D

// Represents a line in 3D space
// direction must be a unit vector 
// point is a random point on the line

CSG.Line3D = function(point, direction) {
  this.point = point;
  this.direction = direction;
};

CSG.Line3D.fromPoints = function(p1, p2) {
  var direction = p2.minus(p1).unit();
  return new CSG.Line3D(p1, direction);
};

CSG.Line3D.fromPlanes = function(p1, p2) {
  var direction = p1.normal.cross(p2.normal);
  var l=direction.length();
  if(l < 1e-10)
  {
    throw new Error("Parallel planes");
  }
  direction = direction.times(1.0/l);

  var mabsx = Math.abs(direction.x);
  var mabsy = Math.abs(direction.y);
  var mabsz = Math.abs(direction.z);
  var origin;
  if( (mabsx >= mabsy) && (mabsx >= mabsz) )
  {
    // direction vector is mostly pointing towards x
    // find a point p for which x is zero:
    var r = CSG.Line3D.Solve2Linear(p1.normal.y, p1.normal.z, p2.normal.y, p2.normal.z, p1.w, p2.w);    
    origin = new CSG.Vector3D(0, r[0], r[1]);
  }
  else if( (mabsy >= mabsx) && (mabsy >= mabsz) )
  {
    // find a point p for which y is zero:
    var r = CSG.Line3D.Solve2Linear(p1.normal.x, p1.normal.z, p2.normal.x, p2.normal.z, p1.w, p2.w);    
    origin = new CSG.Vector3D(r[0], 0, r[1]);
  }
  else
  {
    // find a point p for which z is zero:
    var r = CSG.Line3D.Solve2Linear(p1.normal.x, p1.normal.y, p2.normal.x, p2.normal.y, p1.w, p2.w);    
    origin = new CSG.Vector3D(r[0], r[1], 0);
  }
  return new CSG.Line3D(origin, direction);
};

// solve
// [ab][x] = [u]
// [cd][y]   [v]
CSG.Line3D.Solve2Linear = function(a,b,c,d,u,v) {
  var det = a*d - b*c;
  var invdet = 1.0/det;
  var x = u*d - b*v;
  var y = -u*c + a*v;
  x *= invdet;
  y *= invdet;
  return [x,y];
};

CSG.Line3D.prototype = {
  intersectWithPlane: function(plane) {
    // plane: plane.normal * p = plane.w
    // line: p=line.point + labda * line.direction
    var labda = (plane.w - plane.normal.dot(this.point)) / plane.normal.dot(this.direction);
    var point = this.point.plus(this.direction.times(labda));
    return point;
  },
  
  clone: function(line) {
    return new CSG.Line3D(this.point.clone(), this.direction.clone());
  },
  
  reverse: function() {
    return new CSG.Line3D(this.point.clone(), this.direction.negated());
  },
  
  transform: function(matrix4x4) {
    var newpoint = this.point.multiply4x4(matrix4x4);
    var pointPlusDirection = this.point.plus(this.direction);
    var newPointPlusDirection = pointPlusDirection.multiply4x4(matrix4x4);
    var newdirection = newPointPlusDirection.minus(newpoint);
    return new CSG.Line3D(newpoint, newdirection);  
  },  
  
  closestPointOnLine: function(point) {
    var t = point.minus(this.point).dot(this.direction) / this.direction.dot(this.direction);
    var closestpoint = this.point.plus(this.direction.times(t));
    return closestpoint;
  },
  
  distanceToPoint: function(point) {
    var closestpoint = this.closestPointOnLine(point);
    var distancevector = point.minus(closestpoint);
    var distance = distancevector.length();
    return distance;
  },
  
  equals: function(line3d) {
    if(!this.direction.equals(line3d.direction)) return false;
    var distance = this.distanceToPoint(line3d.point);
    if(distance > 1e-8) return false;
    return true;    
  },
};


// # class OrthoNormalBasis

// Reprojects points on a 3D plane onto a 2D plane
// or from a 2D plane back onto the 3D plane

CSG.OrthoNormalBasis = function (plane) {
  // choose an arbitrary right hand vector, making sure it is somewhat orthogonal to the plane normal:
  var rightvector;
  if(Math.abs(plane.normal.x) > Math.abs(plane.normal.y))
  {
    rightvector = new CSG.Vector3D(0, 1, 0);
  }
  else
  {
    rightvector = new CSG.Vector3D(1, 0, 0);
  }
  this.v = rightvector.cross(plane.normal).unit();
  this.u = plane.normal.cross(this.v);
  this.planeorigin = plane.normal.times(plane.w);
};

CSG.OrthoNormalBasis.prototype = {
  to2D: function(vec3) {
    return new CSG.Vector2D(vec3.dot(this.u), vec3.dot(this.v));
  },
  
  to3D: function(vec2) {
    return this.planeorigin.plus(this.u.times(vec2.x)).plus(this.v.times(vec2.y));
  },
  
  line3Dto2D: function(line3d) {
    var a = line3d.point;
    var b = line3d.direction.plus(a);
    var a2d = this.to2D(a);
    var b2d = this.to2D(b);
    return CSG.Line2D.fromPoints(a2d, b2d);
  },

  line2Dto3D: function(line2d) {
    var a = line2d.origin();
    var b = line2d.direction().plus(a);
    var a3d = this.to3D(a);
    var b3d = this.to3D(b);
    return CSG.Line3D.fromPoints(a3d, b3d);
  },
};

function insertSorted(array, element, comparefunc) {
  var leftbound = 0;
  var rightbound = array.length;
  while(rightbound > leftbound)
  {
    var testindex = Math.floor( (leftbound + rightbound) / 2);
    var testelement = array[testindex];
    var compareresult = comparefunc(element, testelement);
    if(compareresult > 0)   // element > testelement
    {
      leftbound = testindex + 1;
    }
    else
    {
      rightbound = testindex;
    }    
  }
  array.splice(leftbound,0,element);
}

// Get the x coordinate of a point with a certain y coordinate, interpolated between two
// points (CSG.Vector2D).
// Interpolation is robust even if the points have the same y coordinate
CSG.interpolateBetween2DPointsForY = function(point1, point2, y) {
  var f1 = y - point1.y;
  var f2 = point2.y - point1.y;
  if(f2 < 0)
  {
    f1 = -f1;
    f2 = -f2;
  }
  var t;
  if(f1 <= 0)
  {
    t = 0.0;
  }
  else if(f1 >= f2)
  {
    t = 1.0;
  }
  else if(f2 < 1e-10)
  {
    t = 0.5;
  }
  else
  {
    t = f1 / f2;
  }
  var result = point1.x + t * (point2.x - point1.x);
  return result;
};

// Retesselation function for a set of coplanar polygons. See the introduction at the top of
// this file.
CSG.reTesselateCoplanarPolygons = function(sourcepolygons, destpolygons)
{
  var EPS = 1e-5;
  
  var numpolygons = sourcepolygons.length;
  if(numpolygons > 0)
  {
    var plane = sourcepolygons[0].plane;
    var orthobasis = new CSG.OrthoNormalBasis(plane);
    var polygonvertices2d = [];    // array of array of CSG.Vector2D
    var polygontopvertexindexes = []; // array of indexes of topmost vertex per polygon
    var topy2polygonindexes = {};
    var ycoordinatetopolygonindexes = {};
    
    var xcoordinatebins = {};    
    var ycoordinatebins = {};    
    
    // convert all polygon vertices to 2D
    // Make a list of all encountered y coordinates
    // And build a map of all polygons that have a vertex at a certain y coordinate:    
    var ycoordinateBinningFactor = 1.0/EPS * 10;
    for(var polygonindex=0; polygonindex < numpolygons; polygonindex++)
    {
      var poly3d = sourcepolygons[polygonindex];
      var vertices2d = [];
      var numvertices = poly3d.vertices.length;
      var minindex = -1;
      if(numvertices > 0)
      {
        var miny, maxy, maxindex;
        for(var i=0; i < numvertices; i++)
        {
          var pos2d = orthobasis.to2D(poly3d.vertices[i].pos);
          // perform binning of y coordinates: If we have multiple vertices very
          // close to each other, give them the same y coordinate:
          var ycoordinatebin = Math.floor(pos2d.y * ycoordinateBinningFactor);
          if(ycoordinatebin in ycoordinatebins)
          {
            pos2d.y = ycoordinatebins[ycoordinatebin];
          }
          else if(ycoordinatebin+1 in ycoordinatebins)
          {
            pos2d.y = ycoordinatebins[ycoordinatebin+1];
          }
          else if(ycoordinatebin-1 in ycoordinatebins)
          {
            pos2d.y = ycoordinatebins[ycoordinatebin-1];
          }
          else
          {
            ycoordinatebins[ycoordinatebin] = pos2d.y;
          }
          vertices2d.push(pos2d);
          var y = pos2d.y;
          if( (i == 0) || (y < miny) )
          {
            miny = y;
            minindex = i;
          }
          if( (i == 0) || (y > maxy) )
          {
            maxy = y;
            maxindex = i;
          }
          if(! (y in ycoordinatetopolygonindexes))
          {
            ycoordinatetopolygonindexes[y] = {};
          }
          ycoordinatetopolygonindexes[y][polygonindex]=true;
        }
        if(miny >= maxy)
        {
          // degenerate polygon, all vertices have same y coordinate. Just ignore it from now:
          vertices2d = [];
        }
        else
        {
          if(! (miny in topy2polygonindexes))
          {
            topy2polygonindexes[miny] = [];
          }
          topy2polygonindexes[miny].push(polygonindex);          
        }
      }  // if(numvertices > 0)
      polygonvertices2d.push(vertices2d); 
      polygontopvertexindexes.push(minindex); 
    }
    var ycoordinates = [];
    for(var ycoordinate in ycoordinatetopolygonindexes) ycoordinates.push(ycoordinate);
    ycoordinates.sort(function(a,b) {return a-b});

    // Now we will iterate over all y coordinates, from lowest to highest y coordinate
    // activepolygons: source polygons that are 'active', i.e. intersect with our y coordinate
    //   Is sorted so the polygons are in left to right order
    // Each element in activepolygons has these properties:
    //        polygonindex: the index of the source polygon (i.e. an index into the sourcepolygons and polygonvertices2d arrays)
    //        leftvertexindex: the index of the vertex at the left side of the polygon (lowest x) that is at or just above the current y coordinate
    //        rightvertexindex: dito at right hand side of polygon
    //        topleft, bottomleft: coordinates of the left side of the polygon crossing the current y coordinate  
    //        topright, bottomright: coordinates of the right hand side of the polygon crossing the current y coordinate  
    var activepolygons = [];
    var prevoutpolygonrow = [];
    for(var yindex = 0; yindex < ycoordinates.length; yindex++)
    {
      var newoutpolygonrow = [];
      var ycoordinate_as_string = ycoordinates[yindex];
      var ycoordinate = Number(ycoordinate_as_string);
      
      // update activepolygons for this y coordinate:
      // - Remove any polygons that end at this y coordinate
      // - update leftvertexindex and rightvertexindex (which point to the current vertex index 
      //   at the the left and right side of the polygon
      // Iterate over all polygons that have a corner at this y coordinate:
      var polygonindexeswithcorner = ycoordinatetopolygonindexes[ycoordinate_as_string];
      for(var activepolygonindex = 0; activepolygonindex < activepolygons.length; ++activepolygonindex)  
      {
        var activepolygon = activepolygons[activepolygonindex];
        var polygonindex = activepolygon.polygonindex;
        if(polygonindexeswithcorner[polygonindex])
        {
          // this active polygon has a corner at this y coordinate:
          var vertices2d = polygonvertices2d[polygonindex];
          var numvertices = vertices2d.length;
          var newleftvertexindex = activepolygon.leftvertexindex;
          var newrightvertexindex = activepolygon.rightvertexindex;
          // See if we need to increase leftvertexindex or decrease rightvertexindex:
          while(true)
          {
            var nextleftvertexindex = newleftvertexindex+1;
            if(nextleftvertexindex >= numvertices) nextleftvertexindex = 0;
            if(vertices2d[nextleftvertexindex].y != ycoordinate) break;
            newleftvertexindex = nextleftvertexindex;
          }
          var nextrightvertexindex = newrightvertexindex-1;
          if(nextrightvertexindex < 0) nextrightvertexindex = numvertices-1;
          if(vertices2d[nextrightvertexindex].y == ycoordinate)
          {
            newrightvertexindex = nextrightvertexindex;
          }
          if( (newleftvertexindex != activepolygon.leftvertexindex) && (newleftvertexindex == newrightvertexindex) )
          {
            // We have increased leftvertexindex or decreased rightvertexindex, and now they point to the same vertex
            // This means that this is the bottom point of the polygon. We'll remove it:
            activepolygons.splice(activepolygonindex, 1);
            --activepolygonindex;            
          }
          else 
          {
            activepolygon.leftvertexindex = newleftvertexindex;
            activepolygon.rightvertexindex = newrightvertexindex;
            activepolygon.topleft = vertices2d[newleftvertexindex];
            activepolygon.topright = vertices2d[newrightvertexindex];
            var nextleftvertexindex = newleftvertexindex+1;
            if(nextleftvertexindex >= numvertices) nextleftvertexindex = 0;
            activepolygon.bottomleft = vertices2d[nextleftvertexindex];
            var nextrightvertexindex = newrightvertexindex-1;
            if(nextrightvertexindex < 0) nextrightvertexindex = numvertices-1;
            activepolygon.bottomright = vertices2d[nextrightvertexindex];            
          } 
        } // if polygon has corner here
      }  // for activepolygonindex

      var nextycoordinate;      
      if(yindex >= ycoordinates.length-1)
      {
        // last row, all polygons must be finished here:
        activepolygons = [];
        nextycoordinate = null;
      }
      else // yindex < ycoordinates.length-1
      {
        nextycoordinate = Number(ycoordinates[yindex+1]);
        var middleycoordinate = 0.5 * (ycoordinate + nextycoordinate);
        // update activepolygons by adding any polygons that start here: 
        var startingpolygonindexes = topy2polygonindexes[ycoordinate_as_string];      
        for(var polygonindex_key in startingpolygonindexes)
        {
          var polygonindex = startingpolygonindexes[polygonindex_key];
          var vertices2d = polygonvertices2d[polygonindex];
          var numvertices = vertices2d.length;
          var topvertexindex = polygontopvertexindexes[polygonindex];
          // the top of the polygon may be a horizontal line. In that case topvertexindex can point to any point on this line.
          // Find the left and right topmost vertices which have the current y coordinate:
          var topleftvertexindex = topvertexindex;
          while(true)
          {
            var i = topleftvertexindex + 1;
            if(i >= numvertices) i = 0;
            if(vertices2d[i].y != ycoordinate) break;
            if(i == topvertexindex) break; // should not happen, but just to prevent endless loops
            topleftvertexindex = i;          
          }
          var toprightvertexindex = topvertexindex;
          while(true)
          {
            var i = toprightvertexindex - 1;
            if(i < 0) i = numvertices - 1;
            if(vertices2d[i].y != ycoordinate) break;
            if(i == topleftvertexindex) break; // should not happen, but just to prevent endless loops
            toprightvertexindex = i;          
          }
          var nextleftvertexindex = topleftvertexindex+1;
          if(nextleftvertexindex >= numvertices) nextleftvertexindex = 0;
          var nextrightvertexindex = toprightvertexindex-1;
          if(nextrightvertexindex < 0) nextrightvertexindex = numvertices-1;
          var newactivepolygon = {
            polygonindex: polygonindex,
            leftvertexindex: topleftvertexindex,
            rightvertexindex: toprightvertexindex,
            topleft: vertices2d[topleftvertexindex],
            topright: vertices2d[toprightvertexindex],
            bottomleft: vertices2d[nextleftvertexindex],
            bottomright: vertices2d[nextrightvertexindex],            
          };
          insertSorted(activepolygons, newactivepolygon, function(el1, el2) {
            var x1 = CSG.interpolateBetween2DPointsForY(el1.topleft, el1.bottomleft, middleycoordinate); 
            var x2 = CSG.interpolateBetween2DPointsForY(el2.topleft, el2.bottomleft, middleycoordinate); 
            if(x1 > x2) return 1;
            if(x1 < x2) return -1;
            return 0;
          });
        } // for(var polygonindex in startingpolygonindexes)
      } //  yindex < ycoordinates.length-1
      //if( (yindex == ycoordinates.length-1) || (nextycoordinate - ycoordinate > EPS) )
      if(true)
      {
        // Now activepolygons is up to date
        // Build the output polygons for the next row in newoutpolygonrow:
        for(var activepolygon_key in activepolygons)
        {
          var activepolygon = activepolygons[activepolygon_key];
          var polygonindex = activepolygon.polygonindex;
          var vertices2d = polygonvertices2d[polygonindex];
          var numvertices = vertices2d.length;

          var x = CSG.interpolateBetween2DPointsForY(activepolygon.topleft, activepolygon.bottomleft, ycoordinate);          
          var topleft=new CSG.Vector2D(x, ycoordinate); 
          x = CSG.interpolateBetween2DPointsForY(activepolygon.topright, activepolygon.bottomright, ycoordinate);          
          var topright=new CSG.Vector2D(x, ycoordinate); 
          x = CSG.interpolateBetween2DPointsForY(activepolygon.topleft, activepolygon.bottomleft, nextycoordinate);          
          var bottomleft=new CSG.Vector2D(x, nextycoordinate); 
          x = CSG.interpolateBetween2DPointsForY(activepolygon.topright, activepolygon.bottomright, nextycoordinate);          
          var bottomright=new CSG.Vector2D(x, nextycoordinate);                      
          var outpolygon = {
            topleft: topleft, 
            topright: topright,
            bottomleft: bottomleft, 
            bottomright: bottomright,
            leftline: CSG.Line2D.fromPoints(topleft, bottomleft),
            rightline: CSG.Line2D.fromPoints(bottomright, topright),
          };
          if(newoutpolygonrow.length > 0)
          {
            var prevoutpolygon = newoutpolygonrow[newoutpolygonrow.length - 1];
            var d1 = outpolygon.topleft.distanceTo(prevoutpolygon.topright);
            var d2 = outpolygon.bottomleft.distanceTo(prevoutpolygon.bottomright);
            if( (d1 < EPS) && (d2 < EPS) )
            {          
              // we can join this polygon with the one to the left:
              outpolygon.topleft = prevoutpolygon.topleft;
              outpolygon.leftline = prevoutpolygon.leftline;            
              outpolygon.bottomleft = prevoutpolygon.bottomleft;
              newoutpolygonrow.splice(newoutpolygonrow.length - 1, 1);
            }          
          }
          newoutpolygonrow.push(outpolygon);
        } // for(activepolygon in activepolygons)
        if(yindex > 0)
        {
          // try to match the new polygons against the previous row:
          var prevcontinuedindexes = {};
          var matchedindexes = {};
          for(var i = 0; i < newoutpolygonrow.length; i++)
          {
            var thispolygon = newoutpolygonrow[i];
            for(var ii = 0; ii < prevoutpolygonrow.length; ii++)
            {
              if(!matchedindexes[ii])   // not already processed?
              {
                // We have a match if the sidelines are equal or if the top coordinates
                // are on the sidelines of the previous polygon
                var prevpolygon = prevoutpolygonrow[ii];
                if(prevpolygon.bottomleft.distanceTo(thispolygon.topleft) < EPS)
                {
                  if(prevpolygon.bottomright.distanceTo(thispolygon.topright) < EPS)
                  {
                    // Yes, the top of this polygon matches the bottom of the previous:
                    matchedindexes[ii] = true;
                    // Now check if the joined polygon would remain convex:
                    var d1 = thispolygon.leftline.direction().x - prevpolygon.leftline.direction().x;
                    var d2 = thispolygon.rightline.direction().x - prevpolygon.rightline.direction().x;                    
                    var leftlinecontinues = Math.abs(d1) < EPS;
                    var rightlinecontinues = Math.abs(d2) < EPS;
                    var leftlineisconvex = leftlinecontinues || (d1 >= 0);
                    var rightlineisconvex = rightlinecontinues || (d2 >= 0);
                    if(leftlineisconvex && rightlineisconvex)
                    {
                      // yes, both sides have convex corners:
                      // This polygon will continue the previous polygon
                      thispolygon.outpolygon = prevpolygon.outpolygon;
                      thispolygon.leftlinecontinues = leftlinecontinues;
                      thispolygon.rightlinecontinues = rightlinecontinues;
                      prevcontinuedindexes[ii] = true;
                    }
                    break;                  
                  }
                }
              } // if(!prevcontinuedindexes[ii])
            } // for ii
          } // for i
          for(var ii = 0; ii < prevoutpolygonrow.length; ii++)
          {
            if(!prevcontinuedindexes[ii])
            {
              // polygon ends here
              // Finish the polygon with the last point(s):
              var prevpolygon = prevoutpolygonrow[ii];
              prevpolygon.outpolygon.rightpoints.push(prevpolygon.bottomright);
              if(prevpolygon.bottomright.distanceTo(prevpolygon.bottomleft) > EPS)
              {
                // polygon ends with a horizontal line:
                prevpolygon.outpolygon.leftpoints.push(prevpolygon.bottomleft);
              }
              // reverse the right half so we get a counterclockwise circle:
              prevpolygon.outpolygon.rightpoints.reverse();
              var points2d = prevpolygon.outpolygon.leftpoints.concat(prevpolygon.outpolygon.rightpoints); 
              var vertices3d = [];
              points2d.map(function(point2d) {
                var point3d = orthobasis.to3D(point2d);
                var vertex3d = new CSG.Vertex(point3d);
                vertices3d.push(vertex3d);              
              });
              var shared = null;
              var polygon = new CSG.Polygon(vertices3d, shared, plane);
              destpolygons.push(polygon);
            }
          }                
        } // if(yindex > 0)
        for(var i = 0; i < newoutpolygonrow.length; i++)
        {
          var thispolygon = newoutpolygonrow[i];
          if(!thispolygon.outpolygon)
          {
            // polygon starts here:
            thispolygon.outpolygon = {
              leftpoints: [],
              rightpoints: [],
            };
            thispolygon.outpolygon.leftpoints.push(thispolygon.topleft);
            if(thispolygon.topleft.distanceTo(thispolygon.topright) > EPS)
            {
              // we have a horizontal line at the top:
              thispolygon.outpolygon.rightpoints.push(thispolygon.topright);
            }
          }
          else
          {
            // continuation of a previous row
            if(! thispolygon.leftlinecontinues )
            {
              thispolygon.outpolygon.leftpoints.push(thispolygon.topleft);
            }
            if(! thispolygon.rightlinecontinues )
            {
              thispolygon.outpolygon.rightpoints.push(thispolygon.topright);
            }
          }
        }
        prevoutpolygonrow = newoutpolygonrow;
      }
    } // for yindex 
  } // if(numpolygons > 0)
}

////////////////////////////////

// ## class fuzzyFactory

// This class acts as a factory for objects. We can search for an object with approximately
// the desired properties (say a rectangle with width 2 and height 1) 
// The lookupOrCreate() method looks for an existing object (for example it may find an existing rectangle
// with width 2.0001 and height 0.999. If no object is found, the user supplied callback is
// called, which should generate a new object. The new object is inserted into the database
// so it can be found by future lookupOrCreate() calls.

// Constructor:
//   numdimensions: the number of parameters for each object
//     for example for a 2D rectangle this would be 2
//   tolerance: The maximum difference for each parameter allowed to be considered a match

CSG.fuzzyFactory = function(numdimensions, tolerance) {
  var lookuptable = [];
  for(var i=0; i < numdimensions; i++)
  {
    lookuptable.push({});
  }
  this.lookuptable = lookuptable;
  this.nextElementId = 1;
  this.multiplier = 1.0 / tolerance;
  this.objectTable = {};
};

CSG.fuzzyFactory.prototype = {
  // var obj = f.lookupOrCreate([el1, el2, el3], function(elements) {/* create the new object */});
  // Performs a fuzzy lookup of the object with the specified elements.
  // If found, returns the existing object
  // If not found, calls the supplied callback function which should create a new object with
  // the specified properties. This object is inserted in the lookup database.
  lookupOrCreate: function(els, creatorCallback) {
    var object;
    var key = this.lookupKey(els);
    if(key === null)
    {
      object = creatorCallback(els);
      key = this.nextElementId++;
      this.objectTable[key] = object;
      for(var dimension = 0; dimension < els.length; dimension++)
      {
        var elementLookupTable = this.lookuptable[dimension];
        var value = els[dimension];
        var valueMultiplied = value * this.multiplier;
        var valueQuantized1 = Math.floor(valueMultiplied);
        var valueQuantized2 = Math.ceil(valueMultiplied);
        CSG.fuzzyFactory.insertKey(key, elementLookupTable, valueQuantized1);
        CSG.fuzzyFactory.insertKey(key, elementLookupTable, valueQuantized2);
      }      
    }
    else
    {
      object = this.objectTable[key];
    }
    return object;
  },

  // ----------- PRIVATE METHODS:
  lookupKey: function(els) {
    var keyset = {};
    for(var dimension=0; dimension < els.length; dimension++)
    {
      var elementLookupTable = this.lookuptable[dimension];
      var value = els[dimension];
      var valueQuantized = Math.round(value * this.multiplier);
      valueQuantized += "";
      if(valueQuantized in elementLookupTable)
      {
        if(dimension == 0)
        {
          keyset = elementLookupTable[valueQuantized];
        }
        else
        {
          keyset = CSG.fuzzyFactory.intersectSets(keyset, elementLookupTable[valueQuantized]);
        }
      }
      else
      {
        return null;
      }
      if(CSG.fuzzyFactory.isEmptySet(keyset)) return null;
    }
    // return first matching key:
    for(var key in keyset) return key;
    return null;
  },

  lookupKeySetForDimension: function(dimension, value) {
    var result;
    var elementLookupTable = this.lookuptable[dimension];
    var valueMultiplied = value * this.multiplier;
    var valueQuantized = Math.floor(value * this.multiplier);
    if(valueQuantized in elementLookupTable)
    {
      result = elementLookupTable[valueQuantized];
    } 
    else
    {
      result = {};
    }
    return result;
  },
};

CSG.fuzzyFactory.insertKey = function(key, lookuptable, quantizedvalue) {
  if(quantizedvalue in lookuptable)
  {
    lookuptable[quantizedvalue][key] = true;
  }
  else
  {
    var newset = {};
    newset[key] = true;
    lookuptable[quantizedvalue] = newset;
  }
};

CSG.fuzzyFactory.isEmptySet = function(obj) {
  for(var key in obj) return false;
  return true;
};

CSG.fuzzyFactory.intersectSets = function(set1, set2) {
  var result = {};
  for(var key in set1)
  {
    if(key in set2)
    {
      result[key] = true;
    }
  }
  return result;
};

CSG.fuzzyFactory.joinSets = function(set1, set2) {
  var result = {};
  for(var key in set1)
  {
    result[key] = true;
  }
  for(var key in set2)
  {
    result[key] = true;
  }
  return result;
};

//////////////////////////////////////

CSG.fuzzyCSGFactory = function() {
  this.vertexfactory = new CSG.fuzzyFactory(3, 1e-5);
  this.planefactory = new CSG.fuzzyFactory(4, 1e-5);
};

CSG.fuzzyCSGFactory.prototype = {
  getVertex: function(sourcevertex) {
    var elements = [sourcevertex.pos.x, sourcevertex.pos.y, sourcevertex.pos.z]; 
    var result = this.vertexfactory.lookupOrCreate(elements, function(els) {
      return sourcevertex;
    });
    return result;
  },
  
  getPlane: function(sourceplane) {
    var elements = [sourceplane.normal.x, sourceplane.normal.y, sourceplane.normal.z, sourceplane.w]; 
    var result = this.planefactory.lookupOrCreate(elements, function(els) {
      return sourceplane;
    });
    return result;
  },

  getPolygon: function(sourcepolygon) {
    var newplane = this.getPlane(sourcepolygon.plane);
    var _this = this;
    var newvertices = sourcepolygon.vertices.map(function(vertex) {
      return _this.getVertex(vertex);
    });
    return new CSG.Polygon(newvertices, sourcepolygon.shared, newplane);    
  },

  getCSG: function(sourcecsg) {
    var _this = this;
    var newpolygons = sourcecsg.polygons.map(function(polygon) {
      return _this.getPolygon(polygon);
    });
    return CSG.fromPolygons(newpolygons);
  },
};

//////////////////////////////////////

// Tag factory: we can request a unique tag through CSG.getTag() 
CSG.staticTag = 1;

CSG.getTag = function () {
  return CSG.staticTag++;
};
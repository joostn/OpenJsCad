function main(params) {
	// model of a foil to a strip with an inlet compartment
	// the foil is described with a function:
	// x(y)=  dxr*(y/yr)^4+x0

	// set up some position vectors
	var foilbot= new CSG.Vector2D([params.foilx0,params.foily0]) ;
	var foilref= new CSG.Vector2D([params.foilx0+params.foildxr,params.foilyr]) ;

	var inletbot =new CSG.Vector2D([params.xinlet,params.yinlet]) ; 
	var inletdim =new CSG.Vector2D([params.Linlet,params.Hinlet]) ; 
	var inlettop =new CSG.Vector2D([params.xinlet,params.yinlet+params.Hinlet]) ; 
	var zinctop  =new CSG.Vector2D([params.xinlet-params.Linlet,params.Hstrip]) ; 
	var striptop =new CSG.Vector2D([0,params.Hstrip]) ; 

	// create the foil
	var foilCAG=makeFoilCAG(
			params.nfoilpoints,
			foilbot,
			foilref,
			params.Hstrip,
			params.Linlet);
	
	// create circular connection between inlet and foil
	var circularCAG=makeCircularCAG(
		inletbot,
		inletdim,
		foilbot,
		foilref,
		params.Rcircle,
		params.alpha
		);

	// create the bath and inlet
	var zincbathCAG=makeZincBathCAG(
			inlettop,
			inletbot,
			inletdim,
			striptop,
			zinctop,
			params.rcorner
			);


	// put it all together and return
	foilCAG=foilCAG.union([zincbathCAG,circularCAG]);

	return [
	{
		name : "foilCAG",
	 	caption: "Foil ",
		data: foilCAG,
	},
	];
}
function getParameterDefinitions() {
	return [
{ name: 'Hstrip', caption: 'Hight of the vertical strip :', type: 'float', default: 150 },
	{ name: 'xinlet', caption: 'X position of the inlet:', type: 'float', default: 30 },
	{ name: 'yinlet', caption: 'Y position of the inlet:', type: 'float', default: 140 },
	{ name: 'Hinlet', caption: 'Height of the inlet:', type: 'float', default: 2 },
	{ name: 'Linlet', caption: 'Length of the inlet:', type: 'float', default: 10 },
	{ name: 'nfoilpoints', caption: 'Resolution of the strip:', type: 'float', default: 50 },
	{ name: 'Rcircle', caption: 'Radius of the circel connecting inlet and foil:', type: 'float', default: 15 },
	{ name: 'alpha', caption: 'Fraction of radius where circel cuts the foil', type: 'float', default: 0.8 },
	{ name: 'foily0', caption: 'Bottom position of the foil', type: 'float', default: 0 },
	{ name: 'foilx0', caption: 'Initial distrance of foil from strip at bottom (y=0)', type: 'float', default: 0.009},
	{ name: 'foildxr', caption: 'Distrance of foil from strip at reference point y=yr', type: 'float', default: 0.163},
	{ name: 'foilyr', caption: 'Reference point y=yr', type: 'float', default: 50},
	{ name: 'rcorner', caption: 'Radius of curvature at corner inlet', type: 'float', default: 2},
	];
}

function powerfun(x,dh,hr,h0)
{
	// the mathematical function describing the foil
	// x(y)=  dxr*(y/yr)^4+x0
	return dh*Math.pow(x/hr,4)+h0;
}

function makeFoilCAG(npoint,foilbot,foilref,Lfoil)
{
	// create the foil (y is running vertical, x is the distrance from the strip)
	
	var dy=Lfoil/(npoint-1);

	// increase in foil distance from bottom to reference point at yref
	var dxr=foilref.x-foilbot.x

	// start at the strip (x=0) at the bottom of the foil 
	var foilpath = new CSG.Path2D([[0,foilbot.y]]);

	// draw the foil from the bottom to the top
	for(var i=0;i<npoint;i++)
	{
		var yp=i*dy;
		var xp=powerfun(yp,dxr,foilref.y,foilbot.x);
		foilpath = foilpath.appendPoint([xp,yp]);
	}

	// make a closed CAG out of it
	foilpath = foilpath.appendPoint([0,foilbot.y+Lfoil]);
	foilpath = foilpath.close();
	return foilpath.innerToCAG();
}
	
function makeCircularCAG(
		inletbot,
		inletdim,
		foilbot,
		foilref,
		Rcircle,
		alpha
		)
{
	// create circular connection between inlet and foil
	var dxr=foilref.x-foilbot.x
	var ytang=inletbot.y-alpha*Rcircle;
	var xtang=powerfun(ytang,dxr,foilref.y,foilbot.x)

	var curvedpath=new CSG.Path2D(
			[
				[inletbot.x-inletdim.x/2.	,inletbot.y],
				[inletbot.x-inletdim.x		,inletbot.y]
			]);
	curvedpath=curvedpath.appendArc(
			[xtang,ytang],
			{
					xradius: Rcircle,
					yradius: Rcircle,
					xaxisrotation: 0,
					resolution: 48,
					clockwise: false,
					large: false,
			});
	curvedpath=curvedpath.appendPoint([0,ytang]);
	curvedpath=curvedpath.appendPoint([0,inletbot.y+inletdim.y]);
	curvedpath=curvedpath.appendPoint([inletbot.x-inletdim.x/2,inletbot.y+inletdim.y]);
	curvedpath=curvedpath.close();
    return	curvedpath.innerToCAG();

}

	// create the bath and inlet
function makeZincBathCAG(
			inlettop,
			inletbot,
			inletdim,
			striptop,
			zinctop,
			rcorner)
{
	// create bath and inlet connected to it
	inletandbath=CAG.rectangle({corner1: inletbot,corner2: striptop});

	var topblocks 	= new CAG();
	var topblock=CAG.roundedRectangle({corner1: inlettop,corner2: zinctop,
 		roundradius: rcorner, resolution: 24});
	var topblocksx	= topblock.translate([inletdim.x/2.0,0]);
	var topblocksy	= topblock.translate([0,rcorner]);
	topblocks		= topblock;
	topblocks		= topblocks.union([topblocksx,topblocksy]) ;

	return  inletandbath.subtract(topblocks);
}

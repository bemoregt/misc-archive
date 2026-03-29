/**
 * Han River (한강) — Random Map for 0 A.D.
 *
 * A river flows across the map. Players are split between the two banks.
 * Shallow tributaries and a meander give the river a natural look.
 */

Engine.LoadLibrary("rmgen");
Engine.LoadLibrary("rmgen-common");
Engine.LoadLibrary("rmbiome");

setSelectedBiome();

// ─── Terrain aliases ───────────────────────────────────────────────────────────
const tMainTerrain  = g_Terrains.mainTerrain;
const tForestFloor1 = g_Terrains.forestFloor1;
const tForestFloor2 = g_Terrains.forestFloor2;
const tCliff        = g_Terrains.cliff;
const tTier1Terrain = g_Terrains.tier1Terrain;
const tTier2Terrain = g_Terrains.tier2Terrain;
const tTier3Terrain = g_Terrains.tier3Terrain;
const tHill         = g_Terrains.hill;
const tRoad         = g_Terrains.road;
const tRoadWild     = g_Terrains.roadWild;
const tShore        = g_Terrains.shore;
const tWater        = g_Terrains.water;

// ─── Object aliases ────────────────────────────────────────────────────────────
const oTree1                   = g_Gaia.tree1;
const oTree2                   = g_Gaia.tree2;
const oTree3                   = g_Gaia.tree3;
const oTree4                   = g_Gaia.tree4;
const oTree5                   = g_Gaia.tree5;
const oFruitBush               = g_Gaia.fruitBush;
const oMainHuntableAnimal      = g_Gaia.mainHuntableAnimal;
const oSecondaryHuntableAnimal = g_Gaia.secondaryHuntableAnimal;
const oFish                    = g_Gaia.fish;
const oStoneLarge              = g_Gaia.stoneLarge;
const oStoneSmall              = g_Gaia.stoneSmall;
const oMetalLarge              = g_Gaia.metalLarge;
const oMetalSmall              = g_Gaia.metalSmall;

// ─── Decorative aliases ────────────────────────────────────────────────────────
const aGrass      = g_Decoratives.grass;
const aGrassShort = g_Decoratives.grassShort;
const aRockLarge  = g_Decoratives.rockLarge;
const aRockMedium = g_Decoratives.rockMedium;
const aBushMedium = g_Decoratives.bushMedium;
const aBushSmall  = g_Decoratives.bushSmall;

// Forest palette
const pForest1 = [
	tForestFloor2 + TERRAIN_SEPARATOR + oTree1,
	tForestFloor2 + TERRAIN_SEPARATOR + oTree2,
	tForestFloor2
];
const pForest2 = [
	tForestFloor1 + TERRAIN_SEPARATOR + oTree4,
	tForestFloor1 + TERRAIN_SEPARATOR + oTree5,
	tForestFloor1
];

// ─── Heights ───────────────────────────────────────────────────────────────────
const heightSeaGround = -4;
const heightShore     =  1;
const heightLand      =  3;

// ─── Map bootstrap ─────────────────────────────────────────────────────────────
var g_Map      = new RandomMap(heightLand, tMainTerrain);
var numPlayers = getNumPlayers();
var mapCenter  = g_Map.getCenter();
var mapBounds  = g_Map.getBounds();

// ─── Tile classes ──────────────────────────────────────────────────────────────
var clPlayer      = g_Map.createTileClass();
var clHill        = g_Map.createTileClass();
var clForest      = g_Map.createTileClass();
var clDirt        = g_Map.createTileClass();
var clRock        = g_Map.createTileClass();
var clMetal       = g_Map.createTileClass();
var clFood        = g_Map.createTileClass();
var clBaseResource= g_Map.createTileClass();
var clWater       = g_Map.createTileClass();
var clShallow     = g_Map.createTileClass();

// ─── River angle: 0 = horizontal river (flows left-right) ─────────────────────
// randomAngle() makes it rotate each game for variety
var startAngle = randomAngle();

// ═══════════════════════════════════════════════════════════════════════════════
// 1. PLAYER PLACEMENT  — split across both banks
// ═══════════════════════════════════════════════════════════════════════════════
placePlayerBases({
	"PlayerPlacement": playerPlacementRiver(startAngle + Math.PI / 2, fractionToTiles(0.6)),
	"PlayerTileClass":   clPlayer,
	"BaseResourceClass": clBaseResource,
	"CityPatch": {
		"outerTerrain": tRoadWild,
		"innerTerrain": tRoad
	},
	"StartingAnimal": {},
	"Berries": {
		"template": oFruitBush
	},
	"Mines": {
		"types": [
			{ "template": oMetalLarge },
			{ "template": oStoneLarge }
		]
	},
	"Trees": {
		"template": oTree1,
		"count": 2
	},
	"Decoratives": {
		"template": aGrassShort
	}
});

Engine.SetProgress(10);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MAIN RIVER
// ═══════════════════════════════════════════════════════════════════════════════
g_Map.log("Painting river");

paintRiver({
	"parallel":      false,
	"start":         new Vector2D(mapBounds.left,  mapCenter.y).rotateAround(startAngle, mapCenter),
	"end":           new Vector2D(mapBounds.right, mapCenter.y).rotateAround(startAngle, mapCenter),
	"width":         fractionToTiles(0.22),
	"fadeDist":      scaleByMapSize(4, 12),
	"deviation":     0,
	"heightRiverbed": heightSeaGround,
	"heightLand":    heightLand,
	"meanderShort":  16,
	"meanderLong":   0,
	"waterFunc": (position, height, riverFraction) => {
		createTerrain(height < -1.5 ? tWater : tShore).place(position);
	},
	"landFunc": (position, shoreDist1, shoreDist2) => {
		g_Map.setHeight(position, heightLand + 0.1);
	}
});

Engine.SetProgress(20);

// ─── Shallow tributaries branching off the main river ─────────────────────────
createTributaryRivers(
	startAngle,
	randIntInclusive(4, scaleByMapSize(8, 16)),
	scaleByMapSize(8, 18),
	heightSeaGround,
	[-6, -1.5],
	Math.PI / 5,
	clWater,
	clShallow,
	avoidClasses(clPlayer, 8, clBaseResource, 4)
);

// ─── Mark water tile class and paint terrain from height ──────────────────────
paintTerrainBasedOnHeight(-6,  0.5, 1, tWater);
paintTerrainBasedOnHeight( 0.5, heightLand, 1, tShore);
paintTileClassBasedOnHeight(-6, 0.5, 1, clWater);

Engine.SetProgress(28);

// ═══════════════════════════════════════════════════════════════════════════════
// 3. HILLS & BUMPS
// ═══════════════════════════════════════════════════════════════════════════════
g_Map.log("Creating bumps and hills");

createBumps(avoidClasses(clWater, 5, clPlayer, 20));

if (randBool())
	createHills(
		[tMainTerrain, tCliff, tHill],
		avoidClasses(clPlayer, 20, clHill, 15, clWater, 5),
		clHill,
		scaleByMapSize(1, 4) * numPlayers
	);
else
	createMountains(
		tCliff,
		avoidClasses(clPlayer, 20, clHill, 15, clWater, 5),
		clHill,
		scaleByMapSize(1, 4) * numPlayers
	);

Engine.SetProgress(40);

// ═══════════════════════════════════════════════════════════════════════════════
// 4. FORESTS
// ═══════════════════════════════════════════════════════════════════════════════
g_Map.log("Creating forests");

var [forestTrees, stragglerTrees] = getTreeCounts(...rBiomeTreeCount(1));
createDefaultForests(
	[tMainTerrain, tForestFloor1, tForestFloor2, pForest1, pForest2],
	avoidClasses(clPlayer, 20, clForest, 17, clHill, 0, clWater, 6),
	clForest,
	forestTrees
);

Engine.SetProgress(53);

// ═══════════════════════════════════════════════════════════════════════════════
// 5. TERRAIN PATCHES
// ═══════════════════════════════════════════════════════════════════════════════
g_Map.log("Creating dirt patches");
createLayeredPatches(
	[scaleByMapSize(3, 6), scaleByMapSize(5, 10), scaleByMapSize(8, 21)],
	[[tMainTerrain, tTier1Terrain], [tTier1Terrain, tTier2Terrain], [tTier2Terrain, tTier3Terrain]],
	[1, 1],
	avoidClasses(clWater, 1, clForest, 0, clHill, 0, clDirt, 5, clPlayer, 6),
	scaleByMapSize(15, 45),
	clDirt
);

g_Map.log("Creating grass patches");
createPatches(
	[scaleByMapSize(2, 4), scaleByMapSize(3, 7), scaleByMapSize(5, 15)],
	tTier3Terrain,
	avoidClasses(clWater, 1, clForest, 0, clHill, 0, clDirt, 5, clPlayer, 6),
	scaleByMapSize(15, 45),
	clDirt
);

Engine.SetProgress(62);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. MINES
// ═══════════════════════════════════════════════════════════════════════════════
g_Map.log("Creating mines");
createBalancedMetalMines(
	oMetalSmall,
	oMetalLarge,
	clMetal,
	avoidClasses(clWater, 2, clForest, 1, clPlayer, scaleByMapSize(20, 35), clHill, 1)
);

createBalancedStoneMines(
	oStoneSmall,
	oStoneLarge,
	clRock,
	avoidClasses(clWater, 2, clForest, 1, clPlayer, scaleByMapSize(20, 35), clHill, 1, clMetal, 10)
);

Engine.SetProgress(70);

// ═══════════════════════════════════════════════════════════════════════════════
// 7. FOOD
// ═══════════════════════════════════════════════════════════════════════════════
g_Map.log("Creating food");
createFood(
	[
		[new SimpleObject(oMainHuntableAnimal, 5, 7, 0, 4)],
		[new SimpleObject(oSecondaryHuntableAnimal, 2, 3, 0, 2)]
	],
	[3 * numPlayers, 3 * numPlayers],
	avoidClasses(clWater, 1, clForest, 0, clPlayer, 20, clHill, 0, clFood, 15),
	clFood
);

createFood(
	[[new SimpleObject(oFruitBush, 5, 7, 0, 4)]],
	[randIntInclusive(1, 4) * numPlayers + 2],
	avoidClasses(clWater, 3, clForest, 0, clPlayer, 20, clHill, 1, clFood, 10),
	clFood
);

createFood(
	[[new SimpleObject(oFish, 2, 3, 0, 2)]],
	[scaleByMapSize(3, 25) * numPlayers],
	[avoidClasses(clFood, 6), stayClasses(clWater, 4)],
	clFood
);

Engine.SetProgress(80);

// ═══════════════════════════════════════════════════════════════════════════════
// 8. DECORATIONS
// ═══════════════════════════════════════════════════════════════════════════════
g_Map.log("Creating decorations");
createDecoration(
	[
		[new SimpleObject(aRockMedium, 1, 3, 0, 1)],
		[new SimpleObject(aRockLarge,  1, 2, 0, 1), new SimpleObject(aRockMedium, 1, 3, 0, 2)],
		[new SimpleObject(aGrassShort, 1, 2, 0, 1)],
		[new SimpleObject(aGrass,      2, 4, 0, 1.8), new SimpleObject(aGrassShort, 3, 6, 1.2, 2.5)],
		[new SimpleObject(aBushMedium, 1, 2, 0, 2),   new SimpleObject(aBushSmall,  2, 4, 0, 2)]
	],
	[
		scaleByMapAreaAbsolute(16),
		scaleByMapAreaAbsolute(8),
		scaleByMapAreaAbsolute(13),
		scaleByMapAreaAbsolute(13),
		scaleByMapAreaAbsolute(13)
	],
	avoidClasses(clWater, 1, clForest, 0, clPlayer, 0, clHill, 0)
);

Engine.SetProgress(88);

// ═══════════════════════════════════════════════════════════════════════════════
// 9. STRAGGLER TREES
// ═══════════════════════════════════════════════════════════════════════════════
g_Map.log("Creating straggler trees");
createStragglerTrees(
	[oTree1, oTree2, oTree4, oTree3],
	avoidClasses(clWater, 1, clForest, 1, clHill, 1, clPlayer, 8, clMetal, 6, clRock, 6),
	clForest,
	stragglerTrees
);

// ═══════════════════════════════════════════════════════════════════════════════
// 10. NOMAD SPAWN
// ═══════════════════════════════════════════════════════════════════════════════
placePlayersNomad(
	clPlayer,
	avoidClasses(clWater, 4, clForest, 1, clMetal, 4, clRock, 4, clHill, 4, clFood, 2)
);

// ─── Water visuals ─────────────────────────────────────────────────────────────
setWaterColor(0.2, 0.4, 0.6);
setWaterTint(0.3, 0.5, 0.7);
setWaterWaviness(2.0);
setWaterType("river");
setWaterMurkiness(0.5);

Engine.SetProgress(100);
g_Map.ExportMap();

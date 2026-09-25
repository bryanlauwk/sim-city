import * as THREE from "three";

/**
 * Where Google's Photorealistic 3D Tiles sit in the scene. The map's
 * projection (src/lib/city/kl.ts) puts tile columns 0.00062° of longitude
 * apart from 101.7015°E and rows 0.00062° of latitude apart from 3.1615°N,
 * each tile centred on a whole number; scene x = column − 15.5 and
 * z = row − 15.5, with +x east and +z south.
 */
export const TILES_URL = "https://tile.googleapis.com/v1/3dtiles/root.json";
export const GOOGLE_LOGO = "https://maps.gstatic.com/mapfiles/api-3/images/google_white5_hdpi.png";

const STEP = 0.00062;
/** The geographic point at the scene origin. */
export const ORIGIN = { lat: 3.1615 - 15.5 * STEP, lon: 101.7015 + 15.5 * STEP };

/** Metres per map tile, east–west and north–south, at the map's latitude. */
export function metresPerTile(lat = ORIGIN.lat): { x: number; z: number } {
  // WGS84 lengths of a degree of longitude and latitude.
  const phi = THREE.MathUtils.degToRad(lat);
  const lonDeg = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  const latDeg = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
  return { x: lonDeg * STEP, z: latDeg * STEP };
}

/**
 * Starting guess for the ground's height above the WGS84 ellipsoid around
 * Bukit Bintang (about 55 m above sea level, with the geoid a few metres
 * above the ellipsoid). The layer measures the real ground once tiles load.
 */
export const GROUND_HEIGHT_M = 58;

/** Half the map square's side, in scene units: the game city lives inside it. */
export const MAP_HALF = 16;

/**
 * Four planes that, clipped as an intersection, cut away whatever lies inside
 * the map square (a column, so rooftops go too), leaving the real city
 * around the game's. `open` moves them so nothing is cut.
 */
export function mapClipPlanes(): THREE.Plane[] {
  return [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
  ];
}

export function setMapClip(planes: THREE.Plane[], clip: boolean): void {
  // A fragment is cut where it's behind every plane: x ∈ (−half, half) and
  // z ∈ (−half, half). Moving one plane a long way off empties that region.
  planes[0].constant = clip ? -MAP_HALF : 1e7;
  planes[1].constant = -MAP_HALF;
  planes[2].constant = -MAP_HALF;
  planes[3].constant = -MAP_HALF;
}

/** Whether a point would be cut away (the same test the GPU makes). */
export function isClipped(planes: THREE.Plane[], p: THREE.Vector3): boolean {
  return planes.every((pl) => pl.distanceToPoint(p) < 0);
}

/**
 * The ground's height from a handful of downward rays: a low percentile of
 * the hits, so rooftops don't count and one dip (a river, an underpass)
 * doesn't either. Null when too few rays hit anything.
 */
export function groundFromHits(heights: number[]): number | null {
  if (heights.length < 4) return null;
  const sorted = [...heights].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.2)];
}

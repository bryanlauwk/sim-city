/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  ORIGIN,
  groundFromHits,
  isClipped,
  mapClipPlanes,
  metresPerTile,
  setMapClip,
} from "./tilesPlacement";

describe("Google 3D tiles placement", () => {
  test("the scene origin is the middle of the map", () => {
    expect(ORIGIN.lon).toBeCloseTo(101.71111, 5);
    expect(ORIGIN.lat).toBeCloseTo(3.15189, 5);
  });

  test("a tile is about 69 m on each side", () => {
    const m = metresPerTile();
    expect(m.x).toBeGreaterThan(68.5);
    expect(m.x).toBeLessThan(69.2);
    expect(m.z).toBeGreaterThan(68.3);
    expect(m.z).toBeLessThan(68.8);
  });

  test("the backdrop cuts away only the map square, rooftops and all", () => {
    const planes = mapClipPlanes();
    setMapClip(planes, true);
    const at = (x: number, y: number, z: number) => isClipped(planes, new THREE.Vector3(x, y, z));
    expect(at(0, 0, 0)).toBe(true);
    expect(at(15.9, 5, -15.9)).toBe(true);
    expect(at(16.1, 0, 0)).toBe(false);
    expect(at(0, 0, -20)).toBe(false);
    expect(at(-40, 2, 40)).toBe(false);
  });

  test("photo mode cuts nothing", () => {
    const planes = mapClipPlanes();
    setMapClip(planes, false);
    expect(isClipped(planes, new THREE.Vector3(0, 0, 0))).toBe(false);
    expect(isClipped(planes, new THREE.Vector3(5, 1, -3))).toBe(false);
  });

  test("the ground ignores rooftops and a single dip", () => {
    expect(groundFromHits([0.3, 0.31, 0.29, 2.5, 4.1, 0.3, 0.32, -1.5, 1.2, 0.3])).toBeCloseTo(
      0.3,
      2,
    );
    expect(groundFromHits([0.3, 2])).toBeNull();
  });
});

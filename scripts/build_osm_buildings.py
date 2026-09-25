"""Build public/osm/kl-buildings.json: real building footprints for the map.

Downloads every building in the Golden Triangle from OpenStreetMap (via the
Overpass API; no account or key), converts it to map tiles with the same
projection as src/lib/city/kl.ts (tile x = (lon - 101.7015) / 0.00062,
tile y = (3.1615 - lat) / 0.00062, tiles centred on whole numbers), clips each
footprint to the tiles it covers (with a margin for pavements), and keeps the
real height where OSM has one ("height", or "building:levels" x 3.5 m).

Buildings that already have a hand-built landmark model are left out.

Output format:
  {"v": 1, "license": "...", "buildings": [[tile, height_m, [x0, z0, x1, z1, ...], id], ...]}
where height_m is -1 when unknown, x/z are tile-local coordinates in tile
units centred on the tile (-0.5..0.5), and id is shared by the pieces of one
building that spans several tiles.

The data is © OpenStreetMap contributors and available under the Open
Database License (ODbL 1.0); see public/osm/README.md.

Usage: python3 scripts/build_osm_buildings.py
"""

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

N = 32
LON0, LAT0, STEP = 101.7015, 3.1615, 0.00062
MARGIN = 0.44  # half-size of the buildable square inside each tile
MIN_AREA = 0.004  # tile² (about 17 m²); smaller clipped pieces are dropped
OUT = Path(__file__).resolve().parents[1] / "public" / "osm" / "kl-buildings.json"
MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
# Hand-built landmark models in kl.ts; their OSM footprints would double up.
LANDMARKS = re.compile(
    r"petronas|suria|menara kl|kl tower|maxis|four seasons|ilham|exchange 106|"
    r"merdeka 118|pavilion|lot 10|starhill|fahrenheit|sungei wang|bb plaza|"
    r"berjaya times square|convention cent|menara ta ?one|jalan alor",
    re.I,
)


def overpass(query: str) -> dict:
    last = None
    for url in MIRRORS:
        try:
            req = urllib.request.Request(
                url,
                data=urllib.parse.urlencode({"data": query}).encode(),
                headers={"User-Agent": "type-a-disaster/1.0 (github.com/bryanlauwk/sim-city)"},
            )
            return json.load(urllib.request.urlopen(req, timeout=180))
        except Exception as error:  # try the next mirror
            last = error
    raise SystemExit(f"All Overpass mirrors failed: {last}")


def height_m(tags: dict) -> float:
    h = re.match(r"[\d.]+", (tags.get("height") or "").replace(",", "."))
    if h:
        return float(h.group())
    levels = re.match(r"[\d.]+", tags.get("building:levels") or "")
    return float(levels.group()) * 3.5 if levels else -1


def clip(poly, lo, hi, axis, keep_above):
    """One Sutherland-Hodgman pass against an axis-aligned line."""
    out = []
    for i, p in enumerate(poly):
        q = poly[i - 1]
        pin = p[axis] >= lo if keep_above else p[axis] <= hi
        qin = q[axis] >= lo if keep_above else q[axis] <= hi
        if pin != qin:
            edge = lo if keep_above else hi
            t = (edge - q[axis]) / (p[axis] - q[axis])
            out.append((q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t))
        if pin:
            out.append(p)
    return out


def area(poly) -> float:
    return abs(sum(poly[i - 1][0] * p[1] - p[0] * poly[i - 1][1] for i, p in enumerate(poly))) / 2


def main() -> None:
    w, e = LON0 - STEP / 2, LON0 + (N - 0.5) * STEP
    n, s = LAT0 + STEP / 2, LAT0 - (N - 0.5) * STEP
    data = overpass(
        f'[out:json][timeout:120];(way["building"]({s},{w},{n},{e});'
        f'relation["building"]["type"="multipolygon"]({s},{w},{n},{e}););out tags geom;'
    )
    buildings = []
    skipped = 0
    for bid, el in enumerate(data["elements"]):
        tags = el.get("tags", {})
        if LANDMARKS.search(tags.get("name", "") + " " + tags.get("name:en", "")):
            skipped += 1
            continue
        rings = (
            [el["geometry"]]
            if el["type"] == "way"
            else [m["geometry"] for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        )
        h = height_m(tags)
        for ring in rings:
            pts = [((p["lon"] - LON0) / STEP, (LAT0 - p["lat"]) / STEP) for p in ring]
            if len(pts) > 1 and pts[0] == pts[-1]:
                pts = pts[:-1]
            if len(pts) < 3:
                continue
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            for ty in range(max(0, round(min(ys))), min(N - 1, round(max(ys))) + 1):
                for tx in range(max(0, round(min(xs))), min(N - 1, round(max(xs))) + 1):
                    local = [(x - tx, y - ty) for x, y in pts]
                    for axis in (0, 1):
                        local = clip(local, -MARGIN, MARGIN, axis, True)
                        if local:
                            local = clip(local, -MARGIN, MARGIN, axis, False)
                    if len(local) < 3 or area(local) < MIN_AREA:
                        continue
                    flat = [round(v, 3) for p in local for v in p]
                    buildings.append([ty * N + tx, round(h, 1), flat, bid])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "v": 1,
                "license": "© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)",
                "buildings": buildings,
            },
            separators=(",", ":"),
        )
    )
    print(
        f"{len(data['elements'])} OSM buildings, {skipped} landmark duplicates skipped, "
        f"{len(buildings)} tile pieces, {OUT.stat().st_size / 1e3:.0f} KB -> {OUT}"
    )


if __name__ == "__main__":
    main()

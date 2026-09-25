"""Build the static search index of free 3D models used for custom actors.

Objaverse (allenai/objaverse on Hugging Face, ODC-BY) mirrors about 800,000
downloadable Sketchfab models. Objaverse++ (cindyxl/ObjaversePlusPlus, ODC-BY)
labels each one's style and quality. This script keeps the models that are:

  - licensed CC BY or CC0 (usable on a public site with credit),
  - a single object rather than a scene, rated 2+ of 3 for quality,
  - under 300k faces,

then writes the best of them to public/objaverse/index-v1.json.gz: the global
top 8,000, plus the top 2 for every word that at least two different authors
use in model names. That keeps rare subjects searchable ("durian", "hornbill")
in a file of about 2.3 MB that the browser loads once, on the first custom
actor of a visit.

Format: {"v": 1, "authors": [...], "models": "<line>\\n<line>..."} where each
line is uid, chunk, name, author index (negative = CC0: -1 - index) and a few
tag words, separated by tabs, best models first.

Usage (downloads ~820 MB into --work, needs no account or key):
    python3 scripts/build_objaverse_index.py --work /tmp/objaverse
"""

import argparse
import collections
import gzip
import json
import math
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HUB = "https://huggingface.co/datasets"
OUT = Path(__file__).resolve().parents[1] / "public" / "objaverse" / "index-v1.json.gz"
TOP = 8000
PER_WORD = 2
MIN_AUTHORS = 2
TAG_WORDS = 2
MAX_FACES = 300_000

STOP = set(
    """the and with for from this that low poly lowpoly high highpoly free game ready
    gameready asset assets blender maya max 3ds 3dsmax obj fbx cinema4d c4d substance
    painter unity unreal ue4 ue5 zbrush pbr texture textures textured photogrammetry
    scan scanned 3dscan realistic sketchfab download downloadable new old art design
    model object prop props version test final wip untitled part""".split()
)


def words(text: str) -> list[str]:
    """Same normalisation as src/lib/city/modelSearch.ts."""
    out = []
    for w in re.findall(r"[a-z]+", text.lower()):
        if 3 <= len(w) <= 18 and w not in STOP:
            out.append(w[:-1] if len(w) > 4 and w.endswith("s") and not w.endswith("ss") else w)
    return out


def fetch(url: str, dest: Path) -> Path:
    if not dest.exists() or dest.stat().st_size == 0:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=600) as r, open(dest, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
    return dest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="/tmp/objaverse", help="download cache directory")
    args = ap.parse_args()
    work = Path(args.work)

    print("Downloading Objaverse metadata and Objaverse++ labels…")
    names = [f"000-{c:03d}" for c in range(160)]
    with ThreadPoolExecutor(12) as pool:
        list(
            pool.map(
                lambda n: fetch(
                    f"{HUB}/allenai/objaverse/resolve/main/metadata/{n}.json.gz",
                    work / "metadata" / f"{n}.json.gz",
                ),
                names,
            )
        )
    paths_file = fetch(
        f"{HUB}/allenai/objaverse/resolve/main/object-paths.json.gz", work / "object-paths.json.gz"
    )
    labels_file = fetch(
        f"{HUB}/cindyxl/ObjaversePlusPlus/resolve/main/annotated_800k.json",
        work / "annotated_800k.json",
    )

    paths = json.load(gzip.open(paths_file))
    labels = {r["UID"]: r for r in json.load(open(labels_file))}

    keep = []
    for n in names:
        for uid, m in json.load(gzip.open(work / "metadata" / f"{n}.json.gz")).items():
            label = labels.get(uid)
            if (
                m.get("license") not in ("by", "cc0")
                or m.get("isAgeRestricted")
                or not label
                or label["is_scene"] == "true"
                or label["is_multi_object"] == "true"
                or label["score"] < 2
                or (m.get("faceCount") or 0) > MAX_FACES
                or uid not in paths
            ):
                continue
            name = " ".join((m.get("name") or "").split())
            user = m.get("user") or {}
            quality = (
                math.log1p(m.get("likeCount") or 0)
                + label["score"] * 1.2
                + (1.5 if label["style"] in ("realistic", "scanned") else 0)
                + math.log1p(m.get("viewCount") or 0) * 0.15
            )
            name_words = set(words(name))
            tag_words = [
                w
                for w in dict.fromkeys(words(" ".join(t["name"] for t in (m.get("tags") or [])[:10])))
                if w not in name_words
            ]
            keep.append(
                {
                    "uid": uid,
                    "chunk": int(paths[uid].split("/")[1].split("-")[1]),
                    "name": name,
                    "author": " ".join((user.get("displayName") or user.get("username") or "").split()),
                    "cc0": m.get("license") == "cc0",
                    "q": quality,
                    "nw": name_words,
                    "tw": tag_words,
                }
            )
    print(f"{len(keep)} usable models")

    by_word = collections.defaultdict(list)
    for i, k in enumerate(keep):
        for w in k["nw"]:
            by_word[w].append(i)
    order = sorted(range(len(keep)), key=lambda i: -keep[i]["q"])
    chosen = set(order[:TOP])
    for w, ids in by_word.items():
        if len({keep[i]["author"] for i in ids}) >= MIN_AUTHORS:
            chosen.update(sorted(ids, key=lambda i: -keep[i]["q"])[:PER_WORD])

    authors: list[str] = []
    author_id: dict[str, int] = {}
    lines = []
    for i in sorted(chosen, key=lambda i: -keep[i]["q"]):
        k = keep[i]
        a = k["author"][:24].strip()
        if a not in author_id:
            author_id[a] = len(authors)
            authors.append(a)
        ai = -1 - author_id[a] if k["cc0"] else author_id[a]
        lines.append(f'{k["uid"]}\t{k["chunk"]}\t{k["name"][:40].strip()}\t{ai}\t{" ".join(k["tw"][:TAG_WORDS])}')

    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(
        {"v": 1, "authors": authors, "models": "\n".join(lines)}, separators=(",", ":"), ensure_ascii=False
    ).encode()
    OUT.write_bytes(gzip.compress(data, 9, mtime=0))
    print(f"Wrote {len(lines)} models to {OUT} ({OUT.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()

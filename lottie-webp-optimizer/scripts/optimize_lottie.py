#!/usr/bin/env python3
"""
optimize_lottie.py — Lottie (JSON + PNG) -> WebP build-time optimizer for Android.

What it does, per the engineering brief:
  1. For every PNG referenced by the Lottie JSON, build two WebP candidates:
       - lossy   q75  (visually transparent-safe, RGBA preserved)
       - lossless q100
     Keep whichever WebP is SMALLER. If even the smaller WebP is NOT below the
     original PNG size, keep the PNG untouched (no format change).
  2. Rewrite the JSON only for images that were actually converted
     (the `.p` filename extension, or the embedded data-URI mime).
  3. Emit the recommended Android directory layout:
         <out>/<name>/
           data.json
           images/
             *.webp | *.png

Handles both external image assets (`"e": 0`, "img_0.png") and embedded
base64 assets (`"e": 1`, "data:image/png;base64,...").

Only PNG sources are converted. Any other format (jpg, already-webp, gif...)
is copied through unchanged so the animation never breaks.

Dependency: Pillow with WebP support (PIL.features.check("webp") == True).
"""

import argparse
import base64
import json
import os
import re
import shutil
import sys
from io import BytesIO

try:
    from PIL import Image, features
except ImportError:
    sys.exit("ERROR: Pillow is required. Install with: pip install --break-system-packages Pillow")

if not features.check("webp"):
    sys.exit("ERROR: This Pillow build has no WebP support.")

DATA_URI_RE = re.compile(r"^data:image/(?P<mime>[a-zA-Z0-9.+-]+);base64,(?P<payload>.*)$", re.DOTALL)


# --------------------------------------------------------------------------- #
# Conversion primitives
# --------------------------------------------------------------------------- #
def _prep_mode(img):
    """WebP needs RGB or RGBA. Preserve alpha when present."""
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        return img.convert("RGBA")
    if img.mode == "RGB":
        return img
    if img.mode in ("L", "P", "1", "I", "F"):
        return img.convert("RGB")
    return img.convert("RGBA")


def best_webp(png_bytes, quality, method):
    """
    Return (webp_bytes, kind) for the smaller of lossy-q{quality} and lossless.
    kind is "lossy" or "lossless".
    """
    img = _prep_mode(Image.open(BytesIO(png_bytes)))

    lossy_buf = BytesIO()
    img.save(lossy_buf, "WEBP", quality=quality, method=method)
    lossy = lossy_buf.getvalue()

    lossless_buf = BytesIO()
    img.save(lossless_buf, "WEBP", lossless=True, quality=100, method=method)
    lossless = lossless_buf.getvalue()

    if len(lossy) <= len(lossless):
        return lossy, "lossy"
    return lossless, "lossless"


def _fmt(n):
    if n < 1024:
        return f"{n}B"
    if n < 1024 * 1024:
        return f"{n/1024:.1f}KB"
    return f"{n/1024/1024:.2f}MB"


# --------------------------------------------------------------------------- #
# Lottie helpers
# --------------------------------------------------------------------------- #
def find_lottie_json(input_path):
    """Resolve the Lottie data JSON from a file or directory input."""
    if os.path.isfile(input_path):
        return input_path
    if os.path.isdir(input_path):
        candidates = []
        for root, _, files in os.walk(input_path):
            for f in files:
                if f.lower().endswith(".json"):
                    candidates.append(os.path.join(root, f))
        # Prefer JSON files that actually look like a Lottie document.
        lottie_like = []
        for c in candidates:
            try:
                with open(c, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if isinstance(data, dict) and ("layers" in data or "assets" in data):
                    lottie_like.append(c)
            except Exception:
                continue
        pool = lottie_like or candidates
        if not pool:
            sys.exit(f"ERROR: no .json found under {input_path}")
        if len(pool) > 1:
            # data.json wins, else shortest path (closest to root)
            pool.sort(key=lambda p: (os.path.basename(p).lower() != "data.json", len(p)))
        return pool[0]
    sys.exit(f"ERROR: input not found: {input_path}")


def image_assets(data):
    """Yield asset dicts that represent images (have a `p` and no `layers`)."""
    for asset in data.get("assets", []):
        if isinstance(asset, dict) and "p" in asset and "layers" not in asset:
            yield asset


# --------------------------------------------------------------------------- #
# Main pipeline
# --------------------------------------------------------------------------- #
def run(args):
    json_path = find_lottie_json(args.input)
    json_dir = os.path.dirname(os.path.abspath(json_path))
    with open(json_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    name = args.name or os.path.basename(os.path.normpath(
        args.input if os.path.isdir(args.input) else json_dir))
    if not name or name in (".", ".."):
        name = "anim"

    out_root = os.path.abspath(args.output)
    anim_dir = os.path.join(out_root, name)
    images_dir = os.path.join(anim_dir, "images")

    rows = []
    total_before = 0
    total_after = 0

    for asset in image_assets(data):
        p = asset["p"]
        u = asset.get("u", "")
        embedded = str(asset.get("e", 0)) == "1" or p.startswith("data:")

        # ---- load source bytes + identify whether it's a PNG ----
        if embedded:
            m = DATA_URI_RE.match(p)
            if not m:
                rows.append((asset.get("id", p[:16]), "skip(bad-datauri)", 0, 0))
                continue
            mime = m.group("mime").lower()
            src_bytes = base64.b64decode(m.group("payload"))
            is_png = mime == "png"
            src_name = asset.get("id", "embedded")
        else:
            src_file = os.path.join(json_dir, u, p)
            if not os.path.isfile(src_file):
                rows.append((p, "skip(missing-file)", 0, 0))
                continue
            with open(src_file, "rb") as fh:
                src_bytes = fh.read()
            is_png = p.lower().endswith(".png")
            src_name = p

        orig_size = len(src_bytes)
        total_before += orig_size

        # ---- non-PNG: copy through unchanged ----
        if not is_png:
            if not embedded and not args.dry_run:
                os.makedirs(images_dir, exist_ok=True)
                shutil.copy2(src_file, os.path.join(images_dir, p))
            total_after += orig_size
            rows.append((src_name, "copy(not-png)", orig_size, orig_size))
            continue

        # ---- PNG: try both WebP candidates, pick smaller ----
        try:
            webp_bytes, kind = best_webp(src_bytes, args.quality, args.method)
        except Exception as exc:
            # On any decode/encode failure, keep the original PNG.
            if not embedded and not args.dry_run:
                os.makedirs(images_dir, exist_ok=True)
                shutil.copy2(src_file, os.path.join(images_dir, p))
            total_after += orig_size
            rows.append((src_name, f"keep-png(err:{type(exc).__name__})", orig_size, orig_size))
            continue

        # ---- decision: convert only if strictly smaller than original ----
        if len(webp_bytes) < orig_size:
            total_after += len(webp_bytes)
            if embedded:
                asset["p"] = "data:image/webp;base64," + base64.b64encode(webp_bytes).decode("ascii")
                if "t" in asset:
                    asset["t"] = "seq"  # leave intact; just ensure not broken
            else:
                new_name = re.sub(r"\.png$", ".webp", p, flags=re.IGNORECASE)
                asset["p"] = new_name
                asset["u"] = "images/"
                if not args.dry_run:
                    os.makedirs(images_dir, exist_ok=True)
                    with open(os.path.join(images_dir, new_name), "wb") as fh:
                        fh.write(webp_bytes)
            rows.append((src_name, f"webp-{kind}", orig_size, len(webp_bytes)))
        else:
            # Both candidates >= original -> keep PNG, no JSON change.
            total_after += orig_size
            if not embedded:
                asset["u"] = "images/"
                if not args.dry_run:
                    os.makedirs(images_dir, exist_ok=True)
                    shutil.copy2(src_file, os.path.join(images_dir, p))
            rows.append((src_name, "keep-png(no-gain)", orig_size, orig_size))

    # ---- write JSON in recommended layout ----
    if not args.dry_run:
        os.makedirs(anim_dir, exist_ok=True)
        with open(os.path.join(anim_dir, args.json_name), "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))

    # ---- report ----
    print(f"\nLottie: {json_path}")
    print(f"Output: {anim_dir}{'  (dry-run, nothing written)' if args.dry_run else ''}")
    print(f"Layout: {name}/{args.json_name} + {name}/images/\n")
    if rows:
        wname = min(48, max(12, max(len(str(r[0])) for r in rows)))
        print(f"  {'asset':<{wname}} {'action':<22} {'before':>9} {'after':>9}  saved")
        print("  " + "-" * (wname + 22 + 9 + 9 + 8))
        for nm, action, b, a in rows:
            saved = f"-{(1-a/b)*100:.0f}%" if b and a < b else ("0%" if b else "")
            print(f"  {str(nm)[:wname]:<{wname}} {action:<22} {_fmt(b):>9} {_fmt(a):>9}  {saved}")
    pct = f" (-{(1-total_after/total_before)*100:.1f}%)" if total_before else ""
    print(f"\n  TOTAL: {_fmt(total_before)} -> {_fmt(total_after)}{pct}\n")

    if not args.dry_run:
        print("Drop the folder into app/src/main/assets/lottie/ and load with:")
        print(f'    lottieView.setAnimation("lottie/{name}/{args.json_name}")')


def main():
    ap = argparse.ArgumentParser(description="Optimize a Lottie animation's PNGs to WebP for Android.")
    ap.add_argument("input", help="Path to the Lottie JSON file, or a folder containing it + images/")
    ap.add_argument("-o", "--output", default="./lottie_out", help="Output base directory (default ./lottie_out)")
    ap.add_argument("-n", "--name", default=None, help="Animation folder name (default: derived from input)")
    ap.add_argument("-q", "--quality", type=int, default=75, help="Lossy WebP quality (default 75)")
    ap.add_argument("--json-name", default="data.json", help="Output JSON filename (default data.json)")
    ap.add_argument("--method", type=int, default=6, choices=range(0, 7),
                    help="WebP encoder effort 0-6, higher=smaller/slower (default 6)")
    ap.add_argument("--dry-run", action="store_true", help="Report only; write nothing")
    args = ap.parse_args()
    run(args)


if __name__ == "__main__":
    main()
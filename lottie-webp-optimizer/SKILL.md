---
name: lottie-webp-optimizer
description: Optimize Android Lottie animations by converting their PNG image assets to WebP at build time and rewriting the Lottie JSON to match, then emitting the recommended assets/lottie folder layout (data.json plus an images/ folder). Use this whenever someone has a Lottie animation made of a JSON file plus PNG images (a "Lottie folder", "Lottie with images", "Lottie zip from the designer", "data.json + images/") and wants to shrink app size, convert PNG to WebP, compress Lottie assets, or prepare a Lottie animation for an Android app. Trigger even if they only say "compress these Lottie images", "make this Lottie smaller", or "convert the Lottie PNGs to WebP" — the JSON must be rewritten to keep references valid, which this skill handles.
---

# Lottie WebP Optimizer (Android)

Shrinks a Lottie animation by converting its PNG assets to WebP and keeping the
JSON in sync. This is a **build-time / asset-prep** task — the Android runtime
should never rewrite JSON or unpack zips. The app just loads finished assets.

## Scope: engineering side only

The recommended Android handling is exactly three things, nothing more:

1. Load from `assets` as-is — `lottieView.setAnimation("lottie/<name>/data.json")`
2. Enable composition cache — `lottieView.setCacheComposition(true)`
3. Ship WebP-compatible assets (Android 8+ supports WebP incl. transparency)

Do **not** suggest zip packaging, runtime JSON rewriting, or custom multi-layer
image-remapping — Lottie's built-in `u`+`p` asset mapping already covers local
assets, and the extra machinery adds IO, first-frame latency, and bugs for no
benefit. This skill produces the assets; the runtime stays dumb.

## What the script does

`scripts/optimize_lottie.py` walks every image asset referenced by the Lottie
JSON and applies these rules:

1. **For each PNG, build two WebP candidates and keep the smaller:**
   - lossy at **q75** (RGBA/transparency preserved)
   - **lossless** (q100)
   - **If even the smaller WebP is not below the original PNG size, keep the
     PNG untouched** — no format change, no JSON edit. (Tiny/pre-optimized PNGs
     occasionally beat WebP; never make a file bigger.)
2. **Rewrite the JSON only for assets that were actually converted** — the `.p`
   filename `.png` → `.webp` for external assets, or the embedded data-URI mime
   `image/png` → `image/webp` for base64-embedded assets (`"e": 1`).
3. **Emit the recommended layout** so it drops straight into Android assets:
   ```
   <output>/<name>/
     data.json
     images/
       *.webp        # converted
       *.png         # kept when WebP gave no gain / non-PNG sources
   ```

Non-PNG sources (jpg, already-webp, gif) and any image that fails to decode are
copied through unchanged so the animation never breaks.

## Usage

Dependency: Pillow with WebP support (already present in this environment;
otherwise `pip install --break-system-packages Pillow`).

```bash
# Input can be the Lottie .json OR a folder containing it + images/
python3 scripts/optimize_lottie.py path/to/anim_folder -o ./lottie_out -n anim_x
```

Useful flags:
- `-n, --name` — output folder name (default: derived from the input folder)
- `-o, --output` — output base dir (default `./lottie_out`)
- `-q, --quality` — lossy quality (default `75`)
- `--json-name` — output JSON filename (default `data.json`)
- `--dry-run` — print the size report without writing anything

The script prints a per-asset table (action + before/after + % saved) and a
total. Run `--dry-run` first if the user wants to preview the savings before
committing.

## After running

Tell the user to copy the produced `<name>/` folder into
`app/src/main/assets/lottie/` and load it the standard way:

```kotlin
lottieView.setCacheComposition(true)
lottieView.setAnimation("lottie/<name>/data.json")
```

For lists or repeated playback, parse the composition once and reuse it instead
of re-parsing per view:

```kotlin
val result = LottieCompositionFactory.fromAssetSync(context, "lottie/<name>/data.json")
lottieView.setComposition(result.value)
```

## Notes & edge cases

- The JSON is re-serialized minified (no whitespace) — also trims a bit of size.
- A folder with multiple JSONs picks the Lottie-looking one (`data.json`, or one
  containing `assets`/`layers`); pass the exact `.json` path if you need control.
- If the designer delivered a **zip**, unzip it first, then point the script at
  the extracted folder — keep zip handling out of the app.
- WebP near-always beats PNG for real animation frames, so most assets convert;
  the keep-PNG path exists only to guarantee no file ever grows.

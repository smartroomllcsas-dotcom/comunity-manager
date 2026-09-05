---
name: image-enhancer
description: Upscale and sharpen images — pick between Real-ESRGAN, GFPGAN (faces), SUPIR, Topaz, or fal endpoints. Use when a client image is low-res, blurry, or needs 2x/4x for print.
---

# Image Enhancer

Choose the right upscaler for the source and target.

## Decision tree
- **Photo, general**: Real-ESRGAN or SUPIR (fal endpoint `fal-ai/aura-sr` or `fal-ai/creative-upscaler`)
- **Faces, portraits**: GFPGAN or CodeFormer — restore before upscale
- **Anime, illustration**: Real-ESRGAN anime6b or waifu2x
- **Text, screenshots, UI**: waifu2x with `noise=3`, never AI creative upscale (it hallucinates letters)
- **Print production (300 DPI)**: SUPIR or Topaz Gigapixel — creative-upscale acceptable
- **Restoring old damaged photo**: GFPGAN → SUPIR

## Fal endpoints (fastest to use)
- `fal-ai/aura-sr` — 4x, fast, cheap ($0.005)
- `fal-ai/creative-upscaler` — creative fill, adds detail, use for hero images
- `fal-ai/clarity-upscaler` — closest to Magnific, high quality
- `fal-ai/ccsr` — content-aware, good for realism preservation

## API pattern (fal)
```
POST https://fal.run/fal-ai/aura-sr
{ "image_url": "...", "upscaling_factor": 4 }
```

## Local (free, batch work)
- Real-ESRGAN CLI: `realesrgan-ncnn-vulkan -i in.jpg -o out.png -s 4`
- Chainner (GUI): pipeline chaining, batch, works offline

## Never do
- Upscale a JPEG twice without cleaning artifacts first
- Use "creative" upscalers on faces of real people you know (adds fake wrinkles/features)
- 8x in one pass — do 2x → 2x → 2x with denoise between

## Sharpening after upscale
Unsharp mask: `amount 50%, radius 0.5px, threshold 3`. Never over — halos = amateur tell.

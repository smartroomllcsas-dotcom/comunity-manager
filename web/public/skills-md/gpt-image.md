---
name: gpt-image
description: Generate images with OpenAI's gpt-image-1 model — best for text-in-image, product mockups, editorial photography, and consistent character rendering. Use when the goal is realism or embedded text.
---

# gpt-image (OpenAI Images)

Model: `gpt-image-1`. Best in class for:
- Text rendered inside images (posters, packaging, UI mockups)
- Photorealistic product shots
- Editorial-style photography
- Character consistency across a set
- Instruction following (Midjourney can't do "the word 'Bliss' in serif on a matte black bottle")

## Endpoint
```
POST https://api.openai.com/v1/images/generations
{
  "model": "gpt-image-1",
  "prompt": "...",
  "size": "1024x1024" | "1536x1024" | "1024x1536" | "auto",
  "quality": "low" | "medium" | "high",
  "n": 1-10,
  "background": "transparent" | "opaque",
  "output_format": "png" | "jpeg" | "webp"
}
```

## Prompt structure that works
`[subject]` in `[setting]`, `[lighting]`, `[camera/lens]`, `[style]`, `[mood]`, `[color palette]`. Then constraints.

Example: `A hand holding a matte-black glass bottle labeled "BLISS" in thin serif, soft window light from the left, shallow depth of field, film grain, muted terracotta background, editorial minimalism.`

## Text in images
Put the exact text in quotes. Specify font style (serif/sans/script/hand-lettered). Say where it appears. Model handles up to ~30 characters cleanly.

## Editing (inpainting)
```
POST /v1/images/edits
image: base file
mask: PNG with transparent area = edit region
prompt: what to put in the transparent area
```

## Reference images
Pass 1-4 reference images to keep character/product consistent across a set. Use `image[]` field in the edits endpoint.

## Cost anchors
- Low quality: ~$0.011
- Medium: ~$0.042
- High: ~$0.167 per 1024x1024

## When to prefer another model
- Fal Flux Pro: photorealistic humans, faster, cheaper
- Midjourney v7: artistic/painterly aesthetic
- Ideogram: bulk text-heavy designs at scale
- Nano Banana (fal): edits and character consistency at half the price

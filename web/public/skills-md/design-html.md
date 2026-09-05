---
name: design-html
description: Produce clean, semantic HTML for design work — no divs-for-everything, proper landmarks, form structure, accessible tables. Use when handing markup to a designer or when scaffolding pages before styling.
---

# Design HTML

Clean, semantic markup that a designer can style and a screen reader can navigate.

## Landmark structure (every page)
```html
<header>
  <nav aria-label="Primary">...</nav>
</header>
<main>
  <article>
    <header><h1>Title</h1></header>
    <section aria-labelledby="s1"><h2 id="s1">...</h2></section>
  </article>
  <aside aria-label="Related">...</aside>
</main>
<footer><nav aria-label="Footer">...</nav></footer>
```

## Heading order
Exactly one `<h1>`. Never skip levels. `<h2>` follows `<h1>`, never `<h3>`.

## Elements to use (stop using divs for these)
- `<button>` for anything clickable that isn't navigation
- `<a>` only when it changes URL
- `<details>/<summary>` for accordions (free accessibility)
- `<dialog>` for modals (native focus trap + backdrop)
- `<figure>/<figcaption>` for images with captions
- `<time datetime="2026-08-03">` for dates
- `<address>` for contact info
- `<blockquote cite="url">` for quotes
- `<mark>` for highlighted text (not just yellow bg)

## Forms
Every input has a `<label>`. Never placeholder-only. Group related fields with `<fieldset><legend>`. Use `autocomplete` attributes. `required`, `pattern`, `type="email|tel|url|number"` for free validation.

## Tables (real data only, never layout)
```html
<table>
  <caption>...</caption>
  <thead><tr><th scope="col">...</th></tr></thead>
  <tbody><tr><th scope="row">...</th><td>...</td></tr></tbody>
</table>
```

## Images
- `<img alt="">` — empty alt for decorative, descriptive for content
- `srcset` + `sizes` for responsive
- `loading="lazy"` below the fold
- `width` + `height` always (prevents CLS)

## What to avoid
- `<div onclick>` → use `<button>`
- Divs with `role="button"` → use `<button>`
- `<a href="#">` for actions → use `<button>`
- Skipping `<main>` because "the header is at the top"
- `tabindex="1"` (only 0 or -1)

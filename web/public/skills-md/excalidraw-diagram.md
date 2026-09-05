---
name: excalidraw-diagram
description: Create Excalidraw-style hand-drawn diagrams for architecture, flows, and explainers. Output valid .excalidraw JSON or Mermaid where diagram-as-code is preferred.
---

# Excalidraw Diagrams

Hand-drawn feel diagrams for architecture, user flows, and explainers. Warmer than Mermaid, more editable than PNGs.

## When to use Excalidraw over Mermaid
- **Excalidraw**: architecture reviews, whiteboard-style workshops, presentations, screenshots for tweets/blog posts, freeform mind-maps.
- **Mermaid**: docs that live in a repo, PRs, README files, anything that needs to render inline in GitHub/Notion.

## Excalidraw JSON structure
```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [
    {
      "type": "rectangle",
      "x": 0, "y": 0, "width": 200, "height": 80,
      "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff",
      "fillStyle": "hachure", "strokeWidth": 2, "roughness": 1,
      "id": "rect1"
    },
    {
      "type": "text", "x": 50, "y": 30,
      "text": "Frontend", "fontSize": 20, "fontFamily": 1
    },
    {
      "type": "arrow",
      "startBinding": { "elementId": "rect1" },
      "endBinding": { "elementId": "rect2" },
      "points": [[0,0],[200,0]]
    }
  ],
  "appState": { "viewBackgroundColor": "#ffffff" }
}
```

## Standard color palette (Excalidraw defaults)
- Blue: `#a5d8ff` bg / `#1971c2` stroke
- Green: `#b2f2bb` / `#2f9e44`
- Yellow: `#ffec99` / `#f08c00`
- Red: `#ffc9c9` / `#e03131`
- Purple: `#d0bfff` / `#7048e8`
- Gray: `#e9ecef` / `#495057`

## Layout tips
- Grid step 20px
- Component boxes: 200x80 or 160x60
- Arrows: 2px stroke, roughness 1 for hand-drawn feel
- Group with rectangles + `backgroundColor` + `fillStyle: "solid"` at 20% opacity
- Fonts: 1 = Virgil (hand), 2 = Helvetica, 3 = Cascadia (mono)

## Mermaid alternatives (for repos)
```
graph LR
  A[User] -->|POST /api| B(Server)
  B --> C[(Database)]
```

## Export
`.excalidraw` files open in excalidraw.com. Export PNG at 2x for retina, SVG for docs.

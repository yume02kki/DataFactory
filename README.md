# DataFactory

Design and understand data pipelines visually, the way you'd lay out a factory in a
building game. Sources feed machines, machines feed buffers, buffers feed stores,
and the data (your *items*) rides along conveyor belts between them.

![The example Visit Analytics factory](docs/screenshot.png)

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm run build` (typecheck + production build to `dist/`),
`npm test` (unit tests), `npm run typecheck`.

On first launch the app opens the example **Visit Analytics** factory. Use
**Factories ▾ → New empty factory** to start from scratch.

## Building blocks

| Block | Role | Ports |
| --- | --- | --- |
| **Item** | The data flowing through the factory (`Visit`, `Order`, `File`…) | — |
| **Source** | Where data originates | output |
| **Machine** | Transforms, enriches, validates, filters, aggregates… | input + output |
| **Buffer** | Temporarily holds or transports data between machines | input + output |
| **Store** | Where processed data ends up | input |

The app is **technology-agnostic**. Nothing is built in for any specific tool.
Every building has:

- **Name**, e.g. `Visit Enricher`
- **Type**, the role it plays (`Transformer`, `Queue`, `Warehouse`, or anything you type)
- **Technology**, free text such as `Kafka`, `Snowflake` or `Custom Python Service`,
  stored as metadata only
- **Description**, **inputs**, **outputs** (item types), **colour** and arbitrary
  **metadata** key/value pairs

The palette comes with a few generic types per block (API, Transformer, Queue,
Warehouse…). Add your own with the **+** next to each section, for example a Buffer
type called `Events Queue` with default technology `Kafka`. Items get a shape, a
colour, a description and an optional field schema.

## Controls

| Action | How |
| --- | --- |
| Place a building | Drag a tile from the palette, click a tile, press `1`–`4` at the cursor, or double-click the floor |
| Connect | Drag from a building's ▶ output port onto another building. Drop on empty floor to build and connect in one go |
| Choose what a belt carries | Drag an item from the palette onto the belt, or pick it in the belt inspector |
| Move | Drag buildings (they snap to the grid). Use arrow keys to nudge (`Shift`: 4 cells) |
| Multi-select | `Shift`+click, `Shift`+drag a box, `Ctrl A` |
| Duplicate / delete | `Ctrl D` (belts inside the selection are kept) / `Del` |
| Undo / redo | `Ctrl Z` / `Ctrl Shift Z` |
| Pan / zoom | Drag the floor (or `Space`+drag, or the middle mouse button) / scroll, `+` `−`, `F` to fit |
| Highlight a flow | Hover an item in the palette to see every belt and building that handles it |
| Pause the animation | `P` or **Pause flow** |

Press `?` in the app for the full list.

## Saving

Factories autosave to your browser's `localStorage`, including where you were
looking. **Factories ▾** lists every saved factory and lets you open, delete,
export (`.factory.json`) and import them. Imports are validated and repaired, so a
hand-edited file with dangling references still loads.

## Project layout

```
src/
  model/        types, defaults & example, geometry (grid + belt routing), graph ops, storage
  store/        zustand store with undo/redo history
  components/   Canvas (SVG floor), NodeView/BuildingArt, BeltView, Palette, Inspector, TopBar
  lib/          viewport helpers, text measuring, colour utils
```

Built with React, TypeScript, Vite, zustand and immer. The canvas is plain SVG.
Belts are routed orthogonally, and items move along them with SMIL `animateMotion`.

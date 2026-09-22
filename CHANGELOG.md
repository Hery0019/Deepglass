# Changelog

All notable changes to Deepglass. The format follows Keep a Changelog; the
project uses semantic versioning.

## 1.0.0 - 2026-09-05

The first complete release.

### Game

- Eight procedurally generated levels of rooms and corridors, with a one in
  three chance of a cavern between the first and the last, then the Warden of
  the Deepglass on the ninth.
- Ten monsters with distinct behaviours, including archers that hold ground
  every other turn, a kobold that flees and returns, an ambushing spider, and
  the Gatekeeper beside the stairs on depth 5.
- Doors that block sight until opened; hidden spike, poison dart, and
  teleport traps that can be noticed from an adjacent tile.
- Hunger: nutrition drops every turn, healing stops when weak, starvation
  kills; food rations restore it.
- Unidentified potions and scrolls with looks rolled from the seed, revealed
  by use. Two bows with a targeting cursor. Three weapons and three armour
  pieces with accuracy trade-offs.
- Experience levels, natural regeneration, poison and confusion.

### Interface

- Automatic exploration, travel to the stairs or to any seen tile, and rest,
  all interrupted by anything worth a look.
- Examine cursor, scrollable message history with repeated lines counted,
  help screen, title screen, and a death or victory summary with the best
  runs kept in the browser.
- Camera that follows the player when the map outgrows the window; zoom
  keys; touch controls with an on-screen toolbar.
- Every run is reproducible from its seed, and the address bar carries a
  replay link of the whole run. Installable as a web app and playable
  offline.

### Engineering

- Pure, deterministic rules engine with no browser dependencies, enforced by
  lint rules and a Node test suite.
- A scripted balance bot and `npm run balance` report for measuring changes.
- Continuous integration on every push; the main branch deploys to GitHub
  Pages.

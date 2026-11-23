# Blank Box — researched late-1990s cable TV design

## Target

A period-specific late-1990s US cable experience, not a generic retro dashboard. The system has two distinct but related surfaces:

- **Browser / Downloader:** live picture on the left, physical cable terminal and controls on the right, one readable full-width Prevue guide beneath.
- **Installed Android TV APK:** full-screen broadcast, a compact programme lower-third, and a full-screen guide with an inset live picture. The APK bundles the same CSS and fonts locally inside its WebView.

## Period references

- [Prevue (ESQ) history](https://prevueguide.com/wiki/Prevue_%28ESQ%29): the March 1993 “New Look” switched from the earlier listing presentation to the navy-blue grid, showing the current programme and next two half-hour slots (90 minutes). Arrows indicated programmes that began before or continued after the visible window.
- [Prevue Channel history](https://prevueguide.com/index.php/Prevue_Channel): documents the 1993 grid update and optional programme category colors.
- [Scientific-Atlanta Explorer 2000 coverage, March 1997](https://www.worldradiohistory.com/Archive-C-ED/90s/C-ED-1997-03.pdf): contemporary technical press described the blue/dark digital set-top and its green numeric display.
- [Scientific-Atlanta Explorer 2000 product advertisement, May 1998](https://www.worldradiohistory.com/Archive-All-BC-Engineering/Archive-Communications-Technology/90s/Communicaation-Technology-1998-05.pdf): shows the front-panel display, power indicator, tactile menu/channel/volume keys, and multi-button remote.
- [WIRED, “Inside Out,” December 1, 1998](https://www.wired.com/1998/12/inside-out/): contemporary article on the Explorer 2000, which rolled out in October 1998.

The CSS colors are a digital reconstruction of the surviving Prevue and Explorer references; they are not asserted to be measured factory color codes.

## Color and material separation

### Prevue guide

| Role | Value | Purpose |
|---|---|---|
| Grid background | `#000060` | Deep saturated navy |
| Programme cells | `#0000A8` | Standard listing blue |
| Alternate cells | `#000088` | Row separation |
| Current programme | `#2222C8` | Lighter blue now-playing field |
| Raised rules | `#74829A` | Grey-blue embossed grid lines |
| Listing titles | `#EEEEEF` | Soft white |
| Time / channel labels | `#FFFF00` | Period yellow |
| Programme metadata | `#00FF66` | Green display accent |
| Current-time marker | `#FF0033` | Red vertical line |
| Focus | `#FFFF00` | Single unmistakable selection state |

### Late-1990s terminal

| Role | Value | Purpose |
|---|---|---|
| Main shell | `#252D33` | Dark graphite / blue-black |
| Raised face | `#343E46` | Moulded front panel |
| Edge highlight | `#89949C` | Mould seam / bevel |
| Smoked display | `#050B09` | Dark display window |
| Phosphor | `#9BC86F` | Muted green digital channel readout |
| Keycaps | `#BFC4C6` | Tactile grey buttons |
| Function keys | warm gray/amber | Small contrast group, not neon decorations |

## Typography and behaviour

- Oswald for condensed network names, guide titles, callsigns and programme names.
- VT323 for channel digits, programme times and terminal readouts.
- Fonts are bundled from the reference Android TV companion project under `src/assets/fonts`, with both SIL Open Font License texts. No external font CDN is required.
- The guide displays 90 minutes as three 30-minute columns in both browser and native TV layouts. Left/right paging advances another 90 minutes.
- Channel listings automatically crawl upward at a slow broadcast pace, pause for four seconds after each screenful, and repeat seamlessly; keyboard, touch, wheel, and remote input pause the crawl temporarily.
- Listings continuing into or out of the visible period receive directional arrows.
- Focus outlines do not scale or move controls, keeping D-pad geometry stable.
- Existing saved user preferences are preserved; the 4:3 picture ratio is only the default for a fresh installation.

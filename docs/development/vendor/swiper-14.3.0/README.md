# Swiper for the standalone homepage demo

- Version: 14.3.0 (pinned; does not alter frontend dependencies).
- Upstream: https://github.com/nolimits4web/swiper
- Downloaded distribution: https://cdn.jsdelivr.net/npm/swiper@14.3.0/
- License: MIT; full notice in `LICENSE`, also embedded in the portable HTML.

The demo uses Swiper for track transforms, transitions, dragging and free wheel
movement. Its input adapter sends discrete wheel ticks directly to `slideTo`,
and snaps continuous input on idle. This avoids the default mousewheel mode's
animation-time gating and the default sticky free mode's small-input snap-back.
At aligned gallery edges, one wheel event enters the adjacent module. During
the last picture's motion, one pending boundary intent is retained until it
finishes; reverse input cancels it. Outside the first/final module, input returns
to native page scrolling. Native scrollbar/keyboard boundaries have a 96 px
gap rather than an extra viewport height. Chapter selection follows native
scroll position in one animation frame, without an additional smoothing loop.

Each visited module keeps its own Swiper scene. Inactive scenes are hidden,
inert, and have wheel listeners disabled. Returning to a module reuses that
scene instead of destroying its Swiper or cloning a large screenshot track.
The next module's images are prepared in advance. Scene changes use directional
transform/opacity transitions (180 ms exit, 380 ms entrance).

The selected design is an open Coverflow gallery, with 27-degree side rotation,
depth 130 and scale 0.9. There is no surrounding browser-window frame; cards
float above the page, and the adjacent previews fade at the scene edges. Each
card fits the actual screenshot aspect ratio within 82% of the scene width and
its available height. Portrait controls become narrower cards; wide charts do
not get extra white letterboxing. PNG dimensions are declared in the slide data
so fitting does not wait for image decoding. The focused chart stays flat; the
adjacent previews are clickable. Gallery position is derived from Swiper's
variable-width centered slide grid, including the initial centering offset,
rather than dividing translation by the viewport width.

The right column uses a single sticky reading viewport. Empty chapter tracks
supply the native scroll distance; inactive live chapters are hidden and inert.
The reader and timeline occupy the same grid row without negative margins. The
reader's full margin-box height keeps its sticky exit bound aligned with the
left gallery. Showcase overflow is clipped (not made into a scroll container)
and its stacking context is isolated, preventing content from painting into the
following data-foundation section. Mobile restores ordinary document flow.
Previous/next context copies retain the source typography and complete content,
with the same opacity and edge fade. Their space is measured around the centered
body, and they do not inherit the body's reveal animation. On mobile, chapters
return to their original document flow.
Context sits 88–140 px away from the active body (11% of viewport height within
those bounds), so the previous/next fragments stay near the viewport edges.
When a short window has no spare room, context is omitted instead of compressed.

Chapter changes animate the old body out and the new body in with directional
vertical movement and opacity (180 ms exit, 420 ms entrance); context previews
move and fade with them. Rapid changes sample the current rendered state and
cancel the previous animations. A completion token prevents old callbacks from
clearing a newer transition. Resize and reduced motion cancel the effect, and
pinned body text does not also use the offscreen track's reveal opacity.

Rebuild the offline single file with Node:

```powershell
node docs/development/build-homepage-demo.cjs
```

Run logic regressions using the existing frontend jsdom dependency:

```powershell
node docs/development/verify-homepage-scroll.cjs
node docs/development/verify-homepage-scroll.cjs --portable
```

These checks use the actual Swiper distribution with supplied layout geometry.
They do not verify CSS animation smoothness or physical mouse/trackpad behavior.

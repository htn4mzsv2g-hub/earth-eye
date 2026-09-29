# Real-iPhone check (Stage 1), about 10 minutes

Automated checks ran in emulation only (Playwright WebKit and Chrome with
iPhone settings). Nothing has been tested on a physical iPhone yet. Please run
this in Safari on your iPhone at https://eartheye.us after signing in.

1. **Layers scrolls to the end, and remembers.** Tap LAYERS. Drag the list up
   with one finger until it stops. The last layer row sits fully above the
   bottom tab bar. Scroll halfway back, tap EXPLORE, then tap LAYERS again: you
   land where you left off.
2. **Content drags scroll; only the handle closes; the globe comes back.** In
   LAYERS, scroll to the top and drag the list down. The sheet stays open. Drag
   the small bar at the very top of the sheet down: the sheet closes. Now drag
   the globe with one finger: it pans. Repeat after closing CAMERAS and ANALYST.
3. **Cameras list and filters.** Tap CAMERAS. Tap "Still image", then "Video
   clip". Each shows only that badge. Tap "Live video": it shows 0, and the
   panel says no provider currently offers live video. That is expected: DelDOT
   and Maryland are held until embed permission is confirmed. Type a city into the search box: the keyboard opens and the
   search box stays visible.
4. **Still camera.** Open a still-image camera. The picture shows, the status
   line reads "Refreshed hh:mm:ss" plus the provider time (or "provider time
   unknown"). If the same picture comes back on the next check, the line says
   STALE and keeps the old time. There is no play button.
5. **Video clip (London / TfL).** Open a VIDEO CLIP camera. Tap Play. It plays
   inside the page (not fullscreen). Tap ✕: the sound/picture stops.
6. **Fullscreen and map selection.** Open any camera and tap Fullscreen, then
   leave fullscreen (the picture should use Safari's own fullscreen view). Tap
   ✕. Turn on "Show cameras on globe", tap a camera dot on the globe: the
   viewer opens and its name matches the dot you tapped. (Live video playback
   and the "iPhone blocked autoplay. Tap Play" button could only be tested with
   a synthetic test stream in emulation, because no live source is enabled.)
7. **Errors are honest.** Turn on Airplane Mode with a camera open and tap
   Retry. You see OFFLINE (no fake picture). Turn Airplane Mode off, tap
   Retry, and the camera comes back. Close it and check the globe still pans.
8. **Analyst.** Tap ANALYST. The note says "AI summaries are off." Tap the
    "cameras near London" example: you get a place result and a camera list,
    each with a Sources line. Tap "Open camera" on one: the same camera opens.
    Type "write me a poem": it says it did not understand (no made-up answer).
9. **Rotation and big text.** Rotate to landscape with CAMERAS open, then back.
    The sheet stays usable. In Settings > Display & Brightness > Text Size (or
    Safari's aA > larger text), make text large and repeat step 1.
10. **Data Sources.** MORE > SOURCES. Every layer shows a status badge,
    delivery, freshness, retrieved and observed time (or "unknown"), and a
    permission line. Maryland CHART and Radio are not offered.

If a step fails, note the step number, the screen, and what you saw. A
screenshot helps.

## After Stage 5 wave-3 perf deploy (2026-09-29)
Re-check globe pan/tilt smoothness vs before. Expect quieter GPU (30 FPS target,
no 4× MSAA on phone). Still compare to God’s Eye View; report if lag remains.


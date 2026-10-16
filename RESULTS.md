# Benchmark Results

Fill this in after an auto-benchmark run. Open the dev menu with `~`, then
click **Run benchmark**. Record the numbers below. Use **Download JSON** to keep
the raw output.

## Test machine

- Device / CPU / GPU:
- RAM:
- OS:
- Browser and version:
- Display refresh rate:
- Date:

## Config at test time

- Dataset write mode: (everyFrame / onChange / lazy)
- Render target: (dom / svg / canvas)
- Pooling: (on / off)
- Virtualization: (on / off)
- Grid cell size:
- Notes on any other changed config:

## Auto-benchmark

The benchmark ramps the bullet count per collision mode. It reports the count
where p95 frame time first passes 16.7 ms (60 FPS budget).

| Collision mode | Bullet count at p95 > 16.7 ms |
|---|---|
| gbcr | |
| gbcr-naive | |
| math | |

## Render target comparison

Spawn a bullet storm and switch `render.bulletTarget`. Record steady-state FPS.

| Render target | Bullets alive | FPS | Notes |
|---|---|---|---|
| dom | | | |
| svg | | | |
| canvas | | | |

## Dataset write mode comparison

Hold a fixed enemy and bullet count. Switch `render.datasetWriteMode`.

| Mode | FPS | Frame time p95 (ms) | Notes |
|---|---|---|---|
| everyFrame | | | |
| onChange | | | |
| lazy | | | |

## Attribute-selector test

Toggle `render.attributeSelectorTest`. Record the change in frame time.

| Setting | Frame time p95 (ms) | Notes |
|---|---|---|
| class toggles (off) | | |
| [data-state] selectors (on) | | |

## First bottleneck observed

Open the DevTools Performance panel. Record the system that dominates the frame
as the count grows. Use the per-system timings in the perf overlay.

- First mode to drop below 60 FPS:
- Dominant system at that point (grid / gBCR / resolve / contact / render / AI):
- Entity count at the drop:
- Notes:

## Takeaways

- Where does the "intuitive" architecture break first?
- Does the grid broad-phase help as expected (gbcr vs gbcr-naive)?
- How far is gBCR from the math control?
- Which single toggle gives the largest win?

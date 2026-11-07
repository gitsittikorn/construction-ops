# Phase 7 — survey import and 2D interpretation

2026-11-08 (Asia/Bangkok). Existing BM/TP/grid/slope/cut-fill/history/export implementation retained; this continuation fills import and coordinate-visualization gaps. Final gate results are recorded below after execution.

## Implemented continuation

- Import UTF-8 CSV or the named “กริด” sheet of exported XLSX, max 5 MB and 2,500 points. Validate headers, metres, numeric levels, unique IDs, exact configured grid coordinates/completeness and current survey assumptions before presenting a preview. Unsupported, empty, malformed, duplicate, missing or mismatched data cannot change the current draft
- Preview shows file name, point count and elevation range. Explicit confirmation replaces draft points only. Account/project/history/grid changes invalidate the preview; history persists only through the existing audited save operation. Cancel and failures preserve the old measurements
- CSV export includes BOM and preserves the existing spreadsheet-injection protections; import accepts the exporter’s apostrophe-prefixed negative numeric literals, never formulas. XLSX roundtrip preserves actual point levels and units
- Fix SVG Y axis to increase upward from the lower-left origin, keeping X positive rightward. Show cut/fill point categories and exact point title values; hide overlapping labels on large grids while retaining the editable data table
- Add estimated contours using the same SW–NE piecewise-linear triangles as volume calculation, seven interior ground-elevation levels. Flat surfaces generate no fabricated contours. Limit contour rendering to grids of at most 400 points; larger valid grids still calculate up to 2,500 points and show the point plot/table. These lines are explicitly estimates, not new surveyed measurements

## Evidence and limits

Targeted unit tests: survey formulas + CSV/XLSX import + contour interpolation, 12 passed. Existing formulas test uniform/sloped/mixed cut-fill, boundary cells, BM/TP sequences and allowance/swell states. New contour tests check linear slope coordinates, constant planes and render bounds. New browser flow checks preview, stale rejection, invalid header preservation, stored-history reload, XLSX roundtrip and Y orientation/contour rendering

Optional 3D is deferred: the bounded 2D plot and editable table support the current workflow without implying a higher-accuracy terrain model. No physical survey or geotechnical measurements are certified; verify BM, datum, units and field inputs before engineering use. No production writes or data migrations

## Validated gate

Cloud npm run check exit 0: frontend 269, backend 10, rules 7, emulator integration 8 and E2E 45 passed; format/lint/typecheck/build/HTTP smoke PASS. Initial targeted E2E exposed an ambiguous design-select label; an explicit accessible label corrected it and both targeted browser and full gate were rerun successfully. No assertion or test was disabled. Source/tablet-browser implementation gate PASS; physical survey/device acceptance remains NOT VERIFIED.

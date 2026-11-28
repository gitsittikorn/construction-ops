# Operation-first refactor — progress (started 2026-11-28)

Three user requests, done in this order: (1) truck sheet import, (2) bulk selection/delete,
(3) operation-first UI. Branch `feat/operation-first-ui`. Commit and push authorised by the user
on 2026-11-28; **deploy not authorised**. No real data writes.

## Baseline

- `5407060` + earlier uncommitted work, committed as checkpoint `c49d0d9`.
- `vitest run` from `C:\` (upper case): 73 files, 442/442 PASS. From a lower-case drive path
  86 tests fail (environment, not code).

## Audit findings

- Import: preview showed 6 of 14 columns; existing trucks were skipped with every column except
  the driver link; update mode replaced stored values with blanks; drivers never received teams;
  blank province created a second truck; parser capped 1,000 rows and ignored unknown headers.
- Live sheet (read only): 64 data rows, 14 team names, all cells text. Matches the request.
- New trips' source of truth: daily session `rows[].transactions`. Legacy `data.trips` stays
  readable/editable; both are separate records and reports already sum them once each.
- Already satisfied by earlier work: tags only on trucks/drivers, add buttons on top, Sheets
  link panel, fleet reset tool, single delete with reference checks.

## Status

- [ ] 1. Import
- [ ] 2. Bulk selection and delete
- [ ] 3. Navigation and quick recording
- [ ] Full gate, push

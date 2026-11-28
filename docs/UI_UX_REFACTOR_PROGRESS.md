# Operation-first refactor — progress (2026-11-28)

Three user requests, done in this order: (1) truck sheet import, (2) bulk selection/delete,
(3) operation-first UI. Branch `feat/operation-first-ui`. Commit and push authorised by the user
on 2026-11-28; **deploy not authorised**. No real data was written by the agent.

## Baseline

- `5407060` plus earlier uncommitted work, committed as checkpoint `c49d0d9`.
- `vitest run` from `C:\` (upper case): 73 files, 442/442. From a lower-case drive path 86 tests
  fail (environment, not code).

## Audit findings

- Import: preview showed 6 of 14 columns; existing trucks were skipped with every column except
  the driver link; update mode replaced stored values with blanks; drivers never received teams;
  a blank province created a second truck; the parser capped 1,000 rows and ignored unknown headers.
- Live sheet (read only): 64 data rows, 14 team names, all cells text.
- Delete: one record at a time only.
- Already satisfied by earlier work: tags only on trucks/drivers, add buttons on top, Sheets link
  panel, fleet reset tool, single delete with reference checks.

## Data architecture

- Source of truth for new trips: daily session `rows[].transactions` (existing model).
- Legacy `data.trips` stays readable and editable on the "บันทึกเที่ยวรถ" page. The two are separate
  records; reports sum each once. Nothing was migrated and no schema or Rules change was made.
- Duplicate prevention: the trip ID is chosen before the write, so a retry is a no-op; writes are
  queued; a second tap on one truck within 700 ms is refused with a message.
- Quick taps write a compact local audit entry (`daily-quick-trip`). Full per-trip history stays in
  the session `history`.

## Behaviour changes users will notice

- Opening the app shows trip recording, not the overview.
- Import update keeps stored values for blank cells; clearing needs a separate tick.
- A name-only driver match now goes to review instead of being linked.
- Lists show 50 rows per page.

## Status

- [x] 1. Import — commit `0d2fd0d`
- [x] 2. Bulk selection and delete — commit `f772d0e`
- [x] 3. Navigation and quick recording — commit `953de9a` and the final commit
- [x] Final gate

## Final gate

Windows, 2026-11-28, from C:, CI=true: format:check, lint (0 errors, 65 warnings), tooling 4/4, typecheck, frontend 471/471, backend 20/20, Rules 16/16, emulator integration 13/13, build and smoke each exit 0; browser suite 82/82 exit 0, run separately on port 5184 because another project holds 5174 (files restored afterwards). A single uninterrupted `npm run check` is therefore not claimed.

## Known limitations

- About 680 trips per project per day: the existing 750 KB limit on one daily record (measured,
  about 1.1 KB per trip). The write is refused with a message and earlier data stays.
- Several devices recording the same project and day change the same record and can raise a sync
  conflict that needs manual resolution.
- Vehicle-type totals use the truck's current type; trips store no copy. Legacy trips without a team
  are still grouped by the truck's only current tag.
- Saved survey jobs are picked from a dropdown, so they have no multi-select. Finance entries,
  soil price history, evidence and members are append-only or disable-only by design.
- The page does not hide actions per role beyond the existing owner/manager/operator rules.
- One import is one local transaction. Cloud upload is still record by record with retry.
- Import history evidence (previous driver link, reset deactivation) comes from the local audit, so
  another device sends those rows to review.
- NOT VERIFIED: real Google login, real sheet import with this build, real cloud sync, published
  Firestore Rules, physical phones and tablets, dark mode (the app has none).

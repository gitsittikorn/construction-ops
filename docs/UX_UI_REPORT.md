# UX/UI and complete demo project — 2026-11-09–10

User scope: improve internal pages for people unfamiliar with computers, including buttons/selects/headings that touch, allow workflow-based sidebar ordering, prepare a whole DEMO project and commit/push. Baseline `48adc66` (application `aec9592`), initially clean. Preserve existing data, role enforcement and sync/storage architecture. No environment publication or cloud deployment is part of this task.

## Review and implementation

Applied the public [Vercel Web Design Guidelines skill](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) and its current [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md), read directly from the official repositories. The available cloud catalog contains only runtime/desktop/setup skills, with no executor skills. No UX plugin was installed, no third-party script was executed and no account data was submitted to a design service. Persistent project-specific rules and demo instructions: [UX_UI_GUIDE.md](UX_UI_GUIDE.md).

Scoped review findings, using the skill's file/location format (locations identify the changed area rather than fixed line numbers):

```text
src/styles.css - inner-page help/labels were 10–12 px and low contrast; Sheets panel lacked padding. Add readable 14–16 px text, 20 px section headings, 8+ px label/control gap, 16 px action/filter gaps and 20–24 px section/card padding.
src/App.tsx - generic descriptions did not explain next actions; similar workflows were separated in the menu. Group existing labels by daily work, setup, review and account/data care; add accurate per-page descriptions and optional three-step help.
src/App.tsx - page changes retained a long page's scroll position. Return to the page start on navigation; add a keyboard skip link to main content.
src/ReportsPanel.tsx - all filters competed equally and an invalid range/empty result had no one-step reset. Keep common filters first, disclose advanced filters, add reset, empty-state instructions and legible numeric summary cards.
src/ReportsPanel.tsx - wide tables lacked a keyboard focus target and scrolling guidance. Make the report container focusable with a visible outline and a small-screen scroll hint.
src/DailyPanel.tsx, src/EvidencePanel.tsx - status codes repeated technical English ahead of the explanation. Show the Thai state labels, preserving the underlying domain states and permission checks.
src/App.tsx - project cards counted legacy trips only, omitting daily rows. Aggregate operational report rows for the project count instead of showing zero for populated daily projects.
```

No side-menu item was removed. Operators still cannot access finance/member administration or create demo business records. Existing accessible names stay stable except the project status control is explicitly named **สถานะโครงการ**. Existing success/error/closeout assertions remain enabled and now check the visible Thai status text.

## Demo behavior and independent numeric checks

**ภาพรวม → สร้างโครงการ DEMO และดูรายงาน** creates one clearly named example project through the normal atomic `updateData`/outbox path, then filters Reports to that project. The action explicitly explains that it adds data to the current local/company workspace. No automatic startup seeding, cross-account transfer or credential configuration. Repeated clicks/opening reuse the existing project and preserve changes, including draft status. Reserved-ID collisions and tombstones are rejected without overwrites. Existing operational records/pending originals remain intact.

Example records include two trucks (12/20 m³), two drivers, team/source/soil, five daily sessions, three finance rates, three expenses and a nine-point survey. Date range is the current Thai work date and four preceding days. Counts `[8,10,12,9,11]` and `[5,6,7,5,7]` give **80 trips / 1,200 m³**. One truck/day intentionally mismatches and one awaits a reported count. No proof files, cloud acknowledgements, verifications or closure snapshots are invented.

Rates yield revenue **96,000 baht**, truck cost **32,000**, driver cost **8,000**, expenses **6,800** and estimated difference **49,200**. Verified amounts remain zero. Survey: 10×10 m, level 0, design level 1 gives **100 m³** fill, using explicitly fictitious inputs. Unit and browser Excel readback use these numeric oracles. A report that includes DEMO warns users to select a real project before sending a work report.

The project starts active for reviewing workflows. The user can change **โครงการ → DEMO → ดู / แก้ไข → สถานะโครงการ → ฉบับร่าง**; all historical report rows remain readable and reopening DEMO does not reactivate it. Browser regression exercises this exact path and confirms that the pre-existing project/trip stay present and pending.

## Actual validation

Targeted domain/UI suite: **19 passed** before the final UI refinements. The initial browser attempt failed because a wrapping status label included its select options; added an explicit project-status accessible label, retained the assertions and reran. Targeted complete demo/navigation/recovery/spacing checks then passed **3/3** at 1440×1000, 800×1280 and 390×844 (17.8 seconds). Checks include every inner page's guide, visible label/control gaps, document overflow, filtered Excel readback, report-error reset, finance/survey oracles, draft/reopen idempotence and original-data retention. Final report-table keyboard navigation is included in the full gate recorded in ROADMAP_PROGRESS.md after execution.

The complete cloud gate and final source/checkpoint are recorded in ROADMAP_PROGRESS.md and PHASE_8_FINAL_QA_REPORT.md. No user usability-study score, complete WCAG certification, real Google/Drive/Sheets success or physical-device acceptance is inferred from browser fixtures. The separate real Sheets account error still needs its actual visible error/origin; this task does not claim to resolve OAuth configuration.

The first complete gate passed unit/backend/emulator stages but ended with **63/67 E2E**: preserve the daily 48 px target after a shared 46 px override; update the project-status selector and explicitly assert the new empty-state table row. A subsequent run reached **66/67 E2E**; a broad test-selector replacement had also renamed the unrelated soil-type status selector. Restored that test's original status name while retaining the explicit project-status checks. No test or assertion was disabled. The cloud suspension interrupted access to results, not an intentional test skip; resumed the same workspace with all changes present and reran the full gate after the last correction.

Upstream added MODEL_ROUTING.md and its AGENTS link while this task was in progress. Read both before delivery and preserve those documentation commits. Classification: UI/feature implementation, moderate risk; recommendation 6.1 Sol / High / Standard. No actual model switch was requested or claimed. Demo quantities/currency use independent known numeric fixtures and existing production calculators; no formula, permission, schema or cloud acknowledgement was changed.

## Cleanup and delivery

Final validated source **`222ab69`**, 2026-11-10 (Asia/Bangkok): cloud `npm run check` **exit 0**, frontend **330/330** (57 files), backend **15/15**, Firestore Rules **11/11**, emulator integration **10/10**, Playwright **67/67** (2.5 minutes), lint/editor tooling **4/4**. Formatting/lint/typecheck/build/HTTP smoke PASS; 59 existing lint warnings, zero errors, no skipped tests or unhandled rejections. Upstream model-routing documentation was merged as `7a5fd71` afterward; application source remains identical to the tested commit.

Reviewed screenshots from the final E2E use only synthetic DEMO data:

| Page                          | Actual screenshot                                                               |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Reports, desktop              | [80 trips / 1,200 m³](screenshots/ux-reports-desktop.png)                       |
| Finance, desktop              | [49,200 baht estimated difference](screenshots/ux-finance-desktop.png)          |
| Master data / Sheets, desktop | [Larger labels and separated controls](screenshots/ux-masters-desktop.png)      |
| Reports, mobile layout        | [390 px layout and internal table scrolling](screenshots/ux-reports-mobile.png) |

Cleanup completed with `npm run clean`; restored only the two pre-existing generated Phase 2 screenshots. These four useful example screenshots are intentionally retained. No real project was seeded by the assistant, no external Google account was modified, and no application deployment was performed.

Keep only useful reviewed screenshot examples in docs/screenshots; all use synthetic DEMO data. Use `npm run clean` for generated test results/build metadata/emulator logs and restore the two existing Phase 2 screenshots regenerated by E2E. Preserve source, dependencies, lockfiles, unknown files, credentials, IndexedDB and user uploads. Source/documentation commits and a normal fast-forward GitHub push are explicitly authorized; deployment is separate. Check remote HEAD after push rather than assuming it succeeded.

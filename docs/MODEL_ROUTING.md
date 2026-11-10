# AI Model Routing Policy — construction-ops

## Scope and limits

This document is a project-level recommendation policy for Codex agents working on construction-ops. It is **not** a model selector or a way to change the Codex UI's selected model, intelligence/reasoning effort, or speed. If the current runtime offers no supported model-selection capability, continue with the selected model. Never claim an automatic model switch happened.

Model labels and availability may change. The following names are preferences based on the user's November 2026 model menu, not guarantees of relative performance. Apply the task/risk policy even if a listed model is unavailable.

## Recommended task routing

| Task                                                                                                                | Preferred model | Intelligence | Speed    |
| ------------------------------------------------------------------------------------------------------------------- | --------------- | ------------ | -------- |
| Feature implementation, TypeScript/React, APIs, bug fixes, phases, integrations and E2E                             | 6.1 Sol         | High         | Standard |
| Architecture, data integrity, authentication/security review, sync design and critical earthwork calculation review | 6 Astra         | High         | Standard |
| Scoped responsive UI, page layout, styling and accessibility adjustments                                            | 6.1 Terra       | Medium       | Standard |
| Documentation, formatting, routine summaries and simple clearly scoped changes                                      | 6 Luna          | Medium       | Standard |

These are suggested defaults, not a benchmark, and should never override test evidence or current platform constraints. Escalate complex UI or documentation tasks to the implementation/architecture category when they carry high risk.

## Session procedure

1. Read AGENTS.md and the current roadmap, tests, checkpoints, source and Git state before proposing work; follow the existing project workflow.
2. Determine task type and risk: **critical** for quantities/prices, earthwork calculations, cross-account authorization, OAuth, cloud data integrity, sync/conflict resolution and migration; **moderate** for ordinary features; **low** for cosmetic or documentation changes.
3. At the start of a substantial task, briefly report `Task category | Risk | Recommended model / effort / speed | Actual model (only if verifiable)`. Do not infer which model is running from the recommendation.
4. Continue autonomously with the currently selected model when authorized, even if a different one is recommended. Do not pause merely to request a model change. Suggest a manual switch only when its benefit is material and avoid repetitive prompts.
5. If an authorized orchestration environment provides **real** supported model routing, it may route tasks according to the preferences above. Verify its capabilities and usage/cost limits before relying on automatic dispatch. Do not modify client/application settings just to emulate a switch.
6. Do not equate High intelligence or a premium model with validated correctness. Run the existing project checks, retain evidence and report what remains unverified.

## Critical calculation acceptance

- Keep measurements, elevations, units and sign conventions explicit. Separate measured facts, customer assumptions, proposed levels and provisional inputs.
- Distinguish in-place/compacted volume from loose truck volume; label swell/compaction factors and their direction; never silently apply a factor twice.
- Test area/grid interpolation, average levels, cut versus fill, slope boundaries, volume, allowance factors, truck capacity, trip rounding and edge cases (zero, negative, missing and extreme values).
- Use independent hand-checked fixtures with tolerances and show calculation provenance. If a formula or site parameter is unclear, flag it; never invent survey readings or imply real-world density tests have passed.
- Require meaningful unit, integration and regression tests before marking a quantity/pricing change complete.

## Cloud sync/data security acceptance

- IndexedDB is local/pending until acknowledged by the configured backend; never mislabel a local save as verified cloud storage.
- Test offline queues, reconnection/retry/backoff, idempotency/deduplication, concurrent edits/conflict handling, account and company isolation, partial uploads, token expiry, quota and error recovery.
- Enforce authorization on backend/security rules, not merely frontend UI; use least-privilege OAuth scopes and keep secrets out of the frontend/repository.
- Distinguish emulator/mock verification from tests against actual Google/Firebase services. Never claim real Drive/Sheets integration works without corresponding real-service evidence.
- Validate migration/recovery before changing stored data schemas; do not discard unsynced records.

## Verification, reporting and precedence

- Preserve existing `npm run check`, unit, integration, typecheck, build and E2E gates as applicable and the existing BUG_TRACKER, roadmap progress and checkpoint workflow in AGENTS.md.
- A recommendation to use Astra or any other model is **not** permission to deploy, push, delete, overwrite user data, incur usage costs or change external accounts.
- Existing AGENTS.md rules and the latest explicit user instruction take precedence if this document conflicts with them. Keep roadmap phase numbering exactly as defined in the repository (currently Phase 0–8); do not invent new phases.
- Update this policy only when the user's preferences or actual platform capabilities change.

# Bug and security scan — 2026-11-09

Validated source `ba6ad8c`; baseline `cbef922`, initially clean branch `work`. The user explicitly authorized bug fixes, generated-file cleanup, security/skill inspection, commit and GitHub push. No hosting, Rules, backend or environment deployment/publication is included. This scoped source/dependency/secret review does not establish that the application has no vulnerabilities or replace production acceptance.

## Confirmed findings and fixes

### SEC-004 — sealed evidence could be reparented or overwritten (High, Phases 3/5)

Before the fix an operator could change an existing evidence record's session/date to a different open day: Rules checked the proposed parent but did not freeze the original context. An isolated authenticated emulator regression actually reproduced this: `assertFails` failed with **Expected request to fail, but it succeeded**. Supervisors could also rewrite historical records. After reopening an unchanged day, the client reused the previous evidence ID and could replace the bytes referenced by a historical closure.

Rules now bind evidence to its original session, row, date, truck, driver, fingerprint and closure generation, reject tombstone updates, require an open/reopened parent and prohibit updates once that generation is closed. Current verification must first be cleared by an authorized supervisor. Legacy records without a generation are generation 0. Closing and reopening creates fresh evidence IDs; the old closure, records and original bytes remain intact. Managers/owners can create missing historical records for backup recovery, including earlier unused alternatives, but cannot update existing historical records. This trusted recovery permission is not proof of external authenticity of newly restored data.

Regression covers the previously successful operator request, historical update denial, reopen/new proof, verification invalidation, worker denial and supervisor permission for historical restore. Browser close/reopen/reverify/reclose collects fresh synthetic proof and retains both closure snapshots. The fix is committed source; production Rules still require a separately authorized deployment.

### SEC-005 — AES-GCM accepted shortened authentication tags (Medium, backend)

Semgrep identified a decryptor without explicit `authTagLength`. A local synthetic Node 24 reproduction confirmed that the original primitive accepted a 4-byte prefix of a valid tag (with a deprecation warning), reducing authentication strength if a stored ciphertext record is modified. This was not demonstrated as unauthenticated access to the credential database.

The vault now pins encryption and decryption to 16-byte tags and validates the 12-byte IV and 16-byte stored tag before decrypting. Tests reject truncated tags and malformed IV lengths, retain owner-AAD/tamper checks and verify valid records still decrypt. Version 1 storage format and valid existing credentials remain compatible; no real credentials were read or rotated.

### BUG-012 — member-specific IDs split company evidence (Medium, Phase 3/company)

The evidence hash used an actor/role cache key, so two members capturing different proof categories for the same company row could create disconnected records. IDs now use the company namespace and reuse matching existing records, including legacy IDs. A regression combines one member's driver photo and another's signature into one evidence record and retains each actor's pending original. This does not change private Drive sharing or bypass ordinary concurrent-edit conflict handling.

### BUG-013 — report references mixed evidence generations (Medium, Phase 6)

Identical row fingerprints can occur before and after reopening. The report index previously grouped all proof generations together and included Drive references from a stale verification. Reports now select the exact current verification's evidence; otherwise they select the current generation only and exclude stale Drive references. Regression verifies both paths and unchanged totals. The 5,000-day/evidence indexing benchmark remains in the gate.

## Scanners and actual results

| Check                                | Result / scope                                                                                                                                                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend production dependency audit | 0 findings (`npm audit --omit=dev --json`)                                                                                                                                                                                                                                 |
| Backend production dependency audit  | 0 findings (same command in `backend`)                                                                                                                                                                                                                                     |
| Full development dependency audit    | **23 moderate**, 0 low/high/critical; OPEN SEC-DEV-001                                                                                                                                                                                                                     |
| Semgrep OSS 1.184.0                  | 176 community JS/TS security rules, 88 production targets in `src`, `backend`, `scripts`; 5 initial findings, **4 remaining warnings at 2 HTML locations** after the GCM fix                                                                                               |
| Gitleaks 8.30.1                      | 0 findings in available Git history (`--all`), the initial 234-file snapshot and final 235-file tracked/non-ignored working-tree snapshot; output fully redacted                                                                                                           |
| Skills/scripts                       | No repository custom `SKILL.md` or executor skills found. Available cloud skills are runtime, desktop and environment setup; runtime/package instructions were reviewed. No dedicated Security skill/plugin was installed or invoked. Build/test/cleanup scripts inspected |

Semgrep community rules were pinned to `semgrep/semgrep-rules` commit `16b9e6d45f10649f6a531ec4838ed9924372c3bc`, selected from 182 JS/TS security YAML sources. Rules and scanner tools were installed under `/tmp`, not added to application dependencies. Gitleaks release checksum matched the official release checksum file. Scans ran locally with Semgrep metrics/version checks disabled; no source upload was requested.

Remaining Semgrep warnings are duplicate `javascript.lang.security.html-in-template-string` matches at `src/reports.ts:406` and `:408`. Manual review confirms title, subtitle, headers and cells pass through `escapeHtml`; existing HTML/CSV injection tests exercise script/image and formula payloads. All production `printDocument` callers supply `printableReport` output. These findings remain documented without suppressions. **One parser warning remains for `src/models.ts`**; its TypeScript model declarations and static empty-data initializer were manually reviewed and pass TypeScript. Do not interpret the scanner's approximate parsed-line summary as complete parsing of every file. Test fixtures are excluded from SAST, but included in the working-tree secret scan.

The compatible `npm audit fix --dry-run --ignore-scripts --json` proposed 13 missing optional tool packages and **zero installed version changes**; it was not applied. Both lockfiles are unchanged. The older 31-moderate count is historical; the current registry reports 23 on the same lockfiles. Follow upstream compatible remediation; do not force incompatible upgrades to hide the result.

## Reproducible scan commands

`SECURITY_TOOLS` below denotes the temporary tool directory; it contains `venv/bin/pysemgrep`, `community-rules.yml` and `gitleaks`. Install these versions and the pinned rules again on a new machine; the temporary directory is not a repository prerequisite.

```sh
npm audit --omit=dev --json
npm audit --json
npm --prefix backend audit --omit=dev --json
SEMGREP_SETTINGS_FILE=/tmp/construction-semgrep-settings.yml \
SEMGREP_LOG_FILE=/tmp/construction-semgrep.log \
"$SECURITY_TOOLS/venv/bin/pysemgrep" scan --oss-only --metrics=off \
  --disable-version-check --config "$SECURITY_TOOLS/community-rules.yml" \
  --exclude '**/test/**' --exclude '**/emulator-test/**' \
  --exclude node_modules --exclude dist --timeout=10 \
  --json --output /tmp/construction-semgrep-final.json src backend scripts
"$SECURITY_TOOLS/gitleaks" git --no-banner --redact=100 \
  --report-format=json --report-path=/tmp/construction-gitleaks-history.json \
  --log-opts=--all .
```

The working-tree secret scan copied regular files from `git ls-files --cached --others --exclude-standard -z`, preserving relative paths and skipping symlinks, then ran `gitleaks dir --redact=100` on that snapshot. No secret values were printed. Scope excludes ignored files, external vaults, unreachable Git objects and unknown secret formats. Findings counts and triage are retained here; raw logs/reports stay in `/tmp` and are not assumed to survive another session.

## Verification and handoff

Final cloud `npm run check` on source `ba6ad8c`: **exit 0**, frontend **314/314** (53 files), backend **15/15**, Rules **10/10**, emulator integration **10/10**, E2E **58/58** (2.3 minutes). Formatting, lint/tooling (4 tests), TypeScript, production build and HTTP smoke pass; 59 lint warnings, zero errors. No skipped tests or unhandled rejections. Additional report/reference and performance tests: 11 passed. The initial full gate before the report fix also passed (313 frontend); its count is superseded by the final gate. Commands and acceptance boundaries are retained in ROADMAP_PROGRESS.md and PHASE_8_FINAL_QA_REPORT.md.

Cleanup uses `npm run clean` only, plus restoring the two known tracked Phase 2 screenshots regenerated by E2E. Preserve all source, dependencies, lockfiles, user files, credentials, pending originals and IndexedDB. No broad `git clean`, user-data reset or production attack is part of this work.

Real Google/Firebase/Drive identity/consent/revocation/restore, production Rules/headers, shared-folder ACLs and hardware acceptance remain NOT VERIFIED. Physical Android is deferred by the user. Staging CSP/frame-policy compatibility, distributed/edge throttling, manual accessibility and hostile-file fuzzing remain follow-ups. See SECURITY_REVIEW.md and PRODUCTION_SMOKE_PLAN.md.

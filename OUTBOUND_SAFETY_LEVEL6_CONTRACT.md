# Welcome Deck + HR Moments Outbound Safety Level-6 Contract

## Objective

Apply the independently forward-tested outbound safety system to Welcome Deck
Assistant as a materially distinct Google Apps Script target, prove a
10-employee provider-free capture workflow, backport only generally useful
improvements to HR Moments Assistant, and independently evaluate both projects
before increasing reusable maturity to level 6.

## Authority and scope

- Requested by: project owner on 2026-07-23.
- Allowed repositories:
  - `C:\dev\welcome-deck-assistant`
  - `C:\dev\hr-moments-assistant`
  - `C:\dev\codex-reusable-system`
- Allowed mutations: source, named QA, test fixtures, contracts, reusable skill
  guidance, maturity registry, and bound test-project deployment.
- External/destructive actions requiring explicit evidence and safe gates:
  provider reads, Drive/Slides writes, live Slack/Gmail access, production deck
  changes, broad cleanup, and live employee data.
- Explicitly out of scope: sending employee email, Slack messages, browser
  scraping, production deck writes without exact confirmation, and claiming
  live provider proof from mocks or captures.

## Source specifications

| Source | Role | Authority when sources conflict |
| --- | --- | --- |
| Installed `outbound-action-qa` skill | Safety and evidence contract | Highest for outbound claims |
| Welcome Deck source and README | Target workflow and domain behavior | Highest for product-specific behavior |
| HR Moments level-5 implementation | Proven reference patterns | Adapt, never copy domain fields blindly |
| This contract | Cross-project execution and completion gates | Highest for project status |

## Current baseline

- Stack: Google Sheets-bound Apps Script, no Node package or named local QA.
- Existing effects: Gmail search/attachment reads, Slack API reads, Drive photo
  persistence, Google Slides duplication/update/removal.
- Existing safety: editable `DRY_RUN` setting; tests state they avoid providers.
- Known risks:
  - one setting conflates provider reads and artifact writes;
  - simulation writes `Added to Deck` and synthetic slide IDs;
  - provider calls are not centrally gated;
  - no durable TEST/LIVE or Test Run ID provenance;
  - no capture ledger, provider-contact evidence, retry checkpoint, or
    operator readiness surface;
  - repo has no `.clasp.json`, so the bound deployment target is not yet
    established.
- Git baseline: clean `main` branch before contract creation.

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Implemented and verified
- `[d]` Deferred intentionally
- `[b]` Blocked
- `[n/a]` Not applicable

## Phase 0 — Discovery and adaptation

- [x] Read architecture, provider inventory, README, manifest, instructions,
  reusable skill, and git status.
- [x] Define Welcome Deck as the named repo despite the user's informal
  “Welcome Desk” wording.
- [x] Define deployable scope as root `.gs`, `.html`, and manifest files.
- [x] Record external providers: Gmail, Slack HTTP, Drive, and Slides.
- [x] Define evidence order: local source QA, local behavior QA, deployed
  10-employee capture, operator UI inspection, then independent evaluation.

Exit gate:

- [x] Contract reflects Welcome Deck's photo/Slides workflow rather than HR
  Moments' email schema.

## Phase 1 — Protected modes and provenance

- [x] Replace editable `DRY_RUN` authority with protected DATA,
  DISCOVERY, and OUTPUT modes with safe defaults.
- [x] Add durable Data Mode and Test Run ID to source/queue records.
- [x] Add canonical source-to-queue identity revalidation and duplicate-ID
  blocking.
- [x] Add a shared re-entrant script lock for property writers, provider paths,
  fixtures, cleanup, and inspection.
- [x] Persist an operator-visible readiness report.

Exit gate:

- [x] Missing/invalid configuration cannot contact Gmail/Slack or mutate
  Drive/Slides.

## Phase 2 — Provider gates and honest state machines

- [x] Centralize every Gmail, Slack, Drive, and Slides access behind the
  appropriate protected gate.
- [x] Distinguish `Simulated`, `Captured`, `Artifact Pending`,
  `Draft Artifact Created`, `Published`, and reconciliation states.
- [x] Add a capture ledger with actor, target deck, employee/queue identity,
  payload fingerprint/reference, modes, run IDs, receipt, and
  `Provider Contacted=FALSE`.
- [x] Add pre-artifact checkpoints and idempotent retry/collision validation.
- [x] Require exact recipient/target-bound confirmation for LIVE deck writes.
- [x] Keep scheduled/automatic paths provider-free unless separately proven.

Exit gate:

- [x] Simulation/capture cannot be reported as a Slides artifact or
  publication, and retries cannot duplicate artifacts.

## Phase 3 — Ten-employee QA and admin UX

- [x] Add a named source/provider inventory QA command.
- [x] Add a named behavior harness covering positive and adversarial paths.
- [x] Add a run-owned 10-employee TEST/MOCK/CAPTURE fixture using
  `example.invalid` addresses.
- [x] Add exact-run cleanup and a read-only persisted evidence inspector.
- [x] Display effective modes, selected target, provider readiness, pending
  actions, and last capture/live receipt persistently in the sidebar.

Exit gate:

- [x] Named local QA proves ten distinct employees through 20 unique captures
  (10 welcome-slide plus 10 collage-member), zero provider calls, honest
  statuses, run-owned cleanup logic, serialized mutation paths, retry, and
  identity boundaries.

## Phase 4 — Deployed Welcome Deck proof

- [x] Establish the exact bound Sheet/Apps Script target and `.clasp.json`.
- [x] Verify `clasp status` excludes repository metadata, dependencies, and
  unrelated apps.
- [x] Push only the intended Apps Script deployment scope.
- [x] Run the 10-employee fixture once in the bound environment.
- [x] Inspect 10 source rows, 10 queue rows, 20 capture rows, zero provider
  artifacts, and the readiness UI.
- [x] Run the persisted evidence inspector and record the run ID.

Exit gate:

- [x] Bound-runtime evidence proves the provider-free capture workflow.

Evidence:

- Bound Sheet:
  `https://docs.google.com/spreadsheets/d/1GUTs3uI4fOuTSglw8H5F-GD5ZNhUoA2MJuRK4D6oIG4/edit`
- Bound Script ID:
  `1RMiDZHDJ-xOgMza_6lVKh8EuOvaDiJZpFLsbBCV0XDaLqu25N3fh-72Z`
- Successful final run: `WDAAGENT7E66B80602A9`.
- Persisted inspector: 10 employees, 10 queue rows, 20 unique captures
  (10 welcome-slide and 10 collage-member).
- Separate inspector: `captureEvidenceValid=true`,
  `providerContacted=false`, 20 distinct receipts, and zero Slides artifacts.
- Curated receipt-to-queue/type mappings, source hashes, execution times, and
  operator-readiness observations:
  `evidence/WDAAGENT7E66B80602A9.json`.
- Sidebar inspection showed protected `TEST / MOCK / SIMULATE`, no active test
  run, target/credential readiness, automation state, pending count, and last
  capture/live receipts, with no legacy editable `DRY_RUN` authority.
- Independent-audit repairs include operation-level provider-file inventory,
  strict missing provenance rejection, stale photo clearing while preserving
  artifact evidence for reconciliation, exact active-run isolation across all
  entry points, retry-safe single-slide and collage checkpoints, distinct
  DRAFT/LIVE states, and client-safe Date serialization.

## Phase 5 — Reciprocal HR Moments test

- [x] Review Welcome Deck discoveries for genuinely reusable improvements.
- [x] Backport only improvements that strengthen HR Moments' applicable
  boundaries.
- [x] Re-run HR Moments named QA and deployed/source evidence as proportional
  to the change.
- [x] Record non-applicable Welcome Deck concepts instead of forcing them into
  HR Moments.

Exit gate:

- [x] Both projects pass their own domain-appropriate acceptance matrix.

Evidence:

- Backported a separate protected Gmail-read mode so CAPTURE output can coexist
  with MOCK reads and enabling provider reads cannot enable provider writes.
- Backported actor-identity fallback for Apps Script environments that withhold
  account email.
- HR Moments named local QA passed.
- HR Moments hosted run `AGENT986AE3ECF4F6` proved 10 employees, 10 queue
  rows, 10 captures, zero Gmail artifacts, `captureEvidenceValid=true`, and
  `providerContacted=false`.
- Slides/deck concepts were not forced into HR Moments' email workflow.

## Phase 6 — Independent cross-project evaluation and reusable maturity

- [x] Run one additional context-isolated evaluation of Welcome Deck.
- [x] Run one additional context-isolated cross-project audit proving material
  distinction and reusable transfer.
- [x] Update reusable skill/evidence with lessons supported by the two hosted
  target runs and the retained independent level-5 evaluation.
- [x] Set level 6 / `provenReusable=true` only after both real targets pass.
- [x] Validate and reinstall the reusable skill globally.

Exit gate:

- [x] Evidence supports repeated proof across two materially distinct targets.

Evidence:

- The reusable registry records maturity level 6, `solid=true`, and
  `provenReusable=true`.
- The skill adds separate provider-discovery/read authority, actor-identity
  fallback, and one-time fixture setup guidance.
- Reusable-system validation and capability-maturity tests passed.
- `install.ps1 -Apply` installed the updated skill and merged the reusable
  AGENTS instructions globally.
- The strict Welcome Deck evaluator verified all runtime defects closed, then
  required and rechecked an operation-level inventory plus an injected
  single-slide post-provider persistence failure.
- The independent cross-project evaluator returned strict PASS after checking
  both named suites, all 20 mapped Welcome captures, all 12 source hashes,
  material provider/workflow distinction, and bidirectional lesson transfer.

## Deviations

| Date | Requirement | Difference | Reason | Approved/derived from |
| --- | --- | --- | --- | --- |
| 2026-07-23 | Project name | Filesystem/repo uses “Welcome Deck,” not “Welcome Desk” | Slides-deck product behavior and repo name make the intended target unambiguous | User request plus local discovery |

## Deferred

| Item | Reason | Consequence | Needed later |
| --- | --- | --- | --- |
| Live Gmail/Slack/Slides provider proof | Not required for capture-first safety and may expose real data/artifacts | Production provider readiness remains unproven | Explicit test accounts/targets and approval |

## Blocked

None.

## Final acceptance

- [x] No required item remains not started or in progress.
- [x] Verified items have evidence.
- [x] Deferred and blocked items are explicit.
- [x] Named source, behavior, deployed capture, and UI gates pass; independent
  Welcome-only and cross-project level-6 evaluations both pass.
- [x] Level 6 is limited to the reusable safety method proven on two targets;
  it does not claim live provider readiness.

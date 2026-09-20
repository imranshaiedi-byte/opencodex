# Lane D — account/credential-generation evidence and cache affinity

Status: branch pushed for hosted CI. One branch, ordered commits, one PR
against `dev`, per the batch topology.

## Scope

Bundle 8 — an observation attributed to an account or credential generation
must not survive its replacement:

- #5214 (carried) — entitlement refreshes fenced behind native-main admission.
- #5145 (carried) — learned reasoning-effort refusals scoped to the credential
  identity, snapshot v2, legacy destination-wide rows ignored.
- #5229 (carried) — Cursor live wire-spelling and Max-Mode evidence keyed by
  destination+credential scope.
- Lane addition: Cursor and Devin live *rosters* (the cached model list
  itself, not just the derived evidence) are now bound to an irreversible
  credential fingerprint, including the stale fallback and the failure
  cooldown's suppression.
- Lane addition: a cancelled data-plane request's late entitlement refresh no
  longer commits — the /v1/models signal reaches the native-main token
  refresh, which re-checks it before the auth.json write.

Bundle 9 — a threshold hint is not exhaustion, and cache-loss causes must be
distinguishable:

- #5209 (carried) — shared cache-affinity bindings retire on genuine 100%
  exhaustion, not on the proactive auto-switch threshold.
- #4793 (carried) — per-model cache metrics on the Usage page (lane D owns
  this surface).
- Lane addition: opt-in privacy-bounded cache diagnostic (#5178), one record
  per finalized request in `cache-debug.jsonl`, so client prefix change,
  account change and proxy transformation change are distinguishable without
  retaining content or a durable correlation key.

All four luvs01 pull requests and xdober's #4793 are carried with
`Co-authored-by` trailers on the branch commits. The original pull requests
stay open for the coordinator.

## Branch

`codex/260920-lane-d-account-cache-generation`, cut from `origin/dev`
(`b9483b3b51`). Commits in order:

1. `fix(codex): preserve cache affinity across model detours` (carries #5209)
2. `fix(reasoning): scope learned reasoning-effort refusals to credential identity` (carries #5145)
3. `fix(cursor): isolate live roster and Max Mode evidence by account` (carries #5229)
4. `fix(codex): fence entitlement credential refreshes behind admission` (carries #5214)
5. `feat(usage): show cache metrics by model` (carries #4793)
6. `test(codex): move cache-affinity detour cases to a sibling under the file-size cap`
7. `fix(codex): bind Cursor and Devin live rosters to the observing credential`
8. `fix(codex): fence cancelled entitlement refreshes behind caller cancellation`
9. `feat(usage): opt-in privacy-bounded cache diagnostic (#5178)`

## Review findings on current dev (beyond the carried diffs)

- #5229 scoped the Cursor spelling/Max-Mode maps but not the roster cache
  itself: `provider-models.ts` read and wrote the Cursor and Devin live model
  lists by provider name alone, and the failure cooldown let one credential's
  error suppress another's discovery. Qoder already had the correct pattern
  (`authorityIdentity`); the lane extended it.
- The entitlement admission fence (#5214) covered lifecycle drains but not
  caller cancellation: `/v1/models` never passed `req.signal`, and the
  native-main refresh committed its late result without re-checking it. The
  roster-cache publication needed no change — it is already fenced by
  credential identity plus mutation epoch, which is the right boundary for a
  shared flight.
- False/unknown/absent is covered on the entitlement path
  (`model-entitlements.ts` keeps a `confirmed` bit separate from the model
  set, and the public state is tri-state) and is pinned by existing tests in
  `codex-model-entitlements.test.ts`. For usage telemetry the same
  distinction now survives extraction: an all-zero frame with a measured
  cache counter no longer collapses to "unreported".
- Deliberately NOT generation-scoped: quota/rate-limit avoidance
  (`health-store.ts`, `subagent-model-fallback.ts`). Those observations
  describe the subscription, not the token generation; scoping them to a
  credential refresh would re-hammer a known-drained account. The 401/403
  quarantine is already generation-fenced. Model static policy and live
  health were not mixed in either direction.

## Ownership boundaries respected

- Lane C owns send accounting (`sendCount`, request-wide send budget, stage
  and cause vocabulary). This lane consumes `loggedUsage`, provenance and
  the affinity enums and does not redefine any of them.
- Lane D owns #4793 and the per-model cache view; the diagnostic reuses the
  usage ledger's account label (salted, process-local) instead of inventing a
  new identifier.

## Verification

Per batch rules, no local suites, individual tests, typecheck, build,
install or live `ocx` execution. Verification is static source review plus
exact-head hosted CI.

- NOT RUN: `bun run test`, focused `bun test`, `bun run typecheck`,
  `bun run lint:gui`, `bun run build:gui`, `bun run privacy:scan`,
  `bun run structure:check` (all forbidden locally; hosted CI decides).
- Static checks performed: file-size ratchet evaluated against
  `tests/fixtures/file-size-baseline.json` (the carried routing test would
  have grown 83 lines over its cap — moved to a registered sibling; all new
  files are far below the 2000-line threshold); both layout registries carry
  every new test file and parse as JSON; the ten GUI locale catalogs gained
  identical keys (no hand-restated roster or count); the diagnostic module's
  imports were walked for a `src/lab/` reach (none) and `responses/core.ts`
  gains no runtime import of it.
- Focused regression tests added next to the existing subsystem tests:
  roster credential binding (Cursor, Devin), cancelled-refresh fencing
  (admission + main-account refresh), measured-zero survival (usage
  passthrough), and the diagnostic itself (privacy, fingerprints, alias
  rebinding, retention, tag independence from affinity-debug).

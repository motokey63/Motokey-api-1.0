# Deferred Items — Phase 13

## Windows/Node 24 libuv assertion crash on process.exit after any Supabase call

**Found during:** Plan 13-02, Task 1/2 automated verification (`scripts/test-push.js` invocations that reach `SBLayer.PushSendLog.insert`).

**Symptom:** After the script logs its correct result and calls `process.exit(0)`, the local Windows Node process crashes during teardown with:
```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```
The shell then reports exit code 127 even though the script's own logic completed successfully and logged the correct result.

**Root cause (confirmed, out of scope for this plan):** Reproduced with a minimal repro calling `SBLayer.BillingEvents.insert(...)` (pre-existing Phase 9 code, unrelated to pushService.js) followed by `process.exit(0)` — same crash. This is a pre-existing interaction between the Supabase JS client's internal async/websocket handles and Node v24.14.1's libuv on Windows (`src\win\async.c` — the `win` prefix confirms this is Windows-only native code). It is NOT caused by any code introduced in Phase 13.

**Why not fixed:** Per execution scope rules, only issues directly caused by the current task's changes are auto-fixed. This crash is reproducible with code that predates Phase 13 by several phases (Stripe billing_events, Phase 9). It is also Windows-only (the assertion file path is `src\win\async.c`), so it will not occur on Railway production (Linux containers) — SC-2/SC-3/SC-4 logical behavior is correct and unaffected; only the local Windows dev shell's reported exit code is polluted by this teardown crash.

**Evidence it does not affect correctness:** In every reproduction, the script's own console output and returned result object were correct and complete (e.g. `{ dev: true }`, `{ skipped: 'invalid-token' }`) before the crash occurred during process teardown, after `process.exit(0)` had already been called.

**Recommendation:** No action needed for Phase 13. If this becomes a recurring nuisance in future local Windows testing, consider adding an explicit `SBLayer.supabase.removeAllChannels()` / closing realtime handles before `process.exit()` in test scripts, or pinning a Node LTS version known not to exhibit this on Windows. Do not modify `supabase.js` client init to work around this without separate validation — out of scope here.

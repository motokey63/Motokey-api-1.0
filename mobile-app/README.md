# MotoKey — Mobile App (React Native / Expo)

React Native client for MotoKey's "Espace Client" — the mobile counterpart to `MotoKey_Client.html`, built with Expo Router + TypeScript.

## Hard rule: API-only access

This app is an **API-only client**. It calls the existing Express API at
`https://motokey11-production.up.railway.app` with the Supabase `access_token`
as an `Authorization: Bearer` header, mirroring `MotoKey_Client.html`.

**NEVER instantiate a `@supabase/supabase-js` client here** — doing so bypasses
the anti-fraud score, quota, and RBAC logic that live only in the Express
handlers (`motokey-api.js` / `supabase.js`). All data reads/writes MUST go
through the Express REST endpoints via `fetch`, never through a direct
Supabase table query.

Tokens are stored AES-encrypted via `lib/secureStore.ts` (the `LargeSecureStore`
pattern: a small AES-256 key in `expo-secure-store`, the encrypted session blob
in `AsyncStorage`) — never in plaintext `AsyncStorage`.

No `x-client-type` header is sent by this app. Omitting it entirely makes the
backend return the full session JSON (`access_token` + `refresh_token` in the
response body), which is exactly the mobile flow (see
`.planning/research/PITFALLS.md` Pitfall 3).

## Structure

- `app/` — Expo Router screens (file-based routing)
- `lib/` — framework-agnostic modules: `api.ts` (fetch client), `secureStore.ts`
  (encrypted token storage), `types.ts` (shared types)
- `constants/config.ts` — API base URL, storage keys, refresh timing constants

## Scripts

- `npm run start` — start the Expo dev server
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` — run the Jest test suite

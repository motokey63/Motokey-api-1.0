# Deferred Items — Phase 16 (out of scope for Plan 16-01)

Discovered while executing Plan 16-01 (push-wiring-end-to-end). Logged per the
scope-boundary rule (only auto-fix issues directly caused by the current
task's changes) — not fixed here.

## 1. `app.html`'s devis creation form uses field names that don't match the backend

`loadDevis()`'s "Créer un devis" form (`devisLines`, `renderDevisLines()`,
`addDevisLine()`, `saveDevis()`) builds line objects shaped
`{designation, qte, prix_ht}` and posts `{moto_id, lignes, remise}` to
`POST /devis`.

The backend (`supabase.js` `Devis.create()`, both before and after this
plan's rewrite) expects each line to look like
`{type_ligne, description, quantite, prix_unitaire, remise_pct}` (the shape
used by `_calcTotaux`, the seed fixture, and `MotoKey_Client.html`'s devis
line rendering). `saveDevis()`'s field names never matched — this predates
Plan 16-01 and is not something introduced by this plan's changes.

Plan 16-01's Task 3 scope was explicitly limited to the devis **list**
rendering (`d.reference`/`d.date`/`d.moto`/`d.total_ht` mismatch) and the new
"Envoyer au client" button — not the create form. Creating a devis via
`app.html`'s form today will insert a `lignes` array with the wrong keys,
so `_calcTotaux()` will silently compute `0` for every line (falls back to
`(l.prix_unitaire||0)*(l.quantite||0)` = 0 since those keys are absent) and
the required `client_nom` snapshot will still resolve correctly (derived
server-side from the moto's owner, not from the form), so the devis will be
created but with `total_ht/total_tva/total_ttc` all `0`.

**Fix needed (future plan):** align `app.html`'s `devisLines` state shape
and `saveDevis()` payload with the backend's `{type_ligne, description,
quantite, prix_unitaire, remise_pct}` shape, and add a `type_ligne` selector
to the line editor (defaulting to `'piece'`, matching the
`type_ligne_devis` enum: `'mo','piece','pneu','fluide','libre'`).

## 2. `client_device_tokens` table does not exist in live prod Supabase

`services/pushService.js` (Phase 13, unmodified per this plan's interfaces —
explicitly marked "do not modify") queries a table named
`client_device_tokens` to fan out push notifications to a client's devices.
Live schema introspection (PostgREST OpenAPI, 2026-07-04) confirms **no
table matching `%token%` exists in prod** at all.

This means `pushService.sendPush()` — called correctly by this plan's new
`POST /devis/:id/envoyer` route — always fails open with:
```
❌ sendPush — lookup tokens échoué pour client <id> : Could not find the
table 'public.client_device_tokens' in the schema cache
```
`sendPush()` is fail-open (catches internally, never throws), so this does
not break the `envoyer` transition itself — verified end-to-end via curl
(statut correctly transitions brouillon→envoye regardless). But it means
**no push notification can ever actually be delivered** until whichever
migration was supposed to create this table (presumably part of Phase 12 —
Backend Push Foundation) is applied to live prod Supabase.

**Action needed:** the migration file `sql/migrations/16_client_device_tokens.sql`
(and `17_push_send_log.sql`) already exist in the repo but have evidently
**not been applied to live prod Supabase** — introspection found zero
matching tables. Apply both via Supabase Dashboard SQL Editor. This is a
prerequisite for MPUSH-03 to be truly end-to-end (not just wired at the
code level), but is squarely Phase 12/13 territory, not this plan's.

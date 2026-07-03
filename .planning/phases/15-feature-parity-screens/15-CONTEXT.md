# Phase 15: Feature-Parity Screens - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 15 delivers the mobile screens that give the app functional parity with `MotoKey_Client.html` for moto/devis/garage-liaison management: a motos list (with statut couleur + score), a dedicated fiche-moto detail screen (historique + plan d'entretien + pneus), a devis screen (view + accept/refuse), and the full garage/moto liaison trio (add a moto manually, claim an orphan moto, view/leave linked garages). It also adds a read-only offline fallback (last-known-state + timestamp) for the motos and devis lists. All backend endpoints already exist and are CLIENT-accessible as-is (confirmed in `motokey-api.js`) — this is a frontend-only phase, zero backend changes, mirroring Phase 14's pattern. Explicitly NOT in scope: push notifications (Phase 16-17), app store submission (Phase 17), real photo upload for moto claims (photo stays disabled, matching the web client's current state), proactive network-state detection (NetInfo), and full profile-edit/change-password UI (not an MPARITY requirement).

</domain>

<decisions>
## Implementation Decisions

### Périmètre « liaison garage » (MPARITY-04)
- **D-01:** All three garage/moto-linkage flows from the web client are in scope: (1) claim an orphan moto (réclamation: VIN + plaque, garage validates), (2) leave a linked garage (révocation, with optional motif and a confirmation modal), and (3) add a moto manually (free-form marque/modèle/plaque/VIN/km/année form, respecting the existing plan-limit check + "Passer Pro" CTA when the limit is reached).
- **D-02:** Photo upload for moto claims mirrors the web client's current DISABLED state (`CLOUDINARY_CLOUD` is empty there too) — the claim form only collects VIN + plaque, submits `carte_grise_photo_url: 'pending_manual_verification'`, and shows "contactez votre garage pour finaliser la réclamation". No camera/Cloudinary integration this phase — this goes beyond current web parity, not behind it.

### Structure de navigation mobile
- **D-03:** Bottom tab bar with 3 tabs: **Motos**, **Devis**, **Compte**. Replaces the Phase 14 placeholder Home screen entirely.
- **D-04:** Tapping a moto in the list navigates (stack push) to a dedicated **Fiche Moto** detail screen — the list itself stays lightweight (identity + score + couleur only). This is a deliberate departure from the web client's inline-expanding card, chosen for mobile list scalability.
- **D-05:** The secondary garage/moto-linkage flows (ajouter une moto, réclamer une moto, mes réclamations, mes garages) live behind a button/menu on the **Motos** tab screen, reached via stack navigation — not separate bottom tabs (avoids a 5+ item tab bar).
- **D-06 (Claude's Discretion, documented for clarity):** The **Compte** tab is a minimal placeholder for this phase — it replaces Phase 14's "Bienvenue {email}" + logout screen as-is. Full profile editing (nom/tel) and change-password UI exist on the web client but are **not** an MPARITY-01..05 requirement, so they are out of scope here — Compte stays at Phase 14 parity (email + logout) unless a future phase scopes profile management explicitly.

### Contenu de la fiche moto
- **D-07:** Full parity with the web client's moto card: the Fiche Moto screen shows **historique d'interventions** (MPARITY-03), **plan d'entretien** (alertes d'échéance, e.g. "Révision due dans 500km"), and **pneumatiques** (dimensions avant/arrière) — all three sections, matching `renderMotoCard()` in `MotoKey_Client.html`. All three backing endpoints already exist and are wired for the CLIENT role.

### Cache offline lecture-seule (MPARITY-05)
- **D-08:** No dedicated network-detection library (no `@react-native-community/netinfo`). Reuse the existing `apiFetch` failure path (network/timeout errors already fall into its catch block, returning `{ ok: false, status: 0 }`) — on that failure, fall back to displaying cached data with its "dernière mise à jour" timestamp instead of the generic error state.
- **D-09:** Cache scope is deliberately narrow: only the **motos list** (enriched with interventions/alertes/pneus, matching what's already fetched for the online render) and the **devis list**, stored in `AsyncStorage` (already a project dependency, used today for the session blob) alongside a last-successful-fetch timestamp. Fiche moto detail (if not already covered by the motos-list cache), réclamations, and garages screens remain online-only — they're lower-priority/less time-sensitive reads.

### Claude's Discretion
- Exact `AsyncStorage` key naming and cache invalidation/eviction strategy.
- Tab bar icon choice/visual treatment (check `@expo/vector-icons`, already an Expo-bundled dependency per SDK 54's `bundledNativeModules.json`, before introducing a new icon library).
- Exact stack/route file structure under Expo Router for the new screens (e.g. whether secondary flows nest under `app/(app)/motos/` or a separate group) — follow Expo Router file-based conventions already established in `app/(auth)/` and `app/(app)/`.
- Whether the plan-limit "Passer Pro" CTA block needs any mobile-specific copy changes beyond a direct port of the web client's text.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reference implementation (source of truth to port)
- `MotoKey_Client.html` lines 609-689 (`renderMotoCard`) — moto card sections: identity, score badge, garage de référence, historique interventions, plan d'entretien, pneumatiques. This is the exact content spec for the Fiche Moto screen (D-07).
- `MotoKey_Client.html` lines 691-729 (`loadMotos`) — motos list fetch pattern: `GET /motos` then parallel `GET /motos/:id/interventions` + `GET /motos/:id/entretien/alertes` per moto to enrich each card.
- `MotoKey_Client.html` lines 946-1021 (`loadClientDevis`, `acceptDevis`, `refuseDevis`) — devis list rendering, statut labels/colors (`envoye`/`valide`/`refuse`/`brouillon`), accept/refuse actions via `POST /devis/:id/valider` and `POST /devis/:id/refuser`.
- `MotoKey_Client.html` lines 1127-1172 (`renderAddMotoTab`, `submitAddMoto`) — add-moto form fields, plan-limit check (`GET /client/limite-motos`), "Passer Pro" CTA block when `can_add` is false.
- `MotoKey_Client.html` lines 1174-1223 (`renderClaimTab`, `submitClaim`) — moto claim form (VIN + plaque only per D-02), disabled-photo fallback text, `POST /client/reclamations` with `carte_grise_photo_url: 'pending_manual_verification'`.
- `MotoKey_Client.html` lines 1225-1247 (`loadClientReclamationsTab`) — réclamations list, statut labels (`en_attente`/`accepte`/`refuse`/`litige`).
- `MotoKey_Client.html` lines 1249-1269 (`loadClientGaragesTab`) plus lines 360-380 (revoke modal markup) — garages list, active/quitté statut badge, revoke modal with optional motif and the legal notice text (verbatim, see Specifics below).

### Backend endpoints (confirmed CLIENT-accessible, zero changes needed)
- `motokey-api.js` line 670: `GET /motos` — motos list
- `motokey-api.js` line 874: `GET /motos/:id/interventions` — historique (MPARITY-03)
- `motokey-api.js` lines 989, 1004: `GET /motos/:id/entretien`, `GET /motos/:id/entretien/alertes` — plan d'entretien
- `motokey-api.js` lines 1099, 1144: `GET /devis`, `POST /devis` (accept/refuse are sub-routes per web client: `/devis/:id/valider`, `/devis/:id/refuser`)
- `motokey-api.js` line 1540: `GET /client/limite-motos` — plan limit + CTA Pro flag
- `motokey-api.js` line 1557: `POST /client/motos` — add moto manually
- `motokey-api.js` lines 1602, 1643: `POST /client/reclamations`, `GET /client/reclamations` — claim a moto
- `motokey-api.js` lines 1665, 1687: `GET /client/garages`, `DELETE /client/garages/:id` — garages list + revoke

### Project constraints & prior phase context
- `.planning/REQUIREMENTS.md` — MPARITY-01..05 acceptance criteria; Out of Scope table confirms only MPARITY-05's read-only cache is in scope, not full offline write-sync.
- `.planning/phases/14-rn-app-scaffolding-native-auth/14-CONTEXT.md` — D-05 (placeholder Home this phase replaces), D-06 (brand palette source), established `apiFetch`/`AuthContext` patterns to reuse, not reinvent.
- `.planning/PROJECT.md` — "3ème clé digitale" core value, anti-fraud score weighting (1.0/0.6/0.3) — do not alter when rendering score display, just present it.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mobile-app/lib/api.ts` — `apiGet`/`apiPost`/`apiPut`/`errMsg` fetch helpers already port `MotoKey_Client.html`'s API client 1:1; reuse directly for all new screens' data fetching.
- `mobile-app/hooks/useAuth.ts` + `mobile-app/context/AuthContext.tsx` — session/token access already wired; new screens pull the access token from here for `apiGet`/`apiPost` calls.
- `mobile-app/theme/colors.ts` — brand palette (orange accent, status colors `gn`/`bl`/`yw`/`rd` matching `couleur_dossier`) already locked from Phase 14; reuse directly for score/statut rendering, do not reintroduce or rename.
- `mobile-app/components/{Button,TextField,Toast,Logo}.tsx` — existing shared components from Phase 14's kit; reuse for forms (add-moto, claim) and toasts (accept/refuse devis, claim submitted, garage left).
- `@react-native-async-storage/async-storage` (already a `package.json` dependency, used today for the encrypted session blob) — reusable for the MPARITY-05 read-only cache (D-09), no new dependency needed.

### Established Patterns
- Fetch-based API client with `Authorization: Bearer <token>`, no direct Supabase client instantiation ever (hard rule, see `mobile-app/lib/api.ts` header comment and `README.md`).
- French error/status copy ported verbatim from the web client, not rewritten (established in Phase 14 D-03) — this phase's new copy (empty states, CTA Pro block, legal notice) should follow the same verbatim-port discipline.
- `apiFetch`'s catch block already returns a network-failure shape (`{ ok: false, status: 0, data: { error: { message: "Serveur inaccessible..." } } }`) — this is the exact signal D-08's offline fallback should key off of.

### Integration Points
- `mobile-app/app/(app)/_layout.tsx` — currently renders just the placeholder Home; this phase restructures it into the 3-tab bar (D-03) plus stack screens for Fiche Moto and the secondary garage/moto flows (D-04/D-05).
- `mobile-app/app/(app)/home.tsx` — deleted/replaced by the new Motos tab screen (or repurposed as the minimal Compte tab per D-06 — planner's call which file becomes which).

</code_context>

<specifics>
## Specific Ideas

- Legal notice text for the revoke-garage modal, reuse verbatim: *"Information légale (art. L110-4 Code de commerce) : votre historique d'entretien sera conservé par le garage pendant 10 ans après révocation. Vous perdrez uniquement l'accès en lecture à ces données."*
- Devis statut labels/colors to port exactly: `envoye` → "À valider" (orange), `valide` → "Validé" (green), `refuse` → "Refusé" (red), `brouillon` → "Brouillon" (grey) — brouillon devis are already filtered server-side for CLIENT role (per L2 delivery, `GET /devis` filters drafts).
- Réclamation statut labels to port exactly: `en_attente` → "En attente", `accepte` → "Acceptée", `refuse` → "Refusée", `litige` → "Litige".
- Empty states should follow the web client's tone: icon + short sentence + a CTA button where applicable (e.g., "Aucune moto pour l'instant... + Ajouter ma moto" button), not bare "No data" text.

</specifics>

<deferred>
## Deferred Ideas

- Real Cloudinary photo upload for moto claims (camera/gallery picker) — deferred until the web client itself enables it (`CLOUDINARY_CLOUD` is currently empty there too); revisit together.
- Proactive network-state detection (`@react-native-community/netinfo`, live "Hors ligne" banner) — deferred in favor of the simpler fallback-on-failure approach (D-08); revisit if users report confusion about stale data.
- Full profile-edit (nom/tel) and change-password UI in the Compte tab — not an MPARITY requirement; Compte stays minimal this phase (D-06).
- Push notifications, deep links, app store submission — already scoped to Phase 16/17, unchanged.

None — discussion stayed within phase scope otherwise.

</deferred>

---

*Phase: 15-feature-parity-screens*
*Context gathered: 2026-07-03*

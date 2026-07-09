# Requirements: MotoKey — Garage DMS

**Defined:** 2026-07-08
**Core Value:** Le score d'intégrité anti-fraude (pondération 1.0/0.6/0.3 selon la preuve)

## v1 Requirements

Requirements for milestone v1.4 (Maintenance). Each maps to roadmap phases.

### Fixtures & Test Data

- [x] **CFIX-01**: Developer/QA can log in as the CLIENT test fixture (`sophie@email.com` / `client123`) and receive a valid session

### Database Schema

- [x] **SCHEMA-01**: Developer can run `schema.sql` against a fresh Supabase project and get a schema matching prod for the known-tracked drift (migrations 1–19: `client_device_tokens`, `push_send_log`, `garage_users`, `clients` UNIQUE(email,garage_id), moto maintenance-tier columns, corrected `statut_devis` CHECK constraint). **Scope explicitly narrowed 2026-07-08** after Phase 19 research found ~19 additional live tables (repair-order subsystem, billing/invoicing, parts catalogue, separate client-auth system) with zero file anywhere in the repo — full parity deferred, see Out of Scope below. `schema.sql`'s header documents that it is a known-partial bootstrap. Verified 2026-07-09: clean bootstrap against a fresh Supabase project + automated compare vs prod (5/5 must-haves). Execution also surfaced and fixed missing migration 10/13/15 columns (real omission in tracked scope); a further category of undocumented drift (no migration file) on `garages`/`clients`/`interventions`/`devis` was found and deferred to a future phase per Mehdi's decision — see Out of Scope.

## v2 Requirements

None — this is a small maintenance milestone, no deferred scope identified.

## Out of Scope

| Feature | Reason |
|---------|--------|
| BILL-06 (Stripe live mode) | Blocked on Mehdi's Stripe Dashboard action, not code — tracked separately in PROJECT.md Known Gaps |
| MSTORE-02 (App store submission) | Blocked on Mehdi creating paid developer accounts — tracked separately in PROJECT.md Known Gaps |
| Any new user-facing feature | Explicitly scoped out for v1.4 — this milestone is pure debt cleanup |
| Full schema.sql parity (~19 tables: `ordres_reparation`/`or_taches`/`or_pieces`/`or_historique`, `catalogue_pieces`, `entites_facturation`/`factures`/`factures_scannees`/`compteurs_documents`, `pdp_queue`/`pdp_transmissions`, `plans_constructeur`, `moto_proprietaires`, `users_client`+auth tables, 3 views) | Discovered during Phase 19 research (2026-07-08) — these tables exist live with zero file anywhere in the repo, but reconstructing full DDL/RLS/indexes/triggers for all of them is a much larger effort than v1.4's "small maintenance milestone" framing. Deferred to a dedicated future phase/milestone. |
| Migration 13/15 objects not yet in schema.sql (`billing_events` table, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto`, `v_motos_avec_proprietaire` view) | Discovered during Phase 19 execution (2026-07-09) — tracked migration files, but new tables/views rather than columns on already-in-scope tables. Documented in schema.sql's header. Deferred alongside the item above. |
| Undocumented schema drift with no migration file — columns on `garages` (ville, cp, type, marque_officielle, actif), `clients` (client_type, raison_sociale, siret, tva_intracom, adresse_facturation), `interventions` (niveau_preuve, facture_id, photo_url, operation_code), `devis` (~24 columns incl. entite_facturation_id, or_id, denormalized client_*/moto_* fields, lignes JSONB) | Discovered 2026-07-09 via `scripts/introspect-schema.js --compare` — no corresponding file anywhere in `sql/migrations/`, likely ad-hoc Dashboard changes from other livraisons (OR system, billing entities, devis restructuring). Mehdi's explicit decision: defer to a future phase requiring dedicated ground-truth research (like Phase 19's own plan 01) before safely adding to schema.sql. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CFIX-01 | Phase 18 | Complete |
| SCHEMA-01 | Phase 19 | Complete |

**Coverage:**
- v1 requirements: 2 total
- Mapped to phases: 2
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-08*
*Last updated: 2026-07-08 after roadmap creation (Phase 18/19 mapped)*

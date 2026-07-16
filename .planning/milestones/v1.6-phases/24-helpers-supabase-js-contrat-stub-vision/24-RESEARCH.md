# Phase 24: Helpers supabase.js + Contrat Stub Vision - Research

**Researched:** 2026-07-14
**Domain:** Node.js backend — service layer contract design + thin DB CRUD helpers (no external API, no HTTP endpoints)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Forme exacte du contrat stub (D-01):** `% usure` = entier 0-100 (ex: `42`). `état` = enum 4 valeurs : `bon` / `moyen` / `usé` / `critique` — aligné avec le système couleur VERT/BLEU/JAUNE/ROUGE déjà existant dans le score anti-fraude. `confiance` = entier 0-100 (même échelle que `% usure`, pas un décimal 0-1).

**Dérivation état ← % usure (D-02):** `état` est dérivé directement du `% usure` calculé via des seuils (pas une valeur indépendante ni un tirage séparé). Seuils numériques exacts laissés à la planification.

**Dérivation analyse_status ← confiance (D-03):** `confiance` basse (sous un seuil, exact laissé à la planification) fait basculer automatiquement `analyse_status` sur `incertain`. Sinon `ok`.

**Réalisme et déterminisme du stub (D-04):** Le stub est pseudo-aléatoire, pas une valeur fixe canned. La variation du `% usure` est liée approximativement au km parcouru depuis `km_montage` du consommable vs le km actuel de la moto. Le stub est déterministe par photo/consommable : un seed dérivé de l'URL de la photo ou de l'ID du consommable garantit qu'un même input redonne toujours le même résultat.

**Simulation d'échec/incertitude (D-05):** `analyse_status='echec'` n'est JAMAIS renvoyé par le stub — réservé exclusivement au vrai moteur Vision. `incertain` reste possible via D-03.

**Fallback config incohérente (D-06):** Si `VISION_ENABLED=true` mais la clé Anthropic API n'est pas configurée, `analyzePhoto()` fait un fallback silencieux vers le stub avec un warning loggé — même convention exacte que `EMAIL_ENABLED`/`PUSH_ENABLED` (`services/emailService.js:22`, `services/pushService.js:20`). Jamais de crash serveur sur une config incohérente.

### Claude's Discretion

- Méthodes CRUD exactes pour `Consommables` (create vs upsert, vu la contrainte `UNIQUE(moto_id, type_consommable)`) et `PhotosConsommables` (insert + list, relation à `consommable_id`).
- Seuils numériques exacts de dérivation `% usure → état` (D-02) et du seuil de `confiance` qui déclenche `incertain` (D-03).
- Mécanisme exact du seed déterministe (D-04) — hash de l'URL photo, de l'ID consommable, ou combinaison.
- Si un helper de lecture (list/history) pour `RelevesKm` est nécessaire dans cette phase, au-delà de `RelevesKm.enregistrer()` qui existe déjà.
- Nom exact des méthodes, structure interne du calcul stub, organisation du code dans `visionAnalysisService.js`.

### Deferred Ideas (OUT OF SCOPE)

- **Vraie clé Anthropic Vision / appel API réel** — différé, hors scope de ce milestone entier. Cette phase verrouille le CONTRAT, pas l'implémentation réelle.
- **Seuils production réels de dérivation** — pourraient être révisés une fois la vraie IA branchée ; seule la FORME du contrat doit rester stable entre stub et réel.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VISION-01 | Une photo de consommable uploadée déclenche une analyse via un service dédié flag-gated (`VISION_ENABLED`), qui renvoie une fausse analyse structurée tant que la clé Anthropic n'est pas configurée | `visionAnalysisService.js` design (Architecture Patterns), exact `EMAIL_ENABLED`/`PUSH_ENABLED` pattern replication (Code Examples), Environment Availability |
| VISION-02 | La réponse d'analyse (stub ou réelle plus tard) suit un contrat fixe (% usure, état, confiance, statut d'analyse, moteur) consommé identiquement par les jauges | Contract shape (Standard Stack / Architecture), deterministic stub algorithm, threshold tables |
</phase_requirements>

## Summary

This phase has no external library dependencies — it is pure Node.js service/data-layer design work inside an existing, well-established codebase convention. The two things to get right are (1) faithfully replicating the `EMAIL_ENABLED`/`PUSH_ENABLED` flag-gate + silent-fallback pattern for `VISION_ENABLED`, and (2) designing a deterministic, seeded pseudo-random stub generator whose output is stable per input and roughly tracks real wear data (km since `km_montage`).

Both existing flag-gated services (`emailService.js`, `pushService.js`) share an identical shape: read `process.env.X_ENABLED === 'true'` at module load, try to initialize the real client, warn-and-fallback (never throw) if the flag is on but the credential is missing, and branch inside each exported function between "real" and "dev console" behavior. `visionAnalysisService.js` should follow this exact shape, with the twist that per D-06 the fallback happens **inside `analyzePhoto()`** at call time (there's no "client" to fail to initialize yet since no Anthropic SDK call exists this phase — the flag check simplifies to: real branch never actually reachable this phase, so `analyzePhoto()` always executes the stub path, but the code must be structured so a future real branch slots in without changing the contract or call sites).

For the CRUD helpers, `CataloguePieces` (`supabase.js:1250`) is the direct style reference: a plain object literal with async methods, using the module's shared `insert`/`query`/`update` helpers or raw `supabase.from(...)` calls, manual validation before insert, `throw new Error(...)` on Supabase errors. `RelevesKm` (`supabase.js:385`) already exists from Phase 23 with only `enregistrer()` — this phase's job for `RelevesKm` is to confirm whether a read helper is actually needed now or genuinely deferred (see Open Questions — evidence points to **defer**, no consumer exists yet).

**Primary recommendation:** Build `visionAnalysisService.js` as a pure, dependency-free (from Supabase) function module exporting `analyzePhoto({ photoUrl, consommableId, kmActuel, kmMontage, typeConsommable })`, using Node's built-in `crypto` module (already a project convention, used in `scripts/test-releves-km-trigger.js`) for the deterministic seed — no new npm dependency required this phase.

## Standard Stack

### Core

No new libraries needed. Everything required is either already a dependency or a Node.js built-in.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `crypto` (Node built-in) | Node ≥20 (per `package.json engines`) | Deterministic seed hash for pseudo-random stub (D-04) | Already used elsewhere in this codebase (`scripts/test-releves-km-trigger.js:61`) for the same "reproducible from a string" purpose; no external dependency needed for a seeded PRNG when a hash-derived integer is sufficient |
| `@supabase/supabase-js` | `^2.45.0` (existing, `package.json`) | DB access for `Consommables`/`PhotosConsommables` CRUD helpers | Already the project's sole DB client, used identically by every existing helper object in `supabase.js` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| — | — | — | No supporting libraries needed — this is pure JS logic + existing Supabase client calls |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `crypto.createHash('md5'/'sha256')` for seed | npm `seedrandom` or similar seeded-PRNG package | Adds a dependency for a one-line hash-to-int need; this codebase has a clear "no unnecessary dependency" pattern (e.g., hand-rolled EAN validation instead of a barcode-math package elsewhere). Not worth it — a hash digest sliced to an integer and used with `% range` arithmetic is sufficient and matches project style. |
| Real Anthropic SDK call now | Full `@anthropic-ai/sdk` integration | Explicitly out of scope this phase (D-06, PROJECT.md v1.6 decision) — the contract must be stubbed, not implemented against a real key |

**Installation:**
No new packages to install. `npm install` not required for this phase's dependencies.

**Version verification:** Not applicable — no new package versions to verify. Existing `@supabase/supabase-js@^2.45.0` and Node's built-in `crypto` require no registry check.

## Architecture Patterns

### Recommended Project Structure

No new folders. Two files touched:

```
services/
├── emailService.js        # existing — pattern reference
├── pushService.js         # existing — pattern reference
└── visionAnalysisService.js   # NEW — this phase

supabase.js                 # existing — add Consommables, PhotosConsommables objects;
                             # confirm/extend RelevesKm; add to module.exports
```

### Pattern 1: Flag-gated service with silent fallback (VISION_ENABLED)

**What:** Module reads `process.env.VISION_ENABLED === 'true'` once at load. If a real client/SDK is unavailable or misconfigured, warn via `console.warn` and continue in stub/dev mode — never throw at module load or at call time on a config problem.

**When to use:** Exactly this phase's `analyzePhoto()` — no real Anthropic call exists yet, so the "real" branch is a placeholder that funnels to stub every time, but the branching structure must already exist so Phase 25+/a future milestone can add the real call without changing the function signature or the contract shape.

**Example (mirrors `services/emailService.js:14-32` and `services/pushService.js:14-27`):**
```javascript
// Source: services/emailService.js:14-32 (pattern to replicate identically per D-06)
'use strict';

const VISION_ENABLED = process.env.VISION_ENABLED === 'true';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;

let visionReady = false;
if (VISION_ENABLED) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('⚠️  [24] VISION_ENABLED=true mais ANTHROPIC_API_KEY manquant — fallback stub');
  } else {
    // Phase 24 : aucun appel réel encore — la clé est présente mais le moteur
    // réel n'est pas branché ce milestone (hors scope, cf CONTEXT.md D-06 + PROJECT.md).
    visionReady = true; // réservé pour un futur milestone
    console.log('✅ [24] Config Vision détectée (moteur réel non branché ce milestone)');
  }
} else {
  console.log('🔎 [24] Vision en mode stub (VISION_ENABLED=false) — analyse simulée uniquement');
}

async function analyzePhoto({ photoUrl, consommableId, typeConsommable, kmActuel, kmMontage }) {
  // Phase 24 : le moteur réel n'existe pas encore dans ce milestone (branchement futur).
  // La condition ci-dessous reflète la structure finale : VISION_ENABLED + clé présente
  // routerait vers le vrai moteur ; ce chemin n'est pas implémenté ici (contrat stub only).
  if (VISION_ENABLED && visionReady) {
    // Emplacement du futur appel réel (non implémenté ce milestone).
  }
  return buildStubAnalysis({ photoUrl, consommableId, typeConsommable, kmActuel, kmMontage });
}

module.exports = { analyzePhoto };
```

### Pattern 2: Deterministic pseudo-random stub (D-04)

**What:** Derive a stable seed from photo URL (or consommable ID as fallback), hash it to an integer, use that integer to produce a repeatable pseudo-random offset, then bias the result using `kmActuel - kmMontage` so it's not fully disconnected from real data.

**When to use:** Inside `buildStubAnalysis()`, the core of `visionAnalysisService.js`.

**Concrete algorithm proposal:**
```javascript
// Source: pattern derived from scripts/test-releves-km-trigger.js:61 (crypto already
// used in this codebase for deterministic/reproducible behavior)
const crypto = require('crypto');

function seedFromInput(photoUrl, consommableId) {
  // D-04 : seed dérivé de l'URL photo (priorité) ou de l'ID consommable (fallback)
  const raw = photoUrl || consommableId || 'no-input';
  const hash = crypto.createHash('sha256').update(String(raw)).digest();
  // Slice 4 bytes → entier 32-bit non signé, stable pour un même input
  return hash.readUInt32BE(0);
}

// PRNG déterministe simple (mulberry32) — pas de dépendance externe, seedable
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStubAnalysis({ photoUrl, consommableId, typeConsommable, kmActuel, kmMontage }) {
  const seed = seedFromInput(photoUrl, consommableId);
  const rand = mulberry32(seed);

  // Base wear derived from km parcouru depuis le montage (D-04 : "lié approximativement
  // au km parcouru"). kmParcouru peut être 0/négatif/absent (données incomplètes) — clampé.
  const kmParcouru = Math.max(0, (Number(kmActuel) || 0) - (Number(kmMontage) || 0));
  // Hypothèse de durée de vie moyenne par type — grossière, juste pour ancrer le stub
  // dans une plage réaliste (pas une vraie table de durée de vie produit).
  const dureeVieKm = 15000; // valeur unique simple pour tous types ce milestone (discrétion)
  const usureBase = Math.min(95, Math.round((kmParcouru / dureeVieKm) * 100));

  // Bruit pseudo-aléatoire déterministe : +/- 15 points autour de la base
  const bruit = Math.round((rand() - 0.5) * 30);
  const pctUsure = Math.max(0, Math.min(100, usureBase + bruit));

  const etat = deriveEtat(pctUsure);
  const confiance = Math.max(30, Math.min(99, Math.round(60 + rand() * 40))); // 60-99 typiquement
  const analyseStatus = deriveAnalyseStatus(confiance);

  return {
    pct_usure: pctUsure,
    etat,
    confiance,
    analyse_status: analyseStatus,
    engine: 'stub'
  };
}
```

**Note on field naming:** CONTEXT.md D-01 uses `% usure`, `état`, `confiance`, `analyse_status`, `engine` as prose labels. The DB column is already named `analyse_status` (`photos_consommables.analyse_status`, migration 23). For consistency with that existing column and with project convention (snake_case JS object keys mirroring DB columns, e.g., `km_montage`, `type_consommable` throughout `supabase.js`), recommend the contract object use snake_case keys: `pct_usure`, `etat`, `confiance`, `analyse_status`, `engine` — not camelCase. This should be an explicit planning decision since CONTEXT.md doesn't lock exact key casing, only field semantics.

### Pattern 3: Threshold derivation (D-02, D-03)

**What:** Pure functions mapping the two continuous scores to their derived enums.

**Recommended thresholds (Claude's Discretion per CONTEXT.md, proposed with rationale):**

`% usure → état` (aligned conceptually with VERT/BLEU/JAUNE/ROUGE 4-tier system already in the codebase, e.g. score anti-fraude bands):
| % usure | état |
|---------|------|
| 0-29 | `bon` |
| 30-59 | `moyen` |
| 60-84 | `usé` |
| 85-100 | `critique` |

Rationale: mirrors the existing anti-fraude score bands' spirit (4 tiers, roughly matched cutoffs to the existing 40/60/80 score thresholds documented in `CLAUDE.md`, but inverted — here higher % = worse, whereas anti-fraude score higher = better). Using inverse-aligned cutoffs (30/60/85) keeps `critical` genuinely rare/urgent rather than triggering at the halfway point, which better matches real consumable wear curves (wear accelerates near end-of-life).

`confiance → analyse_status`:
| confiance | analyse_status |
|-----------|-----------------|
| < 50 | `incertain` |
| ≥ 50 | `ok` |

Rationale: 50 is the natural midpoint of the 0-100 scale and simplest to justify; given the stub's confiance range in Pattern 2 (60-99), `incertain` will be rare in stub mode by design (matches D-05's spirit — stub shouldn't manufacture uncertainty aggressively, only via genuinely low rolls, which given the 60-99 range in the example algorithm above would essentially never trigger). **Planner should decide:** either widen the stub's confiance roll range downward (e.g., 40-99) so `incertain` is occasionally exercised in dev/demo (useful for testing the jauge UI states in Phase 27), or accept it's rare — CONTEXT.md doesn't mandate frequency, only that the derivation logic exist and be correct.

```javascript
function deriveEtat(pctUsure) {
  if (pctUsure >= 85) return 'critique';
  if (pctUsure >= 60) return 'usé';
  if (pctUsure >= 30) return 'moyen';
  return 'bon';
}

function deriveAnalyseStatus(confiance) {
  return confiance < 50 ? 'incertain' : 'ok';
}
```

### Pattern 4: CRUD helper style (CataloguePieces reference)

**What:** Plain object literal, async methods, manual required-field validation before insert, `throw new Error(...)` wrapping Supabase errors with a `[context]` prefix, added to the final `module.exports` block.

**Example (adapted from `supabase.js:1250-1309`):**
```javascript
// Source: supabase.js:1250 (CataloguePieces) — style reference
const Consommables = {
  async upsert(moto_id, { type_consommable, km_montage, date_montage, reference }) {
    if (!moto_id) throw new Error('[Consommables.upsert] moto_id requis');
    if (!type_consommable) throw new Error('[Consommables.upsert] type_consommable requis');
    const payload = {
      moto_id, type_consommable,
      km_montage: km_montage != null ? parseInt(km_montage) : null,
      date_montage: date_montage || null,
      reference: reference || null,
      updated_at: new Date().toISOString()
    };
    // UNIQUE(moto_id, type_consommable) — upsert évite un 23505 sur re-saisie du même type
    const { data, error } = await supabase
      .from('consommables')
      .upsert(payload, { onConflict: 'moto_id,type_consommable' })
      .select().single();
    if (error) throw new Error(`[Consommables.upsert] ${error.message}`);
    return data;
  },

  async listByMoto(moto_id) {
    const { data, error } = await supabase
      .from('consommables').select('*').eq('moto_id', moto_id)
      .order('type_consommable');
    if (error) throw new Error(`[Consommables.listByMoto] ${error.message}`);
    return data || [];
  }
};

const PhotosConsommables = {
  async insert({ moto_id, consommable_id, type_consommable, photo_url, analyse_ia, analyse_status }) {
    if (!moto_id) throw new Error('[PhotosConsommables.insert] moto_id requis');
    if (!photo_url) throw new Error('[PhotosConsommables.insert] photo_url requis');
    const payload = {
      moto_id, consommable_id: consommable_id || null,
      type_consommable: type_consommable || null,
      photo_url, analyse_ia: analyse_ia || null,
      analyse_status: analyse_status || null
    };
    const { data, error } = await supabase.from('photos_consommables').insert(payload).select().single();
    if (error) throw new Error(`[PhotosConsommables.insert] ${error.message}`);
    return data;
  },

  async listByConsommable(consommable_id) {
    const { data, error } = await supabase
      .from('photos_consommables').select('*').eq('consommable_id', consommable_id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`[PhotosConsommables.listByConsommable] ${error.message}`);
    return data || [];
  }
};
```

### Anti-Patterns to Avoid

- **`Consommables.create()` that throws on re-insert:** The `UNIQUE(moto_id, type_consommable)` constraint (migration 23) means a plain `insert()` on an already-recorded type will throw a `23505` unique-violation. Given the phase's CRUD helpers have no HTTP consumer yet, and CONSO-01 (Phase 25) will need "mécano saisit/corrige km_montage/date_montage/référence" — an `upsert` (or a `create`+`update` pair) is required, not a naive insert-only helper. CONTEXT.md explicitly flags this as needing a decision; **recommend `upsert()` as the primary write method** since it collapses create+correct into one call and matches the single-row-per-type semantic of the table.
- **`visionAnalysisService.js` importing `supabase.js`:** CONTEXT.md's Integration Points section explicitly states this service "n'a d'ailleurs pas besoin d'accéder à la DB du tout — il calcule/renvoie une structure, la persistance passe par les helpers `PhotosConsommables`." Keep `visionAnalysisService.js` a pure function module with zero `require('./supabase')` — this also makes success criterion #3 (isolated testability with a fake URL, no DB) trivially satisfiable.
- **Hardcoding `analyse_status: 'echec'` anywhere in the stub path:** D-05 is explicit — the stub must never produce `echec`. Do not add a "simulate occasional failure" branch even for "realism"; it has no legitimate basis without ever looking at the image.
- **Direct `supabase.from('consommables')` / `.from('photos_consommables')` calls from `motokey-api.js` or `visionAnalysisService.js`:** Violates the project's sole-DB-access-boundary rule (CLAUDE.md, CONTEXT.md Integration Points). All access must go through the new `supabase.js` helpers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Seeded pseudo-random number generation | A custom LCG from scratch with unclear bias, or an npm seeded-random package | The `mulberry32` algorithm (public domain, ~6 lines, seeded by a `crypto.createHash` digest) | Well-known, well-distributed, deterministic, zero dependencies, matches the project's existing `crypto` usage convention. Writing a naive `seed = seed * a + b) % m` LCG risks poor distribution/low-order bit correlation; `mulberry32` is a standard, trusted small PRNG for exactly this kind of stub-realism use case. |
| Real Vision analysis heuristics (image inspection) | Any attempt to actually download/inspect the photo pixel data to "fake it more convincingly" | Pure metadata-derived stub (km delta + seeded noise) | Explicitly out of scope this phase (D-05, PROJECT.md) — the stub never looks at the photo; building any pixel-touching logic would be wasted effort immediately superseded when the real Anthropic Vision call is eventually wired in, and blurs the "stub vs real" boundary the contract is designed to keep clean. |
| Upsert semantics for `consommables` | Manual `SELECT` then conditional `INSERT`/`UPDATE` in JS (race-condition prone, extra round trip) | Supabase's native `.upsert(payload, { onConflict: 'moto_id,type_consommable' })` | Postgres-native `ON CONFLICT DO UPDATE` under the hood — atomic, single round trip, already supported by `@supabase/supabase-js` client used throughout this codebase. |

**Key insight:** Everything this phase touches — flag-gating, deterministic stubs, thin CRUD — has an established sibling pattern already living in this exact codebase (`emailService.js`, `pushService.js`, `CataloguePieces`, `crypto` usage in test scripts). The research finding of highest value is: **do not deviate stylistically from these siblings**; the planner's job is replication + contract design, not invention of new patterns.

## Common Pitfalls

### Pitfall 1: Naive insert on `consommables` breaks on second save
**What goes wrong:** A mécano corrects `km_montage` after initial entry (typo fix, or filling in a previously-skipped field) → `Consommables.create()` implemented as a plain `.insert()` throws Postgres `23505` (unique_violation) because of `UNIQUE(moto_id, type_consommable)`.
**Why it happens:** The table models "current state of this consumable on this moto" (one row per type), not a history log — easy to design the helper as if it were an append-only insert like `RelevesKm`.
**How to avoid:** Use `.upsert(payload, { onConflict: 'moto_id,type_consommable' })` as the primary write path, named e.g. `Consommables.upsert()`.
**Warning signs:** Phase 25 (CONSO-01 endpoint) failing on any edit-after-create flow with a `23505` error.

### Pitfall 2: `visionAnalysisService.js` accidentally becomes DB-coupled
**What goes wrong:** Someone adds `require('./supabase')` inside `visionAnalysisService.js` "to look up the consommable's km_montage automatically" instead of receiving it as a parameter — breaking success criterion #3 (isolated call with a fake URL, no DB dependency) and the explicit CONTEXT.md Integration Points guidance.
**Why it happens:** Convenient to reach for the DB from inside the service rather than threading params from the caller.
**How to avoid:** `analyzePhoto()` must take all needed data (photo URL, consommable ID, km actuel, km montage, type) as explicit parameters — the eventual HTTP endpoint (Phase 25) is responsible for fetching those from `supabase.js` and passing them in.
**Warning signs:** A `require` of `./supabase` or `./supabase.js` inside the vision service file — grep for it in verification.

### Pitfall 3: Contract field casing/naming drift between stub and future real engine
**What goes wrong:** The stub uses one casing/naming convention (e.g., `pctUsure` camelCase) while a later phase's jauge-consuming code expects DB-column-matching snake_case (`pct_usure`), or vice-versa — silent `undefined` reads in Phase 27's gauge rendering.
**Why it happens:** JS conventionally uses camelCase for object keys, but this codebase's Supabase-facing objects consistently use snake_case matching DB columns (`km_montage`, `type_consommable`, `garage_id`) — an easy convention to forget mid-service.
**How to avoid:** Lock the exact key names as part of this phase's PLAN (not left implicit) — recommend snake_case (`pct_usure`, `etat`, `confiance`, `analyse_status`, `engine`) to match `photos_consommables.analyse_status`'s existing snake_case column and the rest of `supabase.js`'s payload conventions. Document the exact shape in a code comment at the top of `visionAnalysisService.js` as the canonical contract reference for Phase 25/27/28.
**Warning signs:** Any place downstream doing `.pctUsure` or `.etat` inconsistently with what `analyzePhoto()` actually returns.

### Pitfall 4: Stub confiance range never produces `incertain`
**What goes wrong:** If the stub's `confiance` roll range is tuned to always land above the D-03 threshold (e.g., 60-99 vs a 50 threshold), the `incertain` UI state (Phase 27 gauges) never gets exercised in dev/demo, defeating part of the "stub should feel alive and let all gauge states be dev-testable" spirit implied by D-04.
**Why it happens:** Picking a "safe" confiance range (60-99) that looks realistic in isolation without checking it against the D-03 threshold.
**How to avoid:** Either widen the confiance roll range to occasionally dip under the threshold (e.g., 35-99), or explicitly document in the plan that `incertain` is intentionally rare in stub mode and will be spot-tested via a fixed low-confiance test case in the verification script rather than relying on natural roll frequency.
**Warning signs:** Running the stub against a batch of test seeds and observing 0% `incertain` outcomes.

### Pitfall 5: `photos_consommables.type_consommable` denormalization drift
**What goes wrong:** `photos_consommables` has its own `type_consommable TEXT` column (nullable, no FK/CHECK to the 9-type enum) *in addition to* `consommable_id` FK to `consommables`. If `PhotosConsommables.insert()` only writes one of the two, later joins/queries relying on the denormalized column could silently diverge from the parent `consommables.type_consommable`.
**Why it happens:** The schema (migration 23) deliberately denormalizes `type_consommable` onto the photo row (likely to support photos not yet linked to a formal `consommables` row, or future flexibility) — easy to treat as redundant and skip.
**How to avoid:** `PhotosConsommables.insert()` should accept and store `type_consommable` explicitly (not derive it via a join), and the caller (Phase 25 endpoint) is responsible for passing a value consistent with the linked `consommable_id` when one exists.
**Warning signs:** Rows where `consommable_id` is set but `type_consommable` is `NULL` or mismatched with the parent row's type.

## Code Examples

See Architecture Patterns section above for full verified-pattern code (flag-gate replication, deterministic stub, threshold derivation, CRUD helpers) — all sourced directly from this codebase's existing files (`services/emailService.js`, `services/pushService.js`, `supabase.js:1250` `CataloguePieces`, `supabase.js:385` `RelevesKm`, `scripts/test-releves-km-trigger.js:61` for `crypto` usage convention).

## State of the Art

Not applicable in the traditional "ecosystem evolved" sense — this phase has no external library/API surface to track. The only "old vs new" axis is internal: this phase establishes the contract that a *future* milestone's real Anthropic Vision integration must match exactly, so there is no current/deprecated split to document — everything here IS the current/only state.

## Open Questions

1. **Is a `RelevesKm` read/list helper actually needed in this phase?**
   - What we know: `RelevesKm.enregistrer()` (write) exists from Phase 23 and is fully tested (28/28 PASS). No code anywhere in the repo currently calls or needs a read/list method on `RelevesKm` — grep of `supabase.js`/`motokey-api.js` shows zero read usage of `releves_km` outside the trigger-driven `motos.km` sync (which is DB-side, not JS-side).
   - What's unclear: Whether Phase 25/27's future needs (e.g., showing km history) will need it, and whether "confirm the existing helper suffices" alone satisfies success criterion #4's "RelevesKm existent comme helpers CRUD minces" wording.
   - Recommendation: **Defer.** Success criterion #4 is satisfied by `RelevesKm.enregistrer()` already existing — CONTEXT.md itself suggests this reading ("pourrait simplement confirmer l'existant"). Do not add a speculative `list()`/`history()` method with no current consumer (YAGNI, consistent with this codebase's "thin helper, add when needed" pattern seen elsewhere). If Phase 25 or 27 research surfaces a concrete need, it can be added there as a one-line addition — trivial cost to defer, non-trivial cost (an untested, unused method) to add now.

2. **Exact snake_case vs alternate key names for the stub contract object.**
   - What we know: CONTEXT.md locks the *semantic* fields (`% usure`, `état`, `confiance`, `analyse_status`, `engine`) but not their exact JS object key spelling. `photos_consommables.analyse_status` (DB column) is already snake_case.
   - What's unclear: Whether the planner should also lock `etat` (no accent, since `état` has a non-ASCII character unsuitable as a raw JS identifier/property name convention in this codebase — though quoted string keys could technically preserve the accent) vs `etat`.
   - Recommendation: Use ASCII snake_case (`pct_usure`, `etat`, `confiance`, `analyse_status`, `engine`) — consistent with every other ASCII-only column/key in `supabase.js` (`km_montage`, `type_consommable`, etc.), avoids accent-related edge cases in JSON serialization/JS property access (`obj.état` requires bracket notation `obj['état']`, awkward and inconsistent with the rest of the codebase's dot-notation style).

3. **`engine` field exact stub value.**
   - What we know: Success criteria literally specifies `engine` (stub/anthropic-vision-v1) — two concrete string values.
   - What's unclear: Nothing substantive — this is effectively locked by the success criteria text itself, just noting it here so the planner treats `'stub'` as a literal exact string, not a placeholder to bikeshed.
   - Recommendation: Use exactly `'stub'` for this phase's return value; reserve `'anthropic-vision-v1'` as the literal string for the future real-engine branch (already named in the phase's own success criteria — should not be re-invented later).

## Environment Availability

This phase has no external service/tool dependency — no Anthropic API key configuration, no new package installs, no database migration (Phase 23's schema is already live in prod). Skipping formal Environment Availability audit per the "skip if no external dependencies" condition — the only relevant fact is captured below for completeness.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `ANTHROPIC_API_KEY` (Railway env var) | Future real Vision engine (NOT this phase) | ✗ (confirmed absent, per PROJECT.md/CONTEXT.md — explicitly deferred) | — | Stub path always used this phase (D-06) — no blocking impact |
| `@supabase/supabase-js` | `Consommables`/`PhotosConsommables` CRUD helpers | ✓ (already installed, `package.json`) | `^2.45.0` | — |
| Node `crypto` (built-in) | Deterministic stub seed | ✓ (Node ≥20 per `package.json engines`) | built-in | — |

**Missing dependencies with no fallback:** None — `ANTHROPIC_API_KEY` absence is the expected, in-scope state for this entire milestone (D-06 handles it by design, not as a blocker).

**Missing dependencies with fallback:** `ANTHROPIC_API_KEY` → stub fallback (this IS the phase's deliverable, not a gap).

## Validation Architecture

`workflow.nyquist_validation` is not set in `.planning/config.json` (absent → treat as enabled per instructions). This section follows the same structure as `23-VALIDATION.md`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — confirmed project-wide convention (`package.json` `"test": "node test-api.js"`, hand-rolled). Phase 23 established the precedent (`23-VALIDATION.md`) of a standalone Node script, no Jest/Mocha introduced. |
| Config file | none — see Wave 0 |
| Quick run command | `node --check services/visionAnalysisService.js && node --check supabase.js` (syntax gate, near-instant) |
| Full suite command | `node scripts/test-vision-stub.js` (new, Wave 0) — standalone script requiring `visionAnalysisService.js` and `supabase.js` directly, no HTTP, no live DB required for the vision-contract assertions (DB only needed for the CRUD-helper assertions, which can run against the existing `FRESH_DB_URL` throwaway Supabase project from Phase 23, already provisioned and in `.env`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VISION-01 | `analyzePhoto()` exists, is flag-gated, returns a structured fake analysis when `VISION_ENABLED` unset/false | unit (direct require, no HTTP) | `node scripts/test-vision-stub.js --case=flag-gated-stub` | ❌ Wave 0 |
| VISION-01 | `VISION_ENABLED=true` without `ANTHROPIC_API_KEY` falls back silently to stub + logs a warning (D-06) | unit (direct require, assert on `console.warn` spy or captured stdout) | `node scripts/test-vision-stub.js --case=inconsistent-config-fallback` | ❌ Wave 0 |
| VISION-02 | Contract shape is fixed: `pct_usure` (0-100 int), `etat` (4-enum), `confiance` (0-100 int), `analyse_status` (ok/incertain — never echec from stub), `engine='stub'` | unit (schema/shape assertion) | `node scripts/test-vision-stub.js --case=contract-shape` | ❌ Wave 0 |
| VISION-02 | Same input (photoUrl or consommableId) → same output across repeated calls (determinism, D-04) | unit | `node scripts/test-vision-stub.js --case=deterministic-seed` | ❌ Wave 0 |
| VISION-02 | `état` correctly derived from `% usure` per fixed thresholds (D-02); `analyse_status` correctly derived from `confiance` per fixed threshold (D-03) | unit (table-driven, several fixed pct_usure/confiance inputs → assert derived enum) | `node scripts/test-vision-stub.js --case=derivation-thresholds` | ❌ Wave 0 |
| VISION-01/02 | Direct call with a fake URL, verifiable independent of any HTTP endpoint (success criterion #3) | unit (no server started, no `motokey-api.js` involvement) | `node scripts/test-vision-stub.js --case=isolated-call` | ❌ Wave 0 |
| (supporting, success criterion #4) | `Consommables.upsert()`/`listByMoto()`, `PhotosConsommables.insert()`/`listByConsommable()` work against a live throwaway DB | integration (`pg`/Supabase-client against `FRESH_DB_URL` project, same precedent as Phase 23) | `node scripts/test-vision-stub.js --case=crud-helpers` (or a separate `scripts/test-consommables-crud.js` — planner's naming choice) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --check <changed file>` + the specific `--case=` slice relevant to what was just written.
- **Per wave merge:** Full `node scripts/test-vision-stub.js` (all cases).
- **Phase gate:** Full suite green before `/gsd:verify-work` — no live HTTP server needed (unlike Phase 25+), so this gate is cheap/fast (~5-10s, no bootstrap/migration step needed since Phase 23's schema is already live).

### Wave 0 Gaps
- [ ] `scripts/test-vision-stub.js` — new, mirrors `scripts/test-releves-km-trigger.js`'s PASS/FAIL/`assert()`/`--case=` harness style, but simpler: most cases need zero DB connection (pure function testing of `visionAnalysisService.js`); only the CRUD-helper cases need `FRESH_DB_URL` (already available in `.env` since Phase 23 — no new human checkpoint required).
- [ ] No framework install needed — hand-rolled Node script convention already established.

*(If reusing Phase 23's `FRESH_DB_URL` project for the CRUD-helper test cases: confirm the throwaway project still has the Phase 23 migration schema live — it should, since nothing tears it down between phases, but worth a one-line sanity check, e.g. `SELECT to_regclass('public.consommables')`, at the top of the new script before running CRUD assertions.)*

## Sources

### Primary (HIGH confidence)
- `services/emailService.js` (read in full) — `EMAIL_ENABLED` flag-gate + fallback pattern, exact lines cited (14-32, 62-77)
- `services/pushService.js` (read in full) — `PUSH_ENABLED` flag-gate + fallback pattern, exact lines cited (14-27, 55-82)
- `supabase.js:385-417` (`RelevesKm`) — existing Phase 23 helper, confirms no read method exists yet
- `supabase.js:1250-1309` (`CataloguePieces`) — CRUD style reference
- `supabase.js:1-95` — module structure, `insert`/`query`/`update`/`remove` shared helpers, exports pattern (`:1563-1589`)
- `sql/migrations/23_consommables_km.sql` (read in full) — exact schema for `consommables`, `photos_consommables`, `releves_km`, `releves_km_rejets`, including the `UNIQUE(moto_id, type_consommable)` constraint and the denormalized `photos_consommables.type_consommable` column
- `schema.sql` grep confirmation — same-commit parity with migration 23 confirmed (consistent CREATE TABLE blocks)
- `scripts/test-releves-km-trigger.js` (partial read) — confirms `crypto` module already used in this codebase for deterministic/reproducible test behavior, and establishes the PASS/FAIL/`--case=` harness convention to replicate
- `.planning/phases/23-sch-ma-anti-fraude-km-au-niveau-db/23-VALIDATION.md` (read in full) — Validation Architecture template/precedent for this codebase (no test framework, hand-rolled `pg`/Node scripts)
- `package.json` (read in full) — confirms no test framework dependency, Node ≥20 engine (crypto/native features available), existing dependency versions
- `.planning/phases/24-helpers-supabase-js-contrat-stub-vision/24-CONTEXT.md` — all D-01 through D-06 locked decisions, Claude's Discretion items
- `.planning/REQUIREMENTS.md` — VISION-01, VISION-02 exact text
- `.planning/STATE.md` — v1.6 milestone decisions confirming stub-only scope, Phase 23 completion status
- `CLAUDE.md` (project root) — confirms `supabase.js`/`motokey-api.js` critical-file editing constraints, sole-DB-access-boundary rule, anti-fraude weighting (1.0/0.6/0.3) must not be touched (relevant negative constraint: this phase must NOT map stub `% usure` into that formula)

### Secondary (MEDIUM confidence)
- Mulberry32 PRNG algorithm — well-known public-domain algorithm (not verified against an official spec doc in this research pass, but it's a widely-cited standard small seeded PRNG; recommend the planner/implementer treat the exact algorithm choice as an implementation detail, not a locked research fact — any deterministic seeded PRNG satisfies D-04's requirement equally well)

### Tertiary (LOW confidence)
- None — no WebSearch/Context7 lookups were needed for this phase; the entire research surface is internal codebase investigation, which is directly verifiable (HIGH confidence by construction).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, entirely built from existing project conventions read directly from source
- Architecture: HIGH — patterns extracted directly from existing sibling code (`emailService.js`, `pushService.js`, `CataloguePieces`), not inferred or guessed
- Pitfalls: HIGH — derived from direct schema inspection (`UNIQUE` constraint, denormalized column) and explicit CONTEXT.md decision text (D-05, D-06), not speculative
- Threshold values (D-02/D-03) and PRNG algorithm choice: MEDIUM — reasonable, justified proposals per CONTEXT.md's explicit delegation to "Claude's Discretion," but these are design choices, not verifiable facts; planner/Mehdi could reasonably choose different numbers without contradicting any decision

**Research date:** 2026-07-14
**Valid until:** No external-ecosystem expiry risk (no library versions to go stale) — valid until Phase 24 requirements/CONTEXT.md themselves change, or until PROJECT.md's "stub only this milestone" decision is revisited.

# Apple App Privacy — App Store Connect Content (ready to paste)

> **Scope note:** This document is the App Store Connect "App Privacy" nutrition-label
> questionnaire content — the human-facing disclosure Apple shows on the App Store product
> page. It is **distinct** from the technical `PrivacyInfo.xcprivacy` manifest declared via
> `mobile-app/app.json`'s `ios.privacyManifests` field (that one governs required-reason API
> usage inside the compiled binary, verified against the real generated manifest from an
> EAS build/prebuild in Plan 04). This document is submittable only once an Apple Developer
> Program membership exists (D-01/D-02 of `17-CONTEXT.md` — parked as a known gap alongside
> Phase 8/BILL-06, not a phase failure).
>
> Data inventory below is the real, verified data the MotoKey mobile app collects (per
> `17-RESEARCH.md`'s Summary) — no invented categories.

## Data Types Collected

### Contact Info

| Data Type | Collected? | Used to Track You? | Linked to You? | Purpose |
|---|---|---|---|---|
| Email Address | Yes | No | Yes | App Functionality (account authentication) |
| Name | Yes | No | Yes | App Functionality (contact info entered when adding/claiming a moto, `add.tsx`) |
| Phone Number | Yes | No | Yes | App Functionality (contact info entered when adding/claiming a moto, `add.tsx`) |

### Identifiers

| Data Type | Collected? | Used to Track You? | Linked to You? | Purpose |
|---|---|---|---|---|
| Device ID (Expo push token) | Yes | No | Yes | App Functionality (push notification delivery — maintenance alerts, devis received) |

### User Content

| Data Type | Collected? | Used to Track You? | Linked to You? | Purpose |
|---|---|---|---|---|
| Other User Content (VIN, plaque d'immatriculation, kilométrage, année, marque, modèle) | Yes | No | Yes | App Functionality (moto digital passport — the app's core purpose) |

## Explicitly NOT Collected

- **Photos or Camera** — no camera/`ImagePicker` usage anywhere in `mobile-app/` (photo capture for interventions stays garage-side in `app.html`/Cloudinary, out of the mobile client's scope).
- **Precise or Coarse Location** — not requested, not used.
- **Financial Info / Payment Info** — billing (Stripe Checkout) is entirely web-hosted; the mobile app never touches card data or payment info.
- **Browsing History / Search History** — not collected.
- **Analytics / Advertising Data** — no analytics SDK, no advertising SDK, no third-party tracking library is integrated.
- **Data shared with third parties for tracking** — none. Push tokens are relayed only through Expo's push service (functional infrastructure, not a tracking partner) and Supabase (the app's own backend, not a third party from the user's perspective).

## Summary Statement (for the App Store Connect free-text summary field)

"MotoKey collecte votre email (authentification), vos coordonnées de contact (nom/téléphone,
si renseignées lors de l'ajout d'une moto), les données techniques de vos motos (VIN, plaque,
kilométrage, année, marque, modèle) et un jeton de notification push pour vous alerter des
devis et rappels d'entretien. Aucune donnée n'est utilisée à des fins de suivi publicitaire
ni partagée avec des tiers. Le paiement des abonnements garage se fait exclusivement via le
site web (Stripe), jamais dans l'app mobile."

## Header checklist before pasting into App Store Connect

- [ ] Apple Developer Program membership active (blocked — D-01)
- [ ] Reconcile the technical `PrivacyInfo.xcprivacy` required-reason codes against a real
      EAS build/prebuild output (Plan 04) before final App Store submission — the codes in
      `app.json` today (`CA92.1`, `C617.1`, `35F9.1`, `E174.1`) are the standard RN/Expo set,
      flagged LOW confidence by research pending that verification.
- [ ] Confirm no new data types were added to the mobile app between now and actual submission.

# Google Play Data Safety — Play Console Content (ready to paste)

> **Scope note:** This document is the Google Play Console "Data safety" form content —
> the public disclosure Google shows on the Play Store product page. Submittable only once
> a Google Play Console account exists (D-01/D-02 of `17-CONTEXT.md` — parked as a known gap
> alongside Phase 8/BILL-06, not a phase failure).
>
> Data inventory below is the real, verified data the MotoKey mobile app collects (per
> `17-RESEARCH.md`'s Summary) — no invented categories, following Google's own fixed
> Data Safety category taxonomy (Personal info / App activity / Device or other IDs).

## Does your app collect or share any of the required user data types?

**Yes.**

## Personal Info

| Data Type | Collected | Shared | Processed Ephemerally | Required or Optional | Purpose |
|---|---|---|---|---|---|
| Name | Yes | No | No | Optional (entered when adding/claiming a moto) | App functionality |
| Email address | Yes | No | No | Required (account authentication) | App functionality |
| Phone number | Yes | No | No | Optional (entered when adding/claiming a moto) | App functionality |

## App Activity

| Data Type | Collected | Shared | Processed Ephemerally | Required or Optional | Purpose |
|---|---|---|---|---|---|
| Other user-generated content (moto VIN, plaque, kilométrage, année, marque, modèle) | Yes | No | No | Required (core moto passport feature) | App functionality |

## Device or Other IDs

| Data Type | Collected | Shared | Processed Ephemerally | Required or Optional | Purpose |
|---|---|---|---|---|---|
| Device or other IDs (Expo push token) | Yes | No | No | Required (push notification delivery) | App functionality |

## Explicitly NOT Collected

- **Camera / Photos** — no camera or media-picker integration exists anywhere in `mobile-app/` (photo capture for interventions is a garage-side/`app.html`/Cloudinary feature, not part of the mobile client).
- **Location (precise or approximate)** — not requested, not used.
- **Financial info** — billing (Stripe Checkout) is entirely web-hosted; no payment/card data ever passes through the mobile app.
- **Health and fitness data** — not applicable, not collected.
- **Web browsing / search history** — not collected.
- **Analytics / Advertising IDs** — no analytics SDK, no advertising SDK integrated.

## Data Security Practices (standard answers)

| Question | Answer |
|---|---|
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS/TLS to the MotoKey API and Supabase) |
| Do you provide a way for users to request that their data be deleted? | Yes — via account deletion request to the garage/support (existing account-management flow; no separate in-app self-delete button yet) |
| Is data collection required for the app to work, or can users opt out? | Email address and moto data are required for the app's core function (moto passport); contact fields (name/phone) and push token registration are optional |

## Summary Statement (for the Data Safety section's free-text overview, if used)

"MotoKey collecte votre email (authentification), vos coordonnées de contact optionnelles
(nom/téléphone), les données techniques de vos motos (VIN, plaque, kilométrage, année,
marque, modèle) et un jeton de notification push. Aucune donnée n'est partagée avec des
tiers ni utilisée à des fins publicitaires. Le paiement des abonnements garage se fait
exclusivement via le site web (Stripe), jamais dans l'app mobile."

## Header checklist before pasting into Play Console

- [ ] Google Play Console account active (blocked — D-01)
- [ ] Re-confirm data inventory is still accurate at actual submission time (no new
      collected data types added since this document was written).

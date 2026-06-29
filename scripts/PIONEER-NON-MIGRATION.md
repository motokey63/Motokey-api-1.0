# Pioneer Program — Garde-fou non-migration (PIONR-02)

## Promesse

Les 30 premiers garages inscrits via le code PIONEER2026 bénéficient d'un tarif verrouillé pendant **24 mois**. Quelle que soit l'évolution des prix catalogue de MotoKey, le tarif mensuel ou annuel de ces garages fondateurs ne change pas pendant cette durée.

---

## Pourquoi aucun code n'est nécessaire

Le verrouillage tarifaire 24 mois est garanti **nativement par Stripe** — aucun développement spécifique n'est requis.

Voici pourquoi :

1. **Un Price ID Stripe est immuable.** Une fois créé, son `unit_amount` (le montant facturé) ne change jamais. Il n'existe aucun moyen de modifier un prix existant dans Stripe — la seule option est d'en créer un nouveau.

2. **Stripe ne migre jamais automatiquement une souscription existante.** Quand un nouveau Price ID est créé (par exemple lors d'une hausse tarifaire), les souscriptions actives continuent sur leur Price ID d'origine. Le changement de prix ne s'applique qu'aux *nouvelles* souscriptions — jamais aux existantes, sauf appel explicite de l'opérateur.

3. **Conséquence directe :** tant que personne n'appelle l'API de migration pour les souscriptions Pioneer, leur tarif reste figé indéfiniment — bien au-delà des 24 mois garantis.

4. **Aucun Price ID "Pioneer" dédié n'est donc nécessaire.** Les garages Pioneer souscrivent aux mêmes Price IDs standard (Solo/Atelier/Concession). La protection tarifaire découle du comportement natif de Stripe, pas d'un mécanisme custom. (Décision confirmée en CONTEXT.md — "Claude's Discretion", PIONR-02.)

---

## Règle opérationnelle (garde-fou)

**NE JAMAIS** appeler `stripe.subscriptions.update({ items: [{ price: <nouveauPriceId> }] })` sur une souscription appartenant à un garage Pioneer.

Lors d'une future hausse de prix :

- Créer de nouveaux Price IDs pour les nouveaux tarifs.
- Basculer **uniquement** les nouvelles souscriptions et les souscriptions non-Pioneer vers ces nouveaux prix.
- **Laisser intact** le Price ID des souscriptions Pioneer — ne jamais les migrer.

Pour identifier les garages Pioneer : Stripe Dashboard → Promotions → PIONEER2026 → consulter la liste des customers ayant rédimé ce code.

---

## Vérification

Après tout changement de tarif catalogue :

1. Ouvrir le Stripe Dashboard → Customers → choisir un garage Pioneer.
2. Naviguer dans sa Subscription active.
3. Confirmer que le Price ID affiché est celui d'origine (créé lors de l'inscription), **pas** le nouveau Price ID de la hausse tarifaire.

Si le Price ID est identique à l'original : le verrouillage tarifaire PIONR-02 est respecté.

---

*Document créé lors de Phase 9 — Pioneer Program (2026-06-29). Référence : PIONR-02.*

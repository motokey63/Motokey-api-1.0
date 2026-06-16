'use strict';

/**
 * Phase 6 — Plan Limit Enforcement
 *
 * assertMotosLimit(garageId, SBLayer)  → appelé dans POST /motos
 * assertUsersLimit(garageId, SBLayer)  → appelé dans POST /garage/users
 *
 * BILLING_ENFORCE=false (Railway) → aucune vérification, garages travaillent sans contrainte.
 * Lance PlanLimitError (statusCode 402) si la limite est atteinte.
 */

class PlanLimitError extends Error {
  constructor(code, message) {
    super(message);
    this.statusCode = 402;
    this.code = code;
  }
}

async function assertMotosLimit(garageId, SBLayer) {
  if (process.env.BILLING_ENFORCE !== 'true') return;
  if (!SBLayer) return;

  const g = await SBLayer.Garages.getById(garageId);
  if (g.motos_limit === null || g.motos_limit === undefined) return; // illimité (Concession)

  if (g.subscription_status === 'blocked') {
    throw new PlanLimitError('PLAN_LIMIT_MOTOS', 'Abonnement suspendu — réactivez votre abonnement pour ajouter des motos.');
  }

  const { count, error } = await SBLayer.supabase
    .from('motos')
    .select('id', { count: 'exact', head: true })
    .eq('garage_id', garageId);

  if (error) throw new Error(`[planLimits] count motos : ${error.message}`);

  if (count >= g.motos_limit) {
    throw new PlanLimitError('PLAN_LIMIT_MOTOS',
      `Limite du plan atteinte : ${count}/${g.motos_limit} motos. Passez à un plan supérieur pour en ajouter davantage.`);
  }
}

async function assertUsersLimit(garageId, SBLayer) {
  if (process.env.BILLING_ENFORCE !== 'true') return;
  if (!SBLayer) return;

  const g = await SBLayer.Garages.getById(garageId);
  if (g.users_limit === null || g.users_limit === undefined) return; // illimité

  if (g.subscription_status === 'blocked') {
    throw new PlanLimitError('PLAN_LIMIT_USERS', 'Abonnement suspendu — réactivez votre abonnement pour ajouter des utilisateurs.');
  }

  const { count, error } = await SBLayer.supabase
    .from('garage_users')
    .select('id', { count: 'exact', head: true })
    .eq('garage_id', garageId)
    .eq('actif', true);

  if (error) throw new Error(`[planLimits] count users : ${error.message}`);

  if (count >= g.users_limit) {
    throw new PlanLimitError('PLAN_LIMIT_USERS',
      `Limite du plan atteinte : ${count}/${g.users_limit} utilisateurs. Passez à un plan supérieur pour en ajouter davantage.`);
  }
}

module.exports = { PlanLimitError, assertMotosLimit, assertUsersLimit };

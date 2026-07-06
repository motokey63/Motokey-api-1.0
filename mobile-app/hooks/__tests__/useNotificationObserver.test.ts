jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: jest.fn(),
}));

import { mapNotificationDataToRoute } from '../useNotificationObserver';

// Pure-function tests only (Pitfall 3 / RESEARCH.md Test Map) — the
// useNotificationObserver() hook itself is not tested here since
// @testing-library/react-hooks is not installed in this repo.
describe('mapNotificationDataToRoute (pure)', () => {
  it("Test 1: {type: 'devis_recu'} with no devisId maps to the plain Devis tab route", () => {
    expect(mapNotificationDataToRoute({ type: 'devis_recu' })).toBe('/(app)/(tabs)/devis');
  });

  it("Test 1b: {type: 'devis_recu', devisId} maps to the Devis tab route with a highlightId param", () => {
    expect(mapNotificationDataToRoute({ type: 'devis_recu', devisId: 'xyz' })).toEqual({
      pathname: '/(app)/(tabs)/devis',
      params: { highlightId: 'xyz' },
    });
  });

  it('Test 1c: a numeric devisId is coerced to a string in params.highlightId', () => {
    expect(mapNotificationDataToRoute({ type: 'devis_recu', devisId: 42 })).toEqual({
      pathname: '/(app)/(tabs)/devis',
      params: { highlightId: '42' },
    });
  });

  it('Test 2: an unknown type maps to null', () => {
    expect(mapNotificationDataToRoute({ type: 'something_else' })).toBeNull();
  });

  it('Test 3: undefined data maps to null (no throw)', () => {
    expect(mapNotificationDataToRoute(undefined)).toBeNull();
  });

  it('Test 4: empty object maps to null', () => {
    expect(mapNotificationDataToRoute({})).toBeNull();
  });

  it("Test 5: {type: 'moto_entretien', motoId} maps to the Fiche Moto route object", () => {
    expect(mapNotificationDataToRoute({ type: 'moto_entretien', motoId: 'abc' })).toEqual({
      pathname: '/(app)/(tabs)/motos/[id]',
      params: { id: 'abc' },
    });
  });

  it("Test 6: {type: 'moto_entretien'} with no motoId maps to null", () => {
    expect(mapNotificationDataToRoute({ type: 'moto_entretien' })).toBeNull();
  });

  it('Test 7: a numeric motoId is coerced to a string in params.id', () => {
    expect(mapNotificationDataToRoute({ type: 'moto_entretien', motoId: 42 })).toEqual({
      pathname: '/(app)/(tabs)/motos/[id]',
      params: { id: '42' },
    });
  });
});

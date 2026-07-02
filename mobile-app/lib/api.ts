import { API_BASE } from '../constants/config';
import { ApiResult } from './types';

/**
 * Fetch-based API client targeting the existing Express API
 * (https://motokey11-production.up.railway.app). Ports MotoKey_Client.html's
 * apiFetch/apiPost/apiGet/apiPut helpers 1:1, swapping browser globals for
 * React Native's global fetch. Deliberately sends no extra client-identifying
 * header — omitting it makes the backend return the full session JSON
 * (access_token + refresh_token in the body), which is exactly the mobile flow.
 *
 * This module must NEVER instantiate a direct Supabase JS data/auth client —
 * see README.md "Hard rule: API-only access".
 */
export async function apiFetch<T = any>(
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data: any;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: { message: "Serveur inaccessible — l'API est-elle démarrée ?" } } as any,
    };
  }
}

export const apiPost = (path: string, body?: any, token?: string) => apiFetch('POST', path, body, token);
export const apiGet = (path: string, token?: string) => apiFetch('GET', path, null, token);
export const apiPut = (path: string, body?: any, token?: string) => apiFetch('PUT', path, body, token);

/** Handles the two possible Supabase response shapes (flat or session-nested). */
export function extractTokens(data: any): { at: string; rt: string } {
  data = data || {};
  return {
    at:
      data.access_token ||
      data.session?.access_token ||
      data.data?.access_token ||
      data.data?.session?.access_token ||
      '',
    rt:
      data.refresh_token ||
      data.session?.refresh_token ||
      data.data?.refresh_token ||
      data.data?.session?.refresh_token ||
      '',
  };
}

/** Seconds until a JWT's `exp` claim; 0 if unparseable or missing. */
export function tokenSecsLeft(token: string): number {
  try {
    const payload = JSON.parse(
      globalThis.atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    return payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : 0;
  } catch {
    return 0;
  }
}

export function errMsg(data: any): string {
  return data?.error?.message || data?.message || 'Erreur inattendue.';
}

export const API_BASE = 'https://motokey11-production.up.railway.app';

export const SESSION_KEY = 'mk_session';

// Proactively refresh when less than 5 minutes remain (web client parity)
export const REFRESH_SKEW_SECS = 300;

// Treat as expired if less than 60s remain (web client init parity)
export const NEAR_EXPIRY_SECS = 60;

// Poll interval for the background refresh timer (web client parity)
export const REFRESH_POLL_MS = 60_000;

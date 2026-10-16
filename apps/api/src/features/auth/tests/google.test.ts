import { describe, it, beforeEach, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../../app.js';
import { getCookie } from './utils/utils.js';

const ENDPOINT = '/api/auth/google';

const GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';

function startGoogleAuth() {
  return request(app).get(ENDPOINT);
}

beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID);
  vi.stubEnv('GOOGLE_REDIRECT_URI', GOOGLE_REDIRECT_URI);
});

describe('GET /api/auth/google', () => {
  it('redirects to the Google consent screen with the expected parameters', async () => {
    const res = await startGoogleAuth().expect(302);

    const location = new URL(res.headers.location!);
    expect(location.origin + location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('client_id')).toBe(GOOGLE_CLIENT_ID);
    expect(location.searchParams.get('redirect_uri')).toBe(GOOGLE_REDIRECT_URI);
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(location.searchParams.get('state')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stores the same state in a short-lived httpOnly cookie', async () => {
    const res = await startGoogleAuth().expect(302);

    const urlState = new URL(res.headers.location!).searchParams.get('state');
    const cookie = getCookie(res, 'google-oauth-state');

    expect(cookie).toBeDefined();
    expect(cookie!.value).toBe(urlState);
    expect(cookie!.attrs.has('httponly')).toBe(true);
    expect(cookie!.attrs.get('samesite')?.toLowerCase()).toBe('lax');
    expect(cookie!.attrs.get('max-age')).toBe(String(10 * 60));
  });

  it('generates a fresh state on every request', async () => {
    const first = await startGoogleAuth().expect(302);
    const second = await startGoogleAuth().expect(302);

    expect(getCookie(first, 'google-oauth-state')!.value).not.toBe(
      getCookie(second, 'google-oauth-state')!.value,
    );
  });
});

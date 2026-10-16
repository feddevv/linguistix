import { describe, it, beforeEach, afterAll, expect, vi } from 'vitest';
import request, { type Response } from 'supertest';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { app } from '../../../app.js';
import { pg } from '../../../db/pg.js';
import { hashString } from '../utils/hashing.js';
import { getCookie } from './utils.js';
import { UserRepo } from '../../user/user.repository.js';
import { RefreshTokenRepo } from '../auth.repository.js';
import { getGoogleTokens } from '../../google/google.service.js';
import { AppError, ErrorCode } from '../../../errors/AppError.js';

vi.mock('../../google/google.service.js', () => ({ getGoogleTokens: vi.fn() }));

const getGoogleTokensMock = vi.mocked(getGoogleTokens);

const ENDPOINT = '/api/auth/google/callback';
const FRONTEND_URL = 'http://localhost:5173/';
const STATE = 'a'.repeat(64);
const CODE = 'google-auth-code';

const googleProfile = {
  sub: 'google-sub-123',
  email: 'ada.lovelace@example.com',
  email_verified: true,
  name: 'Ada Lovelace',
  given_name: 'Ada',
  family_name: 'Lovelace',
};

// The ID token is only decoded (not verified) by the service, so any signing key works.
function mockGoogleProfile(overrides: Partial<typeof googleProfile> = {}) {
  const idToken = jwt.sign({ ...googleProfile, ...overrides }, 'google-test-key');

  getGoogleTokensMock.mockResolvedValue({
    access_token: 'google-access-token',
    expires_in: 3599,
    scope: 'openid email profile',
    token_type: 'Bearer',
    id_token: idToken,
  });
}

function callback(query: Record<string, string>, stateCookie: string | null = STATE) {
  const req = request(app).get(ENDPOINT).query(query);
  if (stateCookie !== null) req.set('Cookie', `google-oauth-state=${stateCookie}`);
  return req;
}

function errorRedirect(error: ErrorCode) {
  return `${FRONTEND_URL}?error=${error}`;
}

function seedUser(overrides: { googleId?: string; email?: string; password?: string } = {}) {
  return UserRepo.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: googleProfile.email,
    role: 'student',
    ...overrides,
  });
}

function expectNoAuthCookies(res: Response) {
  expect(getCookie(res, 'accessToken')).toBeUndefined();
  expect(getCookie(res, 'refreshToken')).toBeUndefined();
}

// Returns the id of the user the issued session belongs to.
async function expectSessionIssued(res: Response) {
  const accessToken = getCookie(res, 'accessToken');
  const refreshToken = getCookie(res, 'refreshToken');

  expect(accessToken?.value).toBeTruthy();
  expect(refreshToken?.value).toBeTruthy();

  const payload = jwt.verify(accessToken!.value, process.env.SECRET_KEY!) as JwtPayload;
  const stored = await RefreshTokenRepo.findRefreshTokenByHash(hashString(refreshToken!.value));

  expect(stored).not.toBeNull();
  expect(stored!.userId).toBe(payload.id);

  return payload.id as string;
}

beforeEach(async () => {
  vi.stubEnv('FRONTEND_URL', FRONTEND_URL);
  getGoogleTokensMock.mockReset();
  await pg.query('TRUNCATE TABLE users CASCADE;');
});

afterAll(async () => {
  await pg.query('TRUNCATE TABLE users CASCADE;');
  await pg.end();
});

describe('GET /api/auth/google/callback', () => {
  describe('successful sign-in', () => {
    it('creates a new user, issues a session and redirects to the frontend', async () => {
      mockGoogleProfile();

      const res = await callback({ code: CODE, state: STATE }).expect(302);

      expect(res.headers.location).toBe(FRONTEND_URL);
      expect(getGoogleTokensMock).toHaveBeenCalledWith(CODE);

      const userId = await expectSessionIssued(res);
      const user = await UserRepo.findUserById(userId);
      expect(user).toMatchObject({
        googleId: googleProfile.sub,
        email: googleProfile.email,
        firstName: googleProfile.given_name,
        lastName: googleProfile.family_name,
        password: null,
        role: null,
      });
    });

    it('falls back to the full name when given and family names are missing', async () => {
      mockGoogleProfile({ given_name: undefined, family_name: undefined });

      const res = await callback({ code: CODE, state: STATE }).expect(302);

      const user = await UserRepo.findUserById(await expectSessionIssued(res));
      expect(user!.firstName).toBe(googleProfile.name);
      expect(user!.lastName).toBe('');
    });

    it('signs in an existing Google user without creating a new one', async () => {
      const existing = await seedUser({ googleId: googleProfile.sub });
      mockGoogleProfile();

      const res = await callback({ code: CODE, state: STATE }).expect(302);

      expect(await expectSessionIssued(res)).toBe(existing.id);
      expect(await UserRepo.countUsers()).toBe(1);
    });

    it("does't link Google to an existing email/password account with the same email", async () => {
      const existing = await seedUser({ password: 'bcrypt-hash' });
      mockGoogleProfile();

      const res = await callback({ code: CODE, state: STATE }).expect(302);

      expect(await UserRepo.countUsers()).toBe(1);
      expect((await UserRepo.findUserById(existing.id))!.googleId).toBe(null);
    });

    it('updates the stored email when the Google account email changed', async () => {
      const existing = await seedUser({ googleId: googleProfile.sub, email: 'old@example.com' });
      mockGoogleProfile();

      const res = await callback({ code: CODE, state: STATE }).expect(302);

      expect(await expectSessionIssued(res)).toBe(existing.id);
      expect((await UserRepo.findUserById(existing.id))!.email).toBe(googleProfile.email);
    });

    it('clears the state cookie', async () => {
      mockGoogleProfile();

      const res = await callback({ code: CODE, state: STATE }).expect(302);

      expect(getCookie(res, 'google-oauth-state')?.value).toBe('');
    });
  });

  describe('state validation', () => {
    it.each<[string, Record<string, string>, string | null]>([
      ['the state cookie is missing', { code: CODE, state: STATE }, null],
      ['the state query param is missing', { code: CODE }, STATE],
      ['the states do not match', { code: CODE, state: STATE }, 'b'.repeat(64)],
    ])('redirects with invalid_state when %s', async (_, query, stateCookie) => {
      mockGoogleProfile();

      const res = await callback(query, stateCookie).expect(302);

      expect(res.headers.location).toBe(errorRedirect('INVALID_STATE'));
      expect(getGoogleTokensMock).not.toHaveBeenCalled();
      expectNoAuthCookies(res);
      expect(await UserRepo.countUsers()).toBe(0);
    });
  });

  describe('Google errors', () => {
    it.each<[string, string]>([
      ['access_denied', 'CANCELED_AUTH'],
      ['server_error', 'SERVER_ERROR'],
    ])('redirects with %s → %s without exchanging the code', async (error, expected) => {
      const res = await callback({ error, state: STATE }).expect(302);

      expect(res.headers.location).toBe(errorRedirect(expected as ErrorCode));
      expect(getGoogleTokensMock).not.toHaveBeenCalled();
      expectNoAuthCookies(res);
    });

    it('redirects with server_error when the code exchange fails', async () => {
      getGoogleTokensMock.mockRejectedValue(new AppError('SERVER_ERROR', 400, 'Bad Request'));

      const res = await callback({ code: CODE, state: STATE }).expect(302);

      expect(res.headers.location).toBe(errorRedirect('SERVER_ERROR'));
      expectNoAuthCookies(res);
      expect(await UserRepo.countUsers()).toBe(0);
    });

    it('rejects a Google account with an unverified email', async () => {
      mockGoogleProfile({ email_verified: false });

      const res = await callback({ code: CODE, state: STATE }).expect(302);

      expect(res.headers.location).toBe(errorRedirect('EMAIL_UNVERIFIED'));
      expectNoAuthCookies(res);
      expect(await UserRepo.countUsers()).toBe(0);
    });

    it('does not link to an existing account when the email is unverified', async () => {
      const existing = await seedUser({ password: 'bcrypt-hash' });
      mockGoogleProfile({ email_verified: false });

      await callback({ code: CODE, state: STATE }).expect(302);

      expect((await UserRepo.findUserById(existing.id))!.googleId).toBeNull();
    });
  });
});

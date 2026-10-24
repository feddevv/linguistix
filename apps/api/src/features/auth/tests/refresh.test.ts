import { describe, it, beforeEach, afterAll, expect } from 'vitest';
import request, { type Response } from 'supertest';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { app } from '../../../app.js';
import { pg } from '../../../lib/pg.js';
import { hashString } from '../utils/hashing.js';
import { existingUser, seedUser, getCookie, loginAs, daysFromNow } from './utils/utils.js';
import { expectAuthCookiesCleared, expectErrorBody } from './utils/expects.js';
import { RefreshTokenRepo } from '../auth.repository.js';

const ENDPOINT = '/api/auth/refresh';

const ACCESS_TOKEN_TTL = 15 * 60;
const REFRESH_TOKEN_TTL = 15 * 24 * 60 * 60;

function refresh(refreshToken?: string) {
  const req = request(app).post(ENDPOINT);
  if (refreshToken !== undefined) req.set('Cookie', `refreshToken=${refreshToken}`);
  return req;
}

function signToken(
  payload: jwt.JwtPayload,
  options: jwt.SignOptions = {},
  secret = process.env.SECRET_KEY!,
) {
  return jwt.sign(payload, secret, options);
}

function verifyToken(token: string) {
  return jwt.verify(token, process.env.SECRET_KEY!) as JwtPayload;
}

// A failed refresh must never hand out usable tokens: auth cookies are either
// absent or explicitly cleared (empty value, already expired).
function expectNoNewTokens(res: Response) {
  for (const name of ['accessToken', 'refreshToken']) {
    const cookie = getCookie(res, name);
    if (!cookie) continue;

    expect(cookie.value).toBe('');
  }
}

async function expectRejected(res: Response) {
  expect(res.status).toBe(401);
  expect(res.headers['content-type']).toMatch(/json/);
  expectErrorBody(res.body);
  expectNoNewTokens(res);
}

beforeEach(async () => {
  await pg.query('TRUNCATE TABLE users CASCADE;');
});

afterAll(async () => {
  await pg.query('TRUNCATE TABLE users CASCADE;');
  await pg.end();
});

describe('POST /api/auth/refresh', () => {
  describe('happy path', () => {
    it('returns 200 with a JSON body for a valid refresh token', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      const res = await refresh(refreshToken).expect(200).expect('Content-Type', /json/);

      expect(res.body).toEqual({ message: expect.any(String) });
    });

    it('never exposes the tokens in the response body', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      const res = await refresh(refreshToken).expect(200);

      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.body).not.toHaveProperty('refreshToken');
    });

    it('rotates the refresh token: the new one differs from the one presented', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      const res = await refresh(refreshToken).expect(200);

      expect(getCookie(res, 'refreshToken')!.value).not.toBe(refreshToken);
    });

    it('allows the rotated refresh token to be used for the next refresh', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      const first = await refresh(refreshToken).expect(200);
      const second = await refresh(getCookie(first, 'refreshToken')!.value).expect(200);

      expect(getCookie(second, 'accessToken')!.value).not.toBe('');
      expect(getCookie(second, 'refreshToken')!.value).not.toBe('');
    });

    it('supports a long chain of consecutive refreshes', async () => {
      await seedUser();
      let { refreshToken } = await loginAs(existingUser);

      for (let i = 0; i < 5; i++) {
        const res = await refresh(refreshToken).expect(200);
        refreshToken = getCookie(res, 'refreshToken')!.value;
      }
    });

    it('works for a teacher and keeps the teacher role', async () => {
      const user = await seedUser({ role: 'teacher' });
      const { refreshToken } = await loginAs(user);

      const res = await refresh(refreshToken).expect(200);

      expect(verifyToken(getCookie(res, 'accessToken')!.value).role).toBe('teacher');
    });

    it('ignores any request body', async () => {
      const user = await seedUser();
      const { refreshToken } = await loginAs(user);

      const res = await refresh(refreshToken)
        .send({ id: 'someone-else', role: 'teacher', refreshToken: 'garbage' })
        .expect(200);

      const payload = verifyToken(getCookie(res, 'accessToken')!.value);
      expect(payload.id).toBe(user.id);
      expect(payload.role).toBe('student');
    });
  });

  describe('session cookies', () => {
    it('sets an HttpOnly, SameSite=Lax accessToken cookie that lives 15 minutes', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      const res = await refresh(refreshToken).expect(200);
      const cookie = getCookie(res, 'accessToken');

      expect(cookie).toBeDefined();
      expect(cookie!.value).not.toBe('');
      expect(cookie!.attrs.has('httponly')).toBe(true);
      expect(cookie!.attrs.get('samesite')?.toLowerCase()).toBe('lax');
      expect(cookie!.attrs.get('max-age')).toBe(String(ACCESS_TOKEN_TTL));
    });

    it('sets an HttpOnly, SameSite=Lax refreshToken cookie that lives 15 days', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      const res = await refresh(refreshToken).expect(200);
      const cookie = getCookie(res, 'refreshToken');

      expect(cookie).toBeDefined();
      expect(cookie!.value).not.toBe('');
      expect(cookie!.attrs.has('httponly')).toBe(true);
      expect(cookie!.attrs.get('samesite')?.toLowerCase()).toBe('lax');
      expect(cookie!.attrs.get('max-age')).toBe(String(REFRESH_TOKEN_TTL));
    });

    it('issues a signed access token identifying the user that expires in 15 minutes', async () => {
      const user = await seedUser();
      const { refreshToken } = await loginAs(user);

      const res = await refresh(refreshToken).expect(200);
      const payload = verifyToken(getCookie(res, 'accessToken')!.value);

      expect(payload).toMatchObject({ id: user.id, email: user.email, role: user.role });
      expect(payload.exp! - payload.iat!).toBe(ACCESS_TOKEN_TTL);
      expect(payload).not.toHaveProperty('password');
    });

    it('issues a signed refresh token identifying the user that expires in 15 days', async () => {
      const user = await seedUser();
      const { refreshToken } = await loginAs(user);

      const res = await refresh(refreshToken).expect(200);
      const payload = verifyToken(getCookie(res, 'refreshToken')!.value);

      expect(payload.exp! - payload.iat!).toBe(REFRESH_TOKEN_TTL);
      expect(payload).not.toHaveProperty('password');
    });

    it('builds the new tokens from the current user record, not from the old token', async () => {
      const user = await seedUser();
      const { refreshToken } = await loginAs(user);
      await pg.query("UPDATE users SET role = 'teacher' WHERE id = $1;", [user.id]);

      const res = await refresh(refreshToken).expect(200);

      expect(verifyToken(getCookie(res, 'accessToken')!.value).role).toBe('teacher');
    });
  });

  describe('persistence', () => {
    it('replaces the stored session instead of adding a new one', async () => {
      const user = await seedUser();
      const { refreshToken } = await loginAs(user);

      await refresh(refreshToken).expect(200);

      expect(await RefreshTokenRepo.findRefreshTokensByUserId(user.id)).toBeDefined();
    });

    it('never stores the refresh token in plain text', async () => {
      const user = await seedUser();
      const { refreshToken } = await loginAs(user);

      const res = await refresh(refreshToken).expect(200);
      const newRefreshToken = getCookie(res, 'refreshToken')!.value;

      const stored = await RefreshTokenRepo.findRefreshTokensByUserId(user.id);
      expect(stored?.map((row) => row.refreshTokenHash)).not.toContain(newRefreshToken);
      expect(stored?.map((row) => row.refreshTokenHash)).not.toContain(refreshToken);
    });
  });

  describe('missing token', () => {
    it('returns 401 when no cookies are sent', async () => {
      await seedUser();

      const res = await refresh();

      await expectRejected(res);
    });

    it('returns 401 when the refreshToken cookie is empty', async () => {
      await seedUser();

      const res = await refresh('');

      await expectRejected(res);
    });

    it('returns 401 when only an accessToken cookie is sent', async () => {
      await seedUser();
      const { accessToken } = await loginAs(existingUser);

      const res = await request(app).post(ENDPOINT).set('Cookie', `accessToken=${accessToken}`);

      await expectRejected(res);
    });

    it('does not accept the refresh token from the request body', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      const res = await request(app).post(ENDPOINT).send({ refreshToken });

      await expectRejected(res);
    });

    it('does not accept the refresh token from the Authorization header', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      const res = await request(app).post(ENDPOINT).set('Authorization', `Bearer ${refreshToken}`);

      await expectRejected(res);
    });
  });

  describe('invalid token', () => {
    it.each<[string, string]>([
      ['a random string', 'not-a-jwt'],
      ['a malformed JWT', 'aaa.bbb.ccc'],
      ['whitespace', '   '],
    ])('returns 401 for %s', async (_, token) => {
      await seedUser();

      const res = await refresh(encodeURIComponent(token));

      await expectRejected(res);
    });

    it('returns 401 for a token signed with a different secret', async () => {
      const user = await seedUser();
      const forged = signToken(
        { id: user.id, email: user.email, role: user.role },
        { expiresIn: '15d' },
        'not-the-real-secret',
      );
      await RefreshTokenRepo.createRefreshToken({
        refreshTokenHash: hashString(forged),
        userId: user.id,
        expiresAt: daysFromNow(15),
      });

      const res = await refresh(forged);

      await expectRejected(res);
    });

    it('returns 401 for a correctly signed token that was never issued (not stored)', async () => {
      const user = await seedUser();
      const neverIssued = signToken(
        { id: user.id, email: user.email, role: user.role, nonce: 'never-issued' },
        { expiresIn: '15d' },
      );

      const res = await refresh(neverIssued);

      await expectRejected(res);
    });

    it('returns 401 when an access token is used as a refresh token', async () => {
      await seedUser();
      const { accessToken } = await loginAs(existingUser);

      const res = await refresh(accessToken);

      await expectRejected(res);
    });

    it('clears both auth cookies when the refresh fails', async () => {
      await seedUser();

      const res = await refresh('not-a-jwt').expect(401);

      expectAuthCookiesCleared(res);
    });
  });

  describe('expired and revoked sessions', () => {
    it('returns 401 for a stored token whose JWT has expired', async () => {
      const user = await seedUser();
      const expired = signToken({
        id: user.id,
        email: user.email,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      await RefreshTokenRepo.createRefreshToken({
        refreshTokenHash: hashString(expired),
        userId: user.id,
        expiresAt: daysFromNow(15),
      });

      const res = await refresh(expired);

      await expectRejected(res);
    });

    it('returns 401 when the stored session has expired even if the JWT is still valid', async () => {
      const user = await seedUser();
      const { refreshToken } = await loginAs(user);
      await pg.query(
        "UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1;",
        [user.id],
      );

      const res = await refresh(refreshToken);

      await expectRejected(res);
    });

    it('returns 401 when the session was revoked (row deleted)', async () => {
      const user = await seedUser();
      const { refreshToken } = await loginAs(user);
      await pg.query('DELETE FROM refresh_tokens WHERE user_id = $1;', [user.id]);

      const res = await refresh(refreshToken);

      await expectRejected(res);
    });

    it('returns 401 when the user no longer exists', async () => {
      const user = await seedUser();
      const { refreshToken } = await loginAs(user);
      await pg.query('DELETE FROM users WHERE id = $1;', [user.id]);

      const res = await refresh(refreshToken);

      await expectRejected(res);
    });
  });

  describe('token reuse', () => {
    it('rejects the old refresh token once it has been rotated', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);
      await refresh(refreshToken).expect(200);

      const res = await refresh(refreshToken);

      await expectRejected(res);
    });

    it('lets only one of two concurrent refreshes with the same token succeed', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);

      const statuses = results.map((res) => res.status).sort();
      expect(statuses).toEqual([200, 401]);
    });

    it('does not affect other sessions of the same user', async () => {
      const user = await seedUser();
      const sessionA = await loginAs(user);
      const sessionB = await loginAs(user);

      await refresh(sessionA.refreshToken).expect(200);

      await refresh(sessionB.refreshToken).expect(200);
    });

    it("does not affect other users' sessions", async () => {
      const ada = await seedUser();
      const grace = await seedUser({ email: 'grace.hopper@example.com', firstName: 'Grace' });
      const adaSession = await loginAs(ada);
      const graceSession = await loginAs(grace);

      await refresh(adaSession.refreshToken).expect(200);

      const res = await refresh(graceSession.refreshToken).expect(200);
      expect(verifyToken(getCookie(res, 'accessToken')!.value).id).toBe(grace.id);
    });
  });

  describe('routing', () => {
    it('responds 404 to GET', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      await request(app).get(ENDPOINT).set('Cookie', `refreshToken=${refreshToken}`).expect(404);
    });
  });
});

import { describe, it, beforeEach, afterAll, expect } from 'vitest';
import request, { type Response } from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../app.js';
import { pg } from '../../../lib/pg.js';
import { hashString } from '../utils/hashing.js';
import { existingUser, seedUser, getCookie, loginAs, daysFromNow } from './utils/utils.js';
import { expectAuthCookiesCleared } from './utils/expects.js';
import { RefreshTokenRepo } from '../auth.repository.js';

const ENDPOINT = '/api/auth/logout';

function logout(cookies: { refreshToken?: string; accessToken?: string } = {}) {
  const req = request(app).post(ENDPOINT);
  const header = Object.entries(cookies)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  if (header) req.set('Cookie', header);
  return req;
}

function refresh(refreshToken: string) {
  return request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${refreshToken}`);
}

async function isStored(refreshToken: string) {
  return (await RefreshTokenRepo.findRefreshTokenByHash(hashString(refreshToken))) !== null;
}

// Logout is idempotent: it always succeeds, whether or not there was a session to end.
function expectLoggedOut(res: Response) {
  expect([200, 204]).toContain(res.status);
}

beforeEach(async () => {
  await pg.query('TRUNCATE TABLE users CASCADE;');
});

afterAll(async () => {
  await pg.query('TRUNCATE TABLE users CASCADE;');
  await pg.end();
});

describe('POST /api/auth/logout', () => {
  describe('happy path', () => {
    it('succeeds for a valid session', async () => {
      await seedUser();
      const tokens = await loginAs(existingUser);

      const res = await logout(tokens);

      expectLoggedOut(res);
    });

    it('clears both auth cookies', async () => {
      await seedUser();
      const tokens = await loginAs(existingUser);

      const res = await logout(tokens);

      expectAuthCookiesCleared(res);
    });

    it('never exposes tokens in the response body', async () => {
      await seedUser();
      const tokens = await loginAs(existingUser);

      const res = await logout(tokens);

      expect(res.text).not.toContain(tokens.refreshToken);
      expect(res.text).not.toContain(tokens.accessToken);
    });

    it('works with only the refreshToken cookie (access token already expired)', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      const res = await logout({ refreshToken });

      expectLoggedOut(res);
      expect(await isStored(refreshToken)).toBe(false);
    });
  });

  describe('session revocation', () => {
    it('removes the stored refresh token', async () => {
      await seedUser();
      const tokens = await loginAs(existingUser);
      expect(await isStored(tokens.refreshToken)).toBe(true);

      await logout(tokens);

      expect(await isStored(tokens.refreshToken)).toBe(false);
    });

    it('makes the refresh token unusable for /auth/refresh', async () => {
      await seedUser();
      const tokens = await loginAs(existingUser);

      await logout(tokens);

      await refresh(tokens.refreshToken).expect(401);
    });

    it('revokes a rotated refresh token', async () => {
      await seedUser();
      const tokens = await loginAs(existingUser);
      const rotated = getCookie(await refresh(tokens.refreshToken).expect(200), 'refreshToken')!;

      expectLoggedOut(await logout({ refreshToken: rotated.value }));

      expect(await isStored(rotated.value)).toBe(false);
      await refresh(rotated.value).expect(401);
    });

    it('revokes a session whose JWT has already expired', async () => {
      const user = await seedUser();
      const expired = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          exp: Math.floor(Date.now() / 1000) - 60,
        },
        process.env.SECRET_KEY!,
      );
      await RefreshTokenRepo.createRefreshToken({
        refreshTokenHash: hashString(expired),
        userId: user.id,
        expiresAt: daysFromNow(15),
      });

      const res = await logout({ refreshToken: expired });

      expectLoggedOut(res);
      expect(await isStored(expired)).toBe(false);
    });

    it('does not end other sessions of the same user', async () => {
      const user = await seedUser();
      const sessionA = await loginAs(user);
      const sessionB = await loginAs(user);

      await logout(sessionA);

      expect(await isStored(sessionB.refreshToken)).toBe(true);
      await refresh(sessionB.refreshToken).expect(200);
    });

    it("does not end other users' sessions", async () => {
      const ada = await seedUser();
      const grace = await seedUser({ email: 'grace.hopper@example.com', firstName: 'Grace' });
      const adaSession = await loginAs(ada);
      const graceSession = await loginAs(grace);

      await logout(adaSession);

      expect(await isStored(graceSession.refreshToken)).toBe(true);
      await refresh(graceSession.refreshToken).expect(200);
    });
  });

  describe('no session to end', () => {
    it('succeeds and clears cookies when no cookies are sent', async () => {
      const res = await logout();

      expectLoggedOut(res);
      expectAuthCookiesCleared(res);
    });

    it('succeeds when the refreshToken cookie is empty', async () => {
      const res = await logout({ refreshToken: '' });

      expectLoggedOut(res);
      expectAuthCookiesCleared(res);
    });

    it('succeeds with only an accessToken cookie and leaves the session intact', async () => {
      await seedUser();
      const { accessToken, refreshToken } = await loginAs(existingUser);

      const res = await logout({ accessToken });

      expectLoggedOut(res);
      expect(await isStored(refreshToken)).toBe(true);
    });

    it('succeeds for a valid-looking token that was never issued and deletes nothing', async () => {
      const user = await seedUser();
      const { refreshToken } = await loginAs(user);
      const neverIssued = jwt.sign(
        { id: user.id, email: user.email, role: user.role, nonce: 'never-issued' },
        process.env.SECRET_KEY!,
        { expiresIn: '15d' },
      );

      const res = await logout({ refreshToken: neverIssued });

      expectLoggedOut(res);
      expect(await isStored(refreshToken)).toBe(true);
    });

    it.each<[string, string]>([
      ['a random string', 'not-a-jwt'],
      ['a malformed JWT', 'aaa.bbb.ccc'],
      ['whitespace', encodeURIComponent('   ')],
      ['a very long value', 'x'.repeat(3000)],
    ])('succeeds for %s', async (_, token) => {
      const res = await logout({ refreshToken: token });

      expectLoggedOut(res);
      expectAuthCookiesCleared(res);
    });

    // cookie-parser turns `j:`-prefixed cookies into parsed JSON values, so the
    // handler can receive a non-string. That must not crash the endpoint.
    it.each<[string, string]>([
      ['a JSON object', `j:${encodeURIComponent('{"a":1}')}`],
      ['a JSON array', `j:${encodeURIComponent('[1,2]')}`],
      ['a JSON number', 'j:42'],
    ])('succeeds when the refreshToken cookie parses to %s', async (_, token) => {
      const res = await logout({ refreshToken: token });

      expectLoggedOut(res);
      expectAuthCookiesCleared(res);
    });
  });

  describe('idempotency', () => {
    it('succeeds when the same session is logged out twice', async () => {
      await seedUser();
      const tokens = await loginAs(existingUser);

      expectLoggedOut(await logout(tokens));
      const res = await logout(tokens);

      expectLoggedOut(res);
      expectAuthCookiesCleared(res);
    });

    it('handles concurrent logouts of the same session', async () => {
      await seedUser();
      const tokens = await loginAs(existingUser);

      const results = await Promise.all([logout(tokens), logout(tokens)]);

      results.forEach(expectLoggedOut);
      expect(await isStored(tokens.refreshToken)).toBe(false);
    });
  });

  describe('token source', () => {
    it('does not accept the refresh token from the request body', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      await request(app).post(ENDPOINT).send({ refreshToken });

      expect(await isStored(refreshToken)).toBe(true);
    });

    it('does not accept the refresh token from the Authorization header', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      await request(app).post(ENDPOINT).set('Authorization', `Bearer ${refreshToken}`);

      expect(await isStored(refreshToken)).toBe(true);
    });
  });

  describe('routing', () => {
    it('responds 404 to GET and keeps the session', async () => {
      await seedUser();
      const { refreshToken } = await loginAs(existingUser);

      await request(app).get(ENDPOINT).set('Cookie', `refreshToken=${refreshToken}`).expect(404);

      expect(await isStored(refreshToken)).toBe(true);
    });
  });
});

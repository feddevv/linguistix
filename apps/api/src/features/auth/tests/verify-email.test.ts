import { describe, it, beforeEach, afterAll, afterEach, expect, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import type { ErrorCode } from '@repo/shared';
import { app } from '../../../app.js';
import { pg } from '../../../lib/pg.js';
import { hashString } from '../utils/hashing.js';
import { seedUser } from './utils/utils.js';
import { daysFromNow } from '../utils/index.js';
import { expectErrorBody, expectNoAuthCookies } from './utils/expects.js';
import { UserRepo } from '../../user/user.repository.js';
import { EmailVerificationTokenRepo } from '../auth.repository.js';

const ENDPOINT = '/api/auth/verify-email';
const FRONTEND_URL = 'http://localhost:5173/';

function verifyEmail(query?: Record<string, string | string[]>) {
  const req = request(app).get(ENDPOINT);
  return query ? req.query(query) : req;
}

function errorRedirect(error: ErrorCode) {
  return `${FRONTEND_URL}?error=${error}`;
}

// Stores only the hash, like registration does, and returns the raw token the user receives by email.
async function seedToken(userId: string, expiresAt = daysFromNow(1)) {
  const token = crypto.randomBytes(32).toString('hex');

  await EmailVerificationTokenRepo.createToken({
    tokenHash: hashString(token),
    userId,
    expiresAt,
  });

  return token;
}

async function findTokenRow(token: string) {
  const { rows } = await pg.query<{ used_at: Date | null }>(
    `SELECT used_at FROM email_verification_tokens WHERE token_hash = $1`,
    [hashString(token)],
  );

  return rows[0];
}

async function isVerified(userId: string) {
  return (await UserRepo.findUserById(userId))!.isVerified;
}

beforeEach(async () => {
  vi.stubEnv('FRONTEND_URL', FRONTEND_URL);
  await pg.query('TRUNCATE TABLE users CASCADE;');
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await pg.query('TRUNCATE TABLE users CASCADE;');
  await pg.end();
});

describe('GET /api/auth/verify-email', () => {
  describe('happy path', () => {
    it('verifies the email and redirects to the frontend', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      const res = await verifyEmail({ token }).expect(302);

      expect(res.headers.location).toBe(FRONTEND_URL);
      expect(await isVerified(user.id)).toBe(true);
    });

    it('marks the token as used', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      await verifyEmail({ token }).expect(302);

      expect((await findTokenRow(token))!.used_at).toBeInstanceOf(Date);
    });

    it('verifies only the owner of the token', async () => {
      const owner = await seedUser();
      const other = await seedUser({ email: 'grace.hopper@example.com' });
      const token = await seedToken(owner.id);

      await verifyEmail({ token }).expect(302);

      expect(await isVerified(owner.id)).toBe(true);
      expect(await isVerified(other.id)).toBe(false);
    });

    it('does not sign the user in', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      const res = await verifyEmail({ token }).expect(302);

      expectNoAuthCookies(res);
    });
  });

  describe('invalid tokens', () => {
    it('redirects with INVALID_VERIFICATION_TOKEN for an unknown token', async () => {
      const user = await seedUser();
      await seedToken(user.id);

      const res = await verifyEmail({ token: crypto.randomBytes(32).toString('hex') }).expect(302);

      expect(res.headers.location).toBe(errorRedirect('INVALID_VERIFICATION_TOKEN'));
      expect(await isVerified(user.id)).toBe(false);
    });

    it('rejects an expired token and leaves it unconsumed', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id, daysFromNow(-1));

      const res = await verifyEmail({ token }).expect(302);

      expect(res.headers.location).toBe(errorRedirect('INVALID_VERIFICATION_TOKEN'));
      expect(await isVerified(user.id)).toBe(false);
      expect((await findTokenRow(token))!.used_at).toBeNull();
    });

    it('rejects a token that has already been used', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);
      await verifyEmail({ token }).expect(302);

      const res = await verifyEmail({ token }).expect(302);

      expect(res.headers.location).toBe(errorRedirect('INVALID_VERIFICATION_TOKEN'));
      expect(await isVerified(user.id)).toBe(true);
    });

    it('rejects the stored hash when it is sent as the token', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      const res = await verifyEmail({ token: hashString(token) }).expect(302);

      expect(res.headers.location).toBe(errorRedirect('INVALID_VERIFICATION_TOKEN'));
      expect(await isVerified(user.id)).toBe(false);
    });

    it('rejects a token that differs only in letter casing', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      const res = await verifyEmail({ token: token.toUpperCase() }).expect(302);

      expect(res.headers.location).toBe(errorRedirect('INVALID_VERIFICATION_TOKEN'));
      expect(await isVerified(user.id)).toBe(false);
    });
  });

  describe('already verified user', () => {
    it('redirects with EMAIL_ALREADY_VERIFIED for a valid token of a verified user', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);
      await UserRepo.updateIsVerified(true, user.id);

      const res = await verifyEmail({ token }).expect(302);

      expect(res.headers.location).toBe(errorRedirect('EMAIL_ALREADY_VERIFIED'));
      expect(await isVerified(user.id)).toBe(true);
    });

    it('rejects a second, still valid token once the email is verified by the first one', async () => {
      const user = await seedUser();
      const first = await seedToken(user.id);
      const second = await seedToken(user.id);
      await verifyEmail({ token: first }).expect(302);

      const res = await verifyEmail({ token: second }).expect(302);

      expect(res.headers.location).toBe(errorRedirect('EMAIL_ALREADY_VERIFIED'));
    });
  });

  describe('invalid query', () => {
    it.each<[string, Record<string, string | string[]> | undefined]>([
      ['the token is missing', undefined],
      ['the token is empty', { token: '' }],
      ['the token is whitespace only', { token: '   ' }],
      ['the token is passed multiple times', { token: ['a', 'b'] }],
    ])('returns 400 when %s', async (_, query) => {
      const res = await verifyEmail(query).expect(400).expect('Content-Type', /json/);

      expectErrorBody(res.body);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('does not consume any token on a validation error', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      await verifyEmail({ token: '' }).expect(400);

      expect((await findTokenRow(token))!.used_at).toBeNull();
      expect(await isVerified(user.id)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('accepts a valid token surrounded by whitespace', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      const res = await verifyEmail({ token: `  ${token}  ` }).expect(302);

      expect(res.headers.location).toBe(FRONTEND_URL);
      expect(await isVerified(user.id)).toBe(true);
    });

    it('lets only one of two concurrent requests with the same token succeed', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      const responses = await Promise.all([verifyEmail({ token }), verifyEmail({ token })]);
      const locations = responses.map((res) => res.headers.location).sort();

      expect(responses.every((res) => res.status === 302)).toBe(true);
      expect(locations).toEqual([FRONTEND_URL, errorRedirect('INVALID_VERIFICATION_TOKEN')].sort());
      expect(await isVerified(user.id)).toBe(true);
    });

    it('redirects with SERVER_ERROR and leaves the token unused on an unexpected failure', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(UserRepo, 'updateIsVerified').mockRejectedValueOnce(new Error('db is down'));

      const res = await verifyEmail({ token }).expect(302);

      expect(res.headers.location).toBe(errorRedirect('SERVER_ERROR'));
      expect(await isVerified(user.id)).toBe(false);
      expect((await findTokenRow(token))!.used_at).toBeNull();
    });
  });
});

import { describe, it, beforeEach, afterAll, afterEach, expect, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../../app.js';
import { pg } from '../../../lib/pg.js';
import { redisClient } from '../../../lib/redis.js';
import { hashString } from '../utils/hashing.js';
import { VerificationTokenRepo } from '../auth.repository.js';
import { UserRepo } from '../../user/user.repository.js';
import {
  clearThrottling,
  clearVerificationTokens,
  existingUser,
  loginAs,
  seedUser,
  randomIp,
} from './utils/utils.js';
import { expectErrorBody } from './utils/expects.js';

const ENDPOINT = '/api/auth/reset-password';
const NEW_PASSWORD = 'brand-new-password';

// Every request gets its own client IP so the per-IP rate limit doesn't leak between tests.
function resetPassword(body: unknown, ip = randomIp()) {
  return request(app)
    .post(ENDPOINT)
    .set('X-Forwarded-For', ip)
    .send(body as object);
}

function validBody(verificationToken: string, newPassword = NEW_PASSWORD) {
  return { verificationToken, newPassword, confirmPassword: newPassword };
}

async function seedToken(userId: string, subject = 'reset-password') {
  const token = crypto.randomBytes(32).toString('hex');

  await VerificationTokenRepo.create({
    tokenHash: hashString(token),
    userId,
    subject,
    ttlSeconds: 15 * 60,
  });

  return token;
}

function tokenKey(token: string) {
  return `verificationToken:${hashString(token)}:reset-password`;
}

async function tokenExists(token: string) {
  return (await redisClient.EXISTS(tokenKey(token))) === 1;
}

function login(email: string, password: string) {
  return request(app).post('/api/auth/login').send({ email, password });
}

function refresh(refreshToken: string) {
  return request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${refreshToken}`);
}

beforeEach(async () => {
  await clearThrottling();
  await clearVerificationTokens();
  await pg.query('TRUNCATE TABLE users CASCADE;');
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await clearThrottling();
  await clearVerificationTokens();
  await pg.query('TRUNCATE TABLE users CASCADE;');
  await pg.end();
  await redisClient.quit();
});

describe('POST /api/auth/reset-password', () => {
  describe('happy path', () => {
    it('returns 200 and replaces the password', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      const res = await resetPassword(validBody(token)).expect(200).expect('Content-Type', /json/);

      expect(res.body).toEqual({ message: 'Password has been reset' });
      await login(user.email, NEW_PASSWORD).expect(200);
      await login(user.email, existingUser.password).expect(401);
    });

    it('revokes existing sessions', async () => {
      const user = await seedUser();
      const { refreshToken } = await loginAs(user);
      const token = await seedToken(user.id);

      await resetPassword(validBody(token)).expect(200);

      await refresh(refreshToken).expect(401);
    });

    it('consumes the token', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      await resetPassword(validBody(token)).expect(200);

      expect(await tokenExists(token)).toBe(false);
    });
  });

  describe('invalid tokens', () => {
    it('rejects an unknown token and keeps the old password', async () => {
      const user = await seedUser();
      await seedToken(user.id);

      const res = await resetPassword(validBody(crypto.randomBytes(32).toString('hex'))).expect(
        400,
      );

      expectErrorBody(res.body);
      expect(res.body.errorCode).toBe('INVALID_VERIFICATION_TOKEN');
      await login(user.email, existingUser.password).expect(200);
    });

    it('rejects a token that has already been used', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);
      await resetPassword(validBody(token)).expect(200);

      const res = await resetPassword(validBody(token, 'another-password')).expect(400);

      expect(res.body.errorCode).toBe('INVALID_VERIFICATION_TOKEN');
      await login(user.email, NEW_PASSWORD).expect(200);
    });

    it('rejects an expired token', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);
      await redisClient.PEXPIRE(tokenKey(token), 1);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const res = await resetPassword(validBody(token)).expect(400);

      expect(res.body.errorCode).toBe('INVALID_VERIFICATION_TOKEN');
      await login(user.email, existingUser.password).expect(200);
    });

    it('rejects an email verification token', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id, 'email');

      const res = await resetPassword(validBody(token)).expect(400);

      expect(res.body.errorCode).toBe('INVALID_VERIFICATION_TOKEN');
      await login(user.email, existingUser.password).expect(200);
    });
  });

  describe('invalid payloads', () => {
    it('returns 400 and keeps the token when the passwords do not match', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      const res = await resetPassword({
        verificationToken: token,
        newPassword: NEW_PASSWORD,
        confirmPassword: 'something-else',
      })
        .expect(400)
        .expect('Content-Type', /json/);

      expectErrorBody(res.body, "Passwords don't match");
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
      expect(await tokenExists(token)).toBe(true);
    });

    it('returns 400 when the new password is too short', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      const res = await resetPassword(validBody(token, '123')).expect(400);

      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
      expect(await tokenExists(token)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('lets only one of two concurrent requests with the same token succeed', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);

      const responses = await Promise.all([
        resetPassword(validBody(token)),
        resetPassword(validBody(token, 'another-password')),
      ]);

      expect(responses.map((res) => res.status).sort()).toEqual([200, 400]);
    });

    it('returns 500 and keeps the old password on an unexpected failure', async () => {
      const user = await seedUser();
      const token = await seedToken(user.id);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(UserRepo, 'updatePassword').mockRejectedValueOnce(new Error('db is down'));

      const res = await resetPassword(validBody(token)).expect(500);

      expect(res.body.errorCode).toBe('SERVER_ERROR');
      await login(user.email, existingUser.password).expect(200);
    });
  });
});

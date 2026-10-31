import { describe, it, beforeEach, afterAll, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../../app.js';
import { pg } from '../../../lib/pg.js';
import { redisClient } from '../../../lib/redis.js';
import { UserRepo } from '../../user/user.repository.js';
import { clearThrottling, clearVerificationTokens, seedUser, randomIp } from './utils/utils.js';
import { expectErrorBody } from './utils/expects.js';
import { emailQueue } from '../../../jobs/queues/email.queue.js';

const ENDPOINT = '/api/auth/forgot-password';
const GENERIC_MESSAGE =
  "If an account with this email exists and is verified, we've sent a new password reset link.";

vi.mock('../../../jobs/queues/email.queue.ts', () => ({
  emailQueue: { add: vi.fn() },
}));
const addToQueueMock = vi.mocked(emailQueue.add);

// Every request gets its own client IP so the per-IP rate limit doesn't leak between tests.
function forgotPassword(body: unknown, ip = randomIp()) {
  return request(app)
    .post(ENDPOINT)
    .set('X-Forwarded-For', ip)
    .send(body as object);
}

function resetPassword(verificationToken: string, newPassword = 'brand-new-password') {
  return request(app)
    .post('/api/auth/reset-password')
    .set('X-Forwarded-For', randomIp())
    .send({ verificationToken, newPassword, confirmPassword: newPassword });
}

function sentToken(callIndex = 0) {
  return String(addToQueueMock.mock.calls[callIndex]![1].verificationToken);
}

async function seedVerifiedUser() {
  const user = await seedUser();
  await UserRepo.updateIsVerified(true, user.id);
  return user;
}

beforeEach(async () => {
  addToQueueMock.mockReset();
  await clearThrottling();
  await clearVerificationTokens();
  await pg.query('TRUNCATE TABLE users CASCADE;');
});

afterAll(async () => {
  await clearThrottling();
  await clearVerificationTokens();
  await pg.query('TRUNCATE TABLE users CASCADE;');
  await pg.end();
  await redisClient.quit();
});

describe('POST /api/auth/forgot-password', () => {
  describe('happy path', () => {
    it('returns 200 with a generic message and emails a reset link', async () => {
      const user = await seedVerifiedUser();

      const res = await forgotPassword({ email: user.email })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(res.body).toEqual({ message: GENERIC_MESSAGE });
      expect(addToQueueMock).toHaveBeenCalledOnce();
      expect(addToQueueMock).toHaveBeenCalledWith(
        'reset-password',
        expect.objectContaining({
          email: user.email,
          verificationToken: expect.any(String),
        }),
      );
    });

    it('sends a token that resets the password', async () => {
      const user = await seedVerifiedUser();

      await forgotPassword({ email: user.email }).expect(200);

      await resetPassword(sentToken()).expect(200);
    });

    it('invalidates the previously sent link', async () => {
      const user = await seedVerifiedUser();
      await forgotPassword({ email: user.email }).expect(200);
      const oldToken = sentToken(0);
      await clearThrottling();

      await forgotPassword({ email: user.email }).expect(200);
      const res = await resetPassword(oldToken).expect(400);

      expect(res.body.errorCode).toBe('INVALID_VERIFICATION_TOKEN');
      await resetPassword(sentToken(1)).expect(200);
    });
  });

  describe('account enumeration', () => {
    it('returns the same response without sending an email for an unknown email', async () => {
      await seedVerifiedUser();

      const res = await forgotPassword({ email: 'grace.hopper@example.com' }).expect(200);

      expect(res.body).toEqual({ message: GENERIC_MESSAGE });
      expect(addToQueueMock).not.toHaveBeenCalled();
    });

    it('returns the same response without sending an email for an unverified user', async () => {
      const user = await seedUser();

      const res = await forgotPassword({ email: user.email }).expect(200);

      expect(res.body).toEqual({ message: GENERIC_MESSAGE });
      expect(addToQueueMock).not.toHaveBeenCalled();
    });
  });

  describe('invalid payloads', () => {
    it('returns 400 when the email has an invalid format', async () => {
      const res = await forgotPassword({ email: 'not-an-email' })
        .expect(400)
        .expect('Content-Type', /json/);

      expectErrorBody(res.body, 'Invalid email format');
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
      expect(addToQueueMock).not.toHaveBeenCalled();
    });
  });

  describe('throttling', () => {
    it('returns 429 with retryAfter for a repeated request to the same email', async () => {
      const user = await seedVerifiedUser();
      await forgotPassword({ email: user.email }).expect(200);

      const res = await forgotPassword({ email: user.email }).expect(429);

      expectErrorBody(res.body);
      expect(res.body.retryAfter).toBeGreaterThan(0);
      expect(addToQueueMock).toHaveBeenCalledOnce();
    });
  });
});

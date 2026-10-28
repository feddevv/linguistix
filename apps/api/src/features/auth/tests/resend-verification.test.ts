import { describe, it, beforeEach, afterAll, expect, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../../app.js';
import { pg } from '../../../lib/pg.js';
import { redisClient } from '../../../lib/redis.js';
import { UserRepo } from '../../user/user.repository.js';
import { clearThrottling, existingUser, seedUser } from './utils/utils.js';
import { expectErrorBody } from './utils/expects.js';
import { emailQueue } from '../../../jobs/queues/email.queue.js';

const ENDPOINT = '/api/auth/resend-verification';
const GENERIC_MESSAGE =
  "If an account with this email exists and isn't verified yet, we've sent a new verification link.";

vi.mock('../../../jobs/queues/email.queue.ts', () => ({
  emailQueue: { add: vi.fn() },
}));
const addToQueueMock = vi.mocked(emailQueue.add);

function randomIp() {
  return `10.${crypto.randomInt(256)}.${crypto.randomInt(256)}.${crypto.randomInt(256)}`;
}

// Every request gets its own client IP so the per-IP rate limit doesn't leak between tests.
function resendVerification(body: unknown, ip = randomIp()) {
  return request(app)
    .post(ENDPOINT)
    .set('X-Forwarded-For', ip)
    .send(body as object);
}

function sentToken(callIndex = 0) {
  const { verificationToken } = addToQueueMock.mock.calls[callIndex]![1];
  return String(verificationToken).match(/([0-9a-f]+)/)![0]!;
}

function verifyEmail(token: string) {
  return request(app).get('/api/auth/verify-email').query({ token });
}

async function isVerified(userId: string) {
  return (await UserRepo.findUserById(userId))!.isVerified;
}

beforeEach(async () => {
  vi.stubEnv('FRONTEND_URL', 'http://localhost:5173/');
  addToQueueMock.mockReset();
  await clearThrottling();
  await pg.query('TRUNCATE TABLE users CASCADE;');
});

afterAll(async () => {
  await clearThrottling();
  await pg.query('TRUNCATE TABLE users CASCADE;');
  await pg.end();
  await redisClient.quit();
});

describe('POST /api/auth/resend-verification', () => {
  describe('happy path', () => {
    it('returns 200 with a generic message and emails a verification link', async () => {
      const user = await seedUser();

      const res = await resendVerification({ email: user.email })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(res.body).toEqual({ message: GENERIC_MESSAGE });
      expect(addToQueueMock).toHaveBeenCalledOnce();
      expect(addToQueueMock).toHaveBeenCalledWith(
        'email-verification',
        expect.objectContaining({
          email: user.email,
          verificationToken: expect.any(String),
        }),
      );
    });

    it('sends a link that verifies the email', async () => {
      const user = await seedUser();

      await resendVerification({ email: user.email }).expect(200);
      await verifyEmail(sentToken()).expect(302);

      expect(await isVerified(user.id)).toBe(true);
    });

    it('invalidates the previously sent link', async () => {
      const user = await seedUser();
      await resendVerification({ email: user.email }).expect(200);
      const oldToken = sentToken(0);
      await clearThrottling();

      await resendVerification({ email: user.email }).expect(200);
      await verifyEmail(oldToken).expect(302);

      expect(await isVerified(user.id)).toBe(false);
    });
  });

  describe('account enumeration', () => {
    it('returns the same response without sending an email for an unknown email', async () => {
      await seedUser();

      const res = await resendVerification({ email: 'grace.hopper@example.com' }).expect(200);

      expect(res.body).toEqual({ message: GENERIC_MESSAGE });
      expect(addToQueueMock).not.toHaveBeenCalled();
    });

    it('returns the same response without sending an email for an already verified user', async () => {
      const user = await seedUser();
      await UserRepo.updateIsVerified(true, user.id);

      const res = await resendVerification({ email: user.email }).expect(200);

      expect(res.body).toEqual({ message: GENERIC_MESSAGE });
      expect(addToQueueMock).not.toHaveBeenCalled();
    });
  });

  describe('invalid payloads', () => {
    it.each<[string, unknown, string | undefined]>([
      ['the email is missing', {}, 'Email is required'],
      ['the email has an invalid format', { email: 'not-an-email' }, 'Invalid email format'],
      ['the email is not a string', { email: 12345 }, undefined],
    ])('returns 400 when %s', async (_, body, message) => {
      const res = await resendVerification(body).expect(400).expect('Content-Type', /json/);

      expectErrorBody(res.body, message);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
      expect(addToQueueMock).not.toHaveBeenCalled();
    });
  });

  describe('throttling', () => {
    it('returns 429 with retryAfter for a repeated request to the same email', async () => {
      const user = await seedUser();
      await resendVerification({ email: user.email }).expect(200);

      const res = await resendVerification({ email: user.email }).expect(429);

      expectErrorBody(res.body);
      expect(res.body.retryAfter).toBeGreaterThan(0);
      expect(res.body.retryAfter).toBeLessThanOrEqual(60);
      expect(addToQueueMock).toHaveBeenCalledOnce();
    });

    it('does not throttle requests for different emails because of another email cooldown', async () => {
      await seedUser();
      const other = await seedUser({ email: 'grace.hopper@example.com' });
      await resendVerification({ email: existingUser.email }).expect(200);

      await resendVerification({ email: other.email }).expect(200);

      expect(addToQueueMock).toHaveBeenCalledTimes(2);
    });

    it('returns 429 once a single IP exceeds the request limit', async () => {
      const ip = randomIp();
      const emails = ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com'];

      for (const email of emails.slice(0, 3)) {
        await resendVerification({ email }, ip).expect(200);
      }
      const res = await resendVerification({ email: emails[3] }, ip).expect(429);

      expectErrorBody(res.body);
    });
  });
});

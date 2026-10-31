import { type Response } from 'supertest';
import request from 'supertest';
import { app } from '../../../../app.js';
import { redisClient } from '../../../../lib/redis.js';
import crypto from 'crypto';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getSetCookies(res: Response): string[] {
  const header = res.headers['set-cookie'];
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
}

export function getCookie(res: Response, name: string) {
  const raw = getSetCookies(res).find((cookie) => cookie.startsWith(`${name}=`));
  if (!raw) return undefined;

  const [pair, ...attributes] = raw.split(';').map((part) => part.trim());
  const value = decodeURIComponent(pair!.slice(name.length + 1));
  const attrs = new Map(
    attributes.map((attr) => {
      const [key, ...rest] = attr.split('=');
      return [key!.toLowerCase(), rest.join('=')] as const;
    }),
  );

  return { raw, value, attrs };
}

export async function loginAs(user: { email: string; password: string }) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);

  return {
    accessToken: getCookie(res, 'accessToken')!.value,
    refreshToken: getCookie(res, 'refreshToken')!.value,
  };
}

export async function clearThrottling() {
  const keys = [...(await redisClient.KEYS('cooldown:*')), ...(await redisClient.KEYS('rl:*'))];
  if (keys.length) await redisClient.DEL(keys);
}

export async function clearVerificationTokens() {
  const keys = await redisClient.KEYS('verificationToken:*');
  if (keys.length) await redisClient.DEL(keys);
}

export function randomIp() {
  return `10.${crypto.randomInt(256)}.${crypto.randomInt(256)}.${crypto.randomInt(256)}`;
}

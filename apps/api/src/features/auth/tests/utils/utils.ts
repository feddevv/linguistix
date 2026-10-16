import { hash } from 'bcrypt';
import { hashString } from '../../utils/hashing.js';
import { pg } from '../../../../db/pg.js';
import { type Response } from 'supertest';
import request from 'supertest';
import { app } from '../../../../app.js';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const existingUser = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada.lovelace@example.com',
  password: 'correct-horse-battery',
  role: 'student',
};

export async function seedUser(overrides: Partial<typeof existingUser> = {}) {
  const user = { ...existingUser, ...overrides };
  const sha256hash = hashString(user.password);
  const passwordHash = await hash(sha256hash, 10);

  const { rows } = await pg.query<{ id: string }>(
    `
      INSERT INTO users (first_name, last_name, email, password, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `,
    [user.firstName, user.lastName, user.email, passwordHash, user.role],
  );

  return { ...user, id: rows[0]!.id };
}

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

export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

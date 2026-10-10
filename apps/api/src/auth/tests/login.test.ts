import { describe, it, beforeEach, afterAll, expect } from 'vitest';
import request, { type Response } from 'supertest';
import { hash } from 'bcrypt';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { app } from '../../app.js';
import { pg } from '../../db/pg.js';
import { LoginInput } from '@repo/shared';
import { UUID_REGEX } from './utils.js';

const ENDPOINT = '/api/auth/login';
const INVALID_CREDENTIALS = 'Email or password is incorrect';

const ACCESS_TOKEN_TTL = 15 * 60;
const REFRESH_TOKEN_TTL = 15 * 24 * 60 * 60;

const existingUser = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada.lovelace@example.com',
  password: 'correct-horse-battery',
  role: 'student',
};

async function seedUser(overrides: Partial<typeof existingUser> = {}) {
  const user = { ...existingUser, ...overrides };
  const passwordHash = await hash(user.password, 10);

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

function buildCredentials(overrides: Partial<Record<keyof LoginInput, unknown>> = {}) {
  return {
    email: existingUser.email,
    password: existingUser.password,
    ...overrides,
  };
}

function login(body: unknown) {
  return request(app)
    .post(ENDPOINT)
    .send(body as object);
}

function getSetCookies(res: Response): string[] {
  const header = res.headers['set-cookie'];
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
}

function getCookie(res: Response, name: string) {
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

function verifyToken(token: string) {
  return jwt.verify(token, process.env.SECRET_KEY!) as JwtPayload;
}

function expectErrorBody(body: unknown, message?: string) {
  expect(body).toEqual({ message: message ?? expect.any(String) });
}

function expectNoAuthCookies(res: Response) {
  expect(getCookie(res, 'accessToken')).toBeUndefined();
  expect(getCookie(res, 'refreshToken')).toBeUndefined();
}

beforeEach(async () => {
  await pg.query('TRUNCATE TABLE users CASCADE;');
});

afterAll(async () => {
  await pg.query('TRUNCATE TABLE users CASCADE;');
  await pg.end();
});

describe('POST /api/auth/login', () => {
  describe('happy path', () => {
    it('returns 200 with the public user contract', async () => {
      const user = await seedUser();

      const res = await login(buildCredentials()).expect(200).expect('Content-Type', /json/);

      expect(res.body).toEqual({
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        },
      });
    });

    it('never exposes the password, its hash or the tokens in the response body', async () => {
      await seedUser();

      const res = await login(buildCredentials()).expect(200);

      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.body).not.toHaveProperty('refreshToken');
    });

    it('logs in a teacher and returns the teacher role', async () => {
      await seedUser({ role: 'teacher' });

      const res = await login(buildCredentials()).expect(200);

      expect(res.body.user.role).toBe('teacher');
    });

    it('logs in the right user when several users exist', async () => {
      await seedUser({
        email: 'grace.hopper@example.com',
        firstName: 'Grace',
        password: 'other-pass',
      });
      const ada = await seedUser();

      const res = await login(buildCredentials()).expect(200);

      expect(res.body.user.id).toBe(ada.id);
      expect(res.body.user.email).toBe(ada.email);
    });

    it('allows logging in repeatedly with the same credentials', async () => {
      await seedUser();

      await login(buildCredentials()).expect(200);
      await login(buildCredentials()).expect(200);
    });

    it('works end to end with a user created through the register endpoint', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ ...existingUser, confirmPassword: existingUser.password })
        .expect(201);

      const res = await login(buildCredentials()).expect(200);

      expect(res.body.user.email).toBe(existingUser.email);
    });
  });

  describe('session cookies', () => {
    it('sets an HttpOnly, SameSite=Lax accessToken cookie that lives 15 minutes', async () => {
      await seedUser();

      const res = await login(buildCredentials()).expect(200);
      const cookie = getCookie(res, 'accessToken');

      expect(cookie).toBeDefined();
      expect(cookie!.value).not.toBe('');
      expect(cookie!.attrs.has('httponly')).toBe(true);
      expect(cookie!.attrs.get('samesite')?.toLowerCase()).toBe('lax');
      expect(cookie!.attrs.get('max-age')).toBe(String(ACCESS_TOKEN_TTL));
    });

    it('sets an HttpOnly, SameSite=Lax refreshToken cookie that lives 15 days', async () => {
      await seedUser();

      const res = await login(buildCredentials()).expect(200);
      const cookie = getCookie(res, 'refreshToken');

      expect(cookie).toBeDefined();
      expect(cookie!.value).not.toBe('');
      expect(cookie!.attrs.has('httponly')).toBe(true);
      expect(cookie!.attrs.get('samesite')?.toLowerCase()).toBe('lax');
      expect(cookie!.attrs.get('max-age')).toBe(String(REFRESH_TOKEN_TTL));
    });

    it('issues a signed access token identifying the user that expires in 15 minutes', async () => {
      const user = await seedUser();

      const res = await login(buildCredentials()).expect(200);
      const payload = verifyToken(getCookie(res, 'accessToken')!.value);

      expect(payload).toMatchObject({ id: user.id, email: user.email, role: user.role });
      expect(payload.exp! - payload.iat!).toBe(ACCESS_TOKEN_TTL);
      expect(payload).not.toHaveProperty('password');
    });

    it('issues a signed refresh token identifying the user that expires in 15 days', async () => {
      const user = await seedUser();

      const res = await login(buildCredentials()).expect(200);
      const payload = verifyToken(getCookie(res, 'refreshToken')!.value);

      expect(payload).toMatchObject({ id: user.id, email: user.email, role: user.role });
      expect(payload.exp! - payload.iat!).toBe(REFRESH_TOKEN_TTL);
      expect(payload).not.toHaveProperty('password');
    });
  });

  describe('invalid credentials', () => {
    it('returns 401 when the password is wrong', async () => {
      await seedUser();

      const res = await login(buildCredentials({ password: 'wrong-password' }))
        .expect(401)
        .expect('Content-Type', /json/);

      expectErrorBody(res.body, INVALID_CREDENTIALS);
      expectNoAuthCookies(res);
    });

    it('returns 401 when no user has this email', async () => {
      await seedUser();

      const res = await login(buildCredentials({ email: 'nobody@example.com' })).expect(401);

      expectErrorBody(res.body, INVALID_CREDENTIALS);
      expectNoAuthCookies(res);
    });

    it('returns 401 when the database has no users at all', async () => {
      const res = await login(buildCredentials()).expect(401);

      expectErrorBody(res.body, INVALID_CREDENTIALS);
      expectNoAuthCookies(res);
    });

    it('does not reveal whether the email exists (same status and body for both cases)', async () => {
      await seedUser();

      const wrongPassword = await login(buildCredentials({ password: 'wrong-password' }));
      const unknownEmail = await login(buildCredentials({ email: 'nobody@example.com' }));

      expect(unknownEmail.status).toBe(wrongPassword.status);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    it('treats the password as case-sensitive', async () => {
      await seedUser();

      const res = await login(
        buildCredentials({ password: existingUser.password.toUpperCase() }),
      ).expect(401);

      expectErrorBody(res.body, INVALID_CREDENTIALS);
      expectNoAuthCookies(res);
    });

    it("rejects another user's password", async () => {
      await seedUser();
      await seedUser({ email: 'grace.hopper@example.com', password: 'grace-secret' });

      const res = await login(buildCredentials({ password: 'grace-secret' })).expect(401);

      expectErrorBody(res.body, INVALID_CREDENTIALS);
    });

    it('rejects the stored bcrypt hash used as the password', async () => {
      await seedUser();
      const { rows } = await pg.query<{ password: string }>(
        'SELECT password FROM users WHERE email = $1;',
        [existingUser.email],
      );

      const res = await login(buildCredentials({ password: rows[0]!.password })).expect(401);

      expectErrorBody(res.body, INVALID_CREDENTIALS);
    });
  });

  describe('invalid payloads', () => {
    it.each<[string, 'email' | 'password', string]>([
      ['email', 'email', 'Email is required'],
      ['password', 'password', 'Password is required'],
    ])('returns 400 when %s is missing', async (_, field, message) => {
      await seedUser();
      const credentials: Record<string, unknown> = buildCredentials();
      delete credentials[field];

      const res = await login(credentials).expect(400).expect('Content-Type', /json/);

      expectErrorBody(res.body, message);
      expectNoAuthCookies(res);
    });

    it.each<[string, Record<string, unknown>, string]>([
      ['email is null', { email: null }, 'Email is required'],
      ['email is an empty string', { email: '' }, 'Email is required'],
      ['password is null', { password: null }, 'Password is required'],
      ['password is an empty string', { password: '' }, 'Password is required'],
      ['email is a number', { email: 12345 }, 'Invalid email format'],
      ['email has no @', { email: 'not-an-email' }, 'Invalid email format'],
      ['email has no domain', { email: 'ada@' }, 'Invalid email format'],
      ['email has no TLD', { email: 'ada@example' }, 'Invalid email format'],
      ['email contains spaces', { email: 'ada lovelace@example.com' }, 'Invalid email format'],
      ['email is an array', { email: [existingUser.email] }, 'Invalid email format'],
      ['password is a number', { password: 12345678 }, 'Password should be a string'],
      [
        'password is an array',
        { password: [existingUser.password] },
        'Password should be a string',
      ],
      [
        'password is shorter than 6 characters',
        { password: 'a'.repeat(5) },
        'Password should be at least 6 characters long',
      ],
      [
        'password is whitespace only',
        { password: '      ' },
        'Password should be at least 6 characters long',
      ],
    ])('returns 400 when %s', async (_, overrides, message) => {
      await seedUser();

      const res = await login(buildCredentials(overrides)).expect(400);

      expectErrorBody(res.body, message);
      expectNoAuthCookies(res);
    });

    it('validates email before password and returns only the first error', async () => {
      const res = await login({ email: 'not-an-email', password: 'abc' }).expect(400);

      expectErrorBody(res.body, 'Invalid email format');
    });

    it('returns 400 for an empty JSON object', async () => {
      const res = await login({}).expect(400);

      expectErrorBody(res.body);
      expectNoAuthCookies(res);
    });

    it('returns 400 when no body is sent', async () => {
      const res = await request(app).post(ENDPOINT).expect(400);

      expectErrorBody(res.body);
      expectNoAuthCookies(res);
    });

    it('returns 400 when the body is a JSON array', async () => {
      const res = await login([buildCredentials()]).expect(400);

      expectErrorBody(res.body);
      expectNoAuthCookies(res);
    });

    it('returns 400 with a JSON error for malformed JSON', async () => {
      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .send('{"email": "ada.lovelace@example.com", "password": ')
        .expect(400)
        .expect('Content-Type', /json/);

      expectErrorBody(res.body);
      expectNoAuthCookies(res);
    });

    it('returns 413 for a body larger than 100 KB', async () => {
      const res = await login(buildCredentials({ password: 'a'.repeat(200 * 1024) })).expect(413);

      expectErrorBody(res.body);
      expectNoAuthCookies(res);
    });
  });

  describe('edge cases', () => {
    describe('email normalization', () => {
      it('treats the email as case-insensitive', async () => {
        const user = await seedUser();

        const res = await login(buildCredentials({ email: 'Ada.Lovelace@Example.COM' })).expect(
          200,
        );

        expect(res.body.user.id).toBe(user.id);
        expect(res.body.user.email).toBe(user.email);
      });

      it('does not trim the email, so surrounding whitespace is a validation error', async () => {
        await seedUser();

        const res = await login(buildCredentials({ email: ` ${existingUser.email} ` })).expect(400);

        expectErrorBody(res.body, 'Invalid email format');
        expectNoAuthCookies(res);
      });
    });

    describe('password normalization', () => {
      it('trims surrounding whitespace from the password before comparing', async () => {
        await seedUser();

        const res = await login(
          buildCredentials({ password: `  ${existingUser.password}\t\n` }),
        ).expect(200);

        expect(res.body.user.email).toBe(existingUser.email);
      });

      it('keeps inner whitespace significant', async () => {
        await seedUser({ password: 'correct horse battery' });

        const res = await login(buildCredentials({ password: 'correcthorsebattery' })).expect(401);

        expectErrorBody(res.body, INVALID_CREDENTIALS);
      });

      it('supports non-ASCII passwords', async () => {
        await seedUser({ password: 'пароль-密码-🔐' });

        await login(buildCredentials({ password: 'пароль-密码-🔐' })).expect(200);
      });
    });

    describe('length boundaries', () => {
      it('accepts a password of exactly 6 characters (minimum)', async () => {
        await seedUser({ password: 'abcdef' });

        await login(buildCredentials({ password: 'abcdef' })).expect(200);
      });

      it('rejects a 256-character password with 400 before hitting bcrypt', async () => {
        await seedUser();

        const res = await login(buildCredentials({ password: 'a'.repeat(256) })).expect(400);

        expectErrorBody(res.body, 'Password should not exceed 255 characters');
      });

      it('rejects an email longer than 255 characters with 400', async () => {
        const email = 'a'.repeat(256 - '@example.com'.length) + '@example.com';

        const res = await login(buildCredentials({ email })).expect(400);

        expectErrorBody(res.body, 'Email should not exceed 255 characters');
      });

      it('does not accept a long password that only matches the first 72 bytes (bcrypt truncation)', async () => {
        const prefix = 'a'.repeat(72);
        await seedUser({ password: `${prefix}-real-suffix` });

        const res = await login(buildCredentials({ password: `${prefix}-other-suffix` })).expect(
          401,
        );

        expectErrorBody(res.body, INVALID_CREDENTIALS);
      });
    });

    describe('extra unexpected fields', () => {
      it('ignores unknown properties', async () => {
        const user = await seedUser();

        const res = await login({ ...buildCredentials(), role: 'teacher', id: 'x' }).expect(200);

        expect(res.body.user.id).toBe(user.id);
        expect(res.body.user.role).toBe('student');
      });
    });
  });
});

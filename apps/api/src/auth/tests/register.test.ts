import { describe, it, beforeEach, afterAll, expect } from 'vitest';
import request from 'supertest';
import { compare } from 'bcrypt';
import type { RegisterInput } from '@repo/shared';
import { app } from '../../app.js';
import { pg } from '../../db/pg.js';

const ENDPOINT = '/api/auth/register';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildUser(overrides: Partial<Record<keyof RegisterInput, unknown>> = {}) {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada.lovelace@example.com',
    password: 'correct-horse-battery',
    role: 'student',
    ...overrides,
  };
}

function register(body: unknown) {
  return request(app)
    .post(ENDPOINT)
    .send(body as object);
}

async function countUsers() {
  const { rows } = await pg.query<{ count: string }>('SELECT COUNT(*) FROM users;');
  return Number(rows[0]!.count);
}

async function findUserByEmail(email: string) {
  const { rows } = await pg.query('SELECT * FROM users WHERE email = $1;', [email]);
  return rows[0];
}

// Builds a syntactically valid email of exactly `length` characters.
function emailOfLength(length: number) {
  const suffix = '@example.com';
  return 'a'.repeat(length - suffix.length) + suffix;
}

function expectErrorBody(body: unknown, message?: string) {
  expect(body).toEqual({ message: message ?? expect.any(String) });
}

beforeEach(async () => {
  await pg.query('TRUNCATE TABLE users CASCADE;');
});

afterAll(async () => {
  await pg.query('TRUNCATE TABLE users CASCADE;');
  await pg.end();
});

describe('POST /api/auth/register', () => {
  describe('happy path', () => {
    it('returns 201 with the public user contract', async () => {
      const user = buildUser();

      const res = await register(user).expect(201).expect('Content-Type', /json/);

      expect(res.body).toEqual({
        id: expect.stringMatching(UUID_REGEX),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      });
    });

    it('never exposes the password or its hash in the response', async () => {
      const user = buildUser();

      const res = await register(user).expect(201);

      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('persists the user with a bcrypt hash instead of the plain-text password', async () => {
      const user = buildUser();

      const res = await register(user).expect(201);
      const row = await findUserByEmail(user.email as string);

      expect(row).toBeDefined();
      expect(row.id).toBe(res.body.id);
      expect(row.first_name).toBe(user.firstName);
      expect(row.last_name).toBe(user.lastName);
      expect(row.role).toBe(user.role);
      expect(row.password).not.toBe(user.password);
      expect(await compare(user.password as string, row.password)).toBe(true);
      expect(await compare('wrong-password', row.password)).toBe(false);
    });
  });

  describe('duplicate email', () => {
    it('returns 409 when the email is already registered', async () => {
      const user = buildUser();
      await register(user).expect(201);

      const res = await register(user).expect(409);

      expectErrorBody(res.body, 'User with this email already exists');
      expect(await countUsers()).toBe(1);
    });

    it('returns 409 even when all other fields differ', async () => {
      await register(buildUser()).expect(201);

      const res = await register(
        buildUser({
          firstName: 'Grace',
          lastName: 'Hopper',
          password: 'another-password',
          role: 'teacher',
        }),
      ).expect(409);

      expectErrorBody(res.body, 'User with this email already exists');
      expect(await countUsers()).toBe(1);
    });

    it('treats emails as case-insensitive when checking uniqueness', async () => {
      await register(buildUser({ email: 'ada.lovelace@example.com' })).expect(201);

      const res = await register(buildUser({ email: 'Ada.Lovelace@Example.COM' })).expect(409);

      expectErrorBody(res.body, 'User with this email already exists');
      expect(await countUsers()).toBe(1);
    });
  });

  describe('invalid payloads', () => {
    it.each<[string, keyof RegisterInput, string]>([
      ['firstName', 'firstName', 'First name is required'],
      ['lastName', 'lastName', 'Last name is required'],
      ['email', 'email', 'Email is required'],
      ['password', 'password', 'Password is required'],
      ['role', 'role', 'Role is required'],
    ])('returns 400 when %s is missing', async (_, field, message) => {
      const user = buildUser();
      delete (user as Record<string, unknown>)[field];

      const res = await register(user).expect(400).expect('Content-Type', /json/);

      expectErrorBody(res.body, message);
      expect(await countUsers()).toBe(0);
    });

    it.each<[string, Record<string, unknown>, string]>([
      ['firstName is a number', { firstName: 12345 }, 'First name should be a string'],
      ['lastName is an object', { lastName: { name: 'x' } }, 'Last name should be a string'],
      ['password is a number', { password: 12345678 }, 'Password should be a string'],
      ['email is a number', { email: 12345 }, 'Invalid email format'],
      ['email has no @', { email: 'not-an-email' }, 'Invalid email format'],
      ['email has no domain', { email: 'ada@' }, 'Invalid email format'],
      ['email has no TLD', { email: 'ada@example' }, 'Invalid email format'],
      ['email contains spaces', { email: 'ada lovelace@example.com' }, 'Invalid email format'],
      ['role is unknown', { role: 'admin' }, "Role 'admin' doesn't exist"],
      ['role has wrong casing', { role: 'Teacher' }, "Role 'Teacher' doesn't exist"],
      ['firstName is blank', { firstName: '' }, 'First name should be at least 2 characters long'],
      [
        'firstName is whitespace only',
        { firstName: '     ' },
        'First name should be at least 2 characters long',
      ],
      ['lastName is blank', { lastName: '' }, 'Last name should be at least 2 characters long'],
    ])('returns 400 when %s', async (_, overrides, message) => {
      const res = await register(buildUser(overrides)).expect(400);

      expectErrorBody(res.body, message);
      expect(await countUsers()).toBe(0);
    });

    it('returns 400 for null field values', async () => {
      const res = await register(buildUser({ email: null })).expect(400);

      expectErrorBody(res.body);
      expect(await countUsers()).toBe(0);
    });

    it('returns 400 for an empty JSON object', async () => {
      const res = await register({}).expect(400);

      expectErrorBody(res.body);
      expect(await countUsers()).toBe(0);
    });

    it('returns 400 when no body is sent', async () => {
      const res = await request(app).post(ENDPOINT).expect(400);

      expectErrorBody(res.body);
      expect(await countUsers()).toBe(0);
    });
  });

  describe('edge cases', () => {
    describe('password length boundaries', () => {
      it('accepts a password of exactly 6 characters (minimum)', async () => {
        const password = 'a'.repeat(6);

        await register(buildUser({ password })).expect(201);

        const row = await findUserByEmail('ada.lovelace@example.com');
        expect(await compare(password, row.password)).toBe(true);
      });

      it('rejects a password of 5 characters', async () => {
        const res = await register(buildUser({ password: 'a'.repeat(5) })).expect(400);

        expectErrorBody(res.body, 'Password should be at least 6 characters long');
        expect(await countUsers()).toBe(0);
      });

      it('rejects a password that only reaches 6 characters through surrounding whitespace', async () => {
        const res = await register(buildUser({ password: '  abc  ' })).expect(400);

        expectErrorBody(res.body, 'Password should be at least 6 characters long');
        expect(await countUsers()).toBe(0);
      });

      it('accepts a password of exactly 255 characters (maximum)', async () => {
        await register(buildUser({ password: 'a'.repeat(255) })).expect(201);

        expect(await countUsers()).toBe(1);
      });

      it('rejects a password of 256 characters', async () => {
        const res = await register(buildUser({ password: 'a'.repeat(256) })).expect(400);

        expectErrorBody(res.body, 'Password should not exceed 255 characters');
        expect(await countUsers()).toBe(0);
      });
    });

    describe('name length boundaries', () => {
      it('accepts names of exactly 2 characters (minimum)', async () => {
        const res = await register(buildUser({ firstName: 'Al', lastName: 'Li' })).expect(201);

        expect(res.body.firstName).toBe('Al');
        expect(res.body.lastName).toBe('Li');
      });

      it('rejects a 1-character first name', async () => {
        const res = await register(buildUser({ firstName: 'A' })).expect(400);

        expectErrorBody(res.body, 'First name should be at least 2 characters long');
      });

      it('accepts names of exactly 100 characters (maximum)', async () => {
        const name = 'a'.repeat(100);

        const res = await register(buildUser({ firstName: name, lastName: name })).expect(201);

        expect(res.body.firstName).toBe(name);
        expect(res.body.lastName).toBe(name);
      });

      it('rejects a 101-character last name with 400 instead of a database error', async () => {
        const res = await register(buildUser({ lastName: 'a'.repeat(101) })).expect(400);

        expectErrorBody(res.body, 'Last name should not exceed 100 characters');
        expect(await countUsers()).toBe(0);
      });

      it('rejects name with the length of 1 but with whitespaces', async () => {
        await register(buildUser({ firstName: '  A  ', lastName: '\tLovelace\n' })).expect(400);
        expect(await countUsers()).toBe(0);
      });
    });

    describe('email length boundaries', () => {
      it('accepts an email of exactly 255 characters (maximum)', async () => {
        const email = emailOfLength(255);

        const res = await register(buildUser({ email })).expect(201);

        expect(res.body.email).toBe(email);
      });

      it('rejects an email of 256 characters with 400 instead of a database error', async () => {
        const res = await register(buildUser({ email: emailOfLength(256) })).expect(400);

        expectErrorBody(res.body, 'Email should not exceed 255 characters');
        expect(await countUsers()).toBe(0);
      });
    });

    describe('extra unexpected fields', () => {
      it('does not allow the client to choose the user id', async () => {
        const forcedId = '00000000-0000-7000-8000-000000000000';

        const res = await register({ ...buildUser(), id: forcedId }).expect(201);

        expect(res.body.id).not.toBe(forcedId);
        const { rows } = await pg.query('SELECT id FROM users WHERE id = $1;', [forcedId]);
        expect(rows).toHaveLength(0);
      });
    });
  });
});

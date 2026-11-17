import { describe, it, beforeEach, afterAll, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { app } from '../../../app.js';
import { pg } from '../../../lib/pg.js';
import {
  clearRefreshTokens,
  clearThrottling,
  loginAs,
  UUID_REGEX,
} from '../../auth/tests/utils/utils.js';
import { seedUser } from '../../auth/tests/utils/seeds.js';

const ENDPOINT = '/api/rooms';

vi.mock('../../../lib/transporter.ts', () => ({
  transporter: { sendMail: () => {} },
}));

const teacherData = {
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace.hopper@example.com',
  password: 'cobol-forever-1959',
  role: 'teacher',
};

async function seedTeacher() {
  const teacher = await seedUser(teacherData);
  const { accessToken } = await loginAs(teacher);
  return { teacher, accessToken };
}

async function seedStudent(n: number) {
  return seedUser({
    firstName: `Student${n}`,
    lastName: 'Test',
    email: `student${n}@example.com`,
    role: 'student',
  });
}

function createRoom(body: unknown, accessToken?: string) {
  const req = request(app).post(ENDPOINT);
  if (accessToken) req.set('Cookie', `accessToken=${accessToken}`);
  return req.send(body as object);
}

async function getMemberIds(roomId: string) {
  const { rows } = await pg.query<{ user_id: string }>(
    'SELECT user_id FROM room_members WHERE room_id = $1',
    [roomId],
  );
  return rows.map((r) => r.user_id).sort();
}

async function countRooms() {
  const { rows } = await pg.query('SELECT COUNT(*) FROM rooms');
  return Number(rows[0].count);
}

beforeEach(async () => {
  await clearThrottling();
  await clearRefreshTokens();
  await pg.query('TRUNCATE TABLE users CASCADE;');
});

afterAll(async () => {
  await clearRefreshTokens();
  await pg.query('TRUNCATE TABLE users CASCADE;');
  await pg.end();
});

describe('POST /api/rooms', () => {
  describe('happy path', () => {
    it('creates a room with only the owner as member when no users are given', async () => {
      const { teacher, accessToken } = await seedTeacher();

      const res = await createRoom({ roomName: 'B2 English' }, accessToken)
        .expect(201)
        .expect('Content-Type', /json/);

      expect(res.body).toEqual({
        room: {
          id: expect.stringMatching(UUID_REGEX),
          roomName: 'B2 English',
          meetingUrl: null,
          ownerId: teacher.id,
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          memberIds: [teacher.id],
        },
      });

      expect(await getMemberIds(res.body.room.id)).toEqual([teacher.id]);
    });

    it('adds the given users and the owner as members', async () => {
      const { teacher, accessToken } = await seedTeacher();
      const s1 = await seedStudent(1);
      const s2 = await seedStudent(2);

      const res = await createRoom(
        { roomName: 'German A1', users: [s1.id, s2.id] },
        accessToken,
      ).expect(201);

      const expected = [teacher.id, s1.id, s2.id].sort();
      expect([...res.body.room.memberIds].sort()).toEqual(expected);
      expect(await getMemberIds(res.body.room.id)).toEqual(expected);
    });

    it('collapses duplicate user ids and the owner id', async () => {
      const { teacher, accessToken } = await seedTeacher();
      const s1 = await seedStudent(1);

      const res = await createRoom(
        { roomName: 'Dupes', users: [s1.id, s1.id, teacher.id] },
        accessToken,
      ).expect(201);

      expect(await getMemberIds(res.body.room.id)).toEqual([teacher.id, s1.id].sort());
    });

    it('stores the meeting url when provided', async () => {
      const { accessToken } = await seedTeacher();

      const res = await createRoom(
        { roomName: 'Spanish', meetingUrl: 'https://meet.example.com/abc' },
        accessToken,
      ).expect(201);

      expect(res.body.room.meetingUrl).toBe('https://meet.example.com/abc');
      const { rows } = await pg.query('SELECT meeting_url FROM rooms WHERE id = $1', [
        res.body.room.id,
      ]);
      expect(rows[0].meeting_url).toBe('https://meet.example.com/abc');
    });

    it('trims the room name', async () => {
      const { accessToken } = await seedTeacher();

      const res = await createRoom({ roomName: '  French  ' }, accessToken).expect(201);

      expect(res.body.room.roomName).toBe('French');
    });
  });

  describe('authentication & authorization', () => {
    it('returns 401 UNAUTHORIZED without an access token', async () => {
      const res = await createRoom({ roomName: 'X' }).expect(401);

      expect(res.body).toEqual({ errorCode: 'UNAUTHORIZED', message: expect.any(String) });
    });

    it('returns 401 INVALID_TOKEN for a malformed token', async () => {
      const res = await createRoom({ roomName: 'X' }, 'not-a-jwt').expect(401);

      expect(res.body.errorCode).toBe('INVALID_TOKEN');
    });

    it('returns 401 INVALID_TOKEN for a token signed with another secret', async () => {
      const forged = jwt.sign(
        { id: crypto.randomUUID(), email: 'x@example.com', role: 'teacher' },
        'wrong-secret',
      );

      const res = await createRoom({ roomName: 'X' }, forged).expect(401);

      expect(res.body.errorCode).toBe('INVALID_TOKEN');
    });

    it('returns 401 INVALID_TOKEN for an expired token', async () => {
      const expired = jwt.sign(
        { id: crypto.randomUUID(), email: 'x@example.com', role: 'teacher' },
        process.env.SECRET_KEY!,
        { expiresIn: -10 },
      );

      const res = await createRoom({ roomName: 'X' }, expired).expect(401);

      expect(res.body.errorCode).toBe('INVALID_TOKEN');
    });

    it('returns 403 FORBIDDEN for a student', async () => {
      const student = await seedStudent(1);
      const { accessToken } = await loginAs(student);

      const res = await createRoom({ roomName: 'X' }, accessToken).expect(403);

      expect(res.body.errorCode).toBe('FORBIDDEN');
      expect(await countRooms()).toBe(0);
    });

    it('returns 404 USER_NOT_FOUND when the owner no longer exists', async () => {
      const token = jwt.sign(
        { id: crypto.randomUUID(), email: 'ghost@example.com', role: 'teacher' },
        process.env.SECRET_KEY!,
        { expiresIn: '15m' },
      );

      const res = await createRoom({ roomName: 'X' }, token).expect(404);

      expect(res.body.errorCode).toBe('USER_NOT_FOUND');
      expect(await countRooms()).toBe(0);
    });
  });

  describe('validation', () => {
    it.each([
      ['missing roomName', {}],
      ['empty roomName', { roomName: '' }],
      ['whitespace roomName', { roomName: '   ' }],
      ['non-string roomName', { roomName: 42 }],
      ['too long roomName', { roomName: 'a'.repeat(101) }],
      ['invalid meetingUrl', { roomName: 'X', meetingUrl: 'not a url' }],
      ['non-http meetingUrl', { roomName: 'X', meetingUrl: 'javascript:alert(1)' }],
      ['users not an array', { roomName: 'X', users: 'abc' }],
      ['non-uuid in users', { roomName: 'X', users: ['123'] }],
    ])('returns 400 VALIDATION_ERROR for %s', async (_label, body) => {
      const { accessToken } = await seedTeacher();

      const res = await createRoom(body, accessToken).expect(400);

      expect(res.body).toEqual({ errorCode: 'VALIDATION_ERROR', message: expect.any(String) });
      expect(await countRooms()).toBe(0);
    });
  });

  describe('unknown users', () => {
    it('returns 404 and rolls back the room when a user does not exist', async () => {
      const { accessToken } = await seedTeacher();
      const s1 = await seedStudent(1);

      const res = await createRoom(
        { roomName: 'X', users: [s1.id, crypto.randomUUID()] },
        accessToken,
      ).expect(404);

      expect(res.body.errorCode).toBe('USER_NOT_FOUND');
      expect(await countRooms()).toBe(0);
      const { rows } = await pg.query('SELECT COUNT(*) FROM room_members');
      expect(Number(rows[0].count)).toBe(0);
    });
  });
});

import { describe, it, beforeEach, afterAll, expect, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../../app.js';
import { pg } from '../../../lib/pg.js';
import { clearRefreshTokens, clearThrottling, loginAs } from '../../auth/tests/utils/utils.js';
import { seedUser } from '../../auth/tests/utils/seeds.js';

vi.mock('../../../lib/transporter.ts', () => ({
  transporter: { sendMail: () => {} },
}));

const endpoint = (roomId: string) => `/api/rooms/${roomId}/members`;

async function seedTeacher(n = 1) {
  const teacher = await seedUser({
    firstName: `Teacher${n}`,
    lastName: 'Test',
    email: `teacher${n}@example.com`,
    password: 'cobol-forever-1959',
    role: 'teacher',
  });
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

async function seedRoom(accessToken: string) {
  const res = await request(app)
    .post('/api/rooms')
    .set('Cookie', `accessToken=${accessToken}`)
    .send({ roomName: 'B2 English' })
    .expect(201);
  return res.body.room as { id: string; ownerId: string };
}

function addMember(roomId: string, body: unknown, accessToken?: string) {
  const req = request(app).post(endpoint(roomId));
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

describe('POST /api/rooms/:id/members', () => {
  describe('happy path', () => {
    it('adds the user and returns the full room', async () => {
      const { teacher, accessToken } = await seedTeacher();
      const room = await seedRoom(accessToken);
      const s1 = await seedStudent(1);

      const res = await addMember(room.id, { userId: s1.id }, accessToken)
        .expect(201)
        .expect('Content-Type', /json/);

      expect(res.body).toEqual({
        room: {
          id: room.id,
          roomName: 'B2 English',
          meetingUrl: null,
          ownerId: teacher.id,
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          memberIds: [teacher.id, s1.id],
        },
      });
      expect(await getMemberIds(room.id)).toEqual([teacher.id, s1.id].sort());
    });

    it('allows adding a user of any role', async () => {
      const { accessToken } = await seedTeacher(1);
      const { teacher: other } = await seedTeacher(2);
      const room = await seedRoom(accessToken);

      const res = await addMember(room.id, { userId: other.id }, accessToken).expect(201);

      expect(res.body.room.memberIds).toContain(other.id);
    });
  });

  describe('authentication & authorization', () => {
    it('returns 401 UNAUTHORIZED without an access token', async () => {
      const res = await addMember(crypto.randomUUID(), { userId: crypto.randomUUID() }).expect(401);

      expect(res.body).toEqual({ errorCode: 'UNAUTHORIZED', message: expect.any(String) });
    });

    it('returns 401 INVALID_TOKEN for a malformed token', async () => {
      const res = await addMember(
        crypto.randomUUID(),
        { userId: crypto.randomUUID() },
        'not-a-jwt',
      ).expect(401);

      expect(res.body.errorCode).toBe('INVALID_TOKEN');
    });

    it('returns 403 FORBIDDEN for a student', async () => {
      const { accessToken: teacherToken } = await seedTeacher();
      const room = await seedRoom(teacherToken);
      const s1 = await seedStudent(1);
      const { accessToken } = await loginAs(s1);

      const res = await addMember(room.id, { userId: s1.id }, accessToken).expect(403);

      expect(res.body.errorCode).toBe('FORBIDDEN');
      expect(await getMemberIds(room.id)).not.toContain(s1.id);
    });

    it('returns 403 FORBIDDEN for a teacher who does not own the room', async () => {
      const { accessToken: ownerToken } = await seedTeacher(1);
      const { accessToken: otherToken } = await seedTeacher(2);
      const room = await seedRoom(ownerToken);
      const s1 = await seedStudent(1);

      const res = await addMember(room.id, { userId: s1.id }, otherToken).expect(403);

      expect(res.body.errorCode).toBe('FORBIDDEN');
      expect(await getMemberIds(room.id)).not.toContain(s1.id);
    });
  });

  describe('validation', () => {
    it('returns 400 VALIDATION_ERROR for a malformed room id', async () => {
      const { accessToken } = await seedTeacher();

      const res = await addMember(
        'not-a-uuid',
        { userId: crypto.randomUUID() },
        accessToken,
      ).expect(400);

      expect(res.body).toEqual({ errorCode: 'VALIDATION_ERROR', message: 'Invalid room id' });
    });

    it.each([
      ['missing userId', {}],
      ['non-uuid userId', { userId: '123' }],
      ['non-string userId', { userId: 42 }],
    ])('returns 400 VALIDATION_ERROR for %s', async (_label, body) => {
      const { teacher, accessToken } = await seedTeacher();
      const room = await seedRoom(accessToken);

      const res = await addMember(room.id, body, accessToken).expect(400);

      expect(res.body).toEqual({ errorCode: 'VALIDATION_ERROR', message: expect.any(String) });
      expect(await getMemberIds(room.id)).toEqual([teacher.id]);
    });
  });

  describe('not found', () => {
    it('returns 404 ROOM_NOT_FOUND for an unknown room', async () => {
      const { accessToken } = await seedTeacher();
      const s1 = await seedStudent(1);

      const res = await addMember(crypto.randomUUID(), { userId: s1.id }, accessToken).expect(404);

      expect(res.body.errorCode).toBe('ROOM_NOT_FOUND');
    });

    it('returns 404 USER_NOT_FOUND for an unknown user', async () => {
      const { teacher, accessToken } = await seedTeacher();
      const room = await seedRoom(accessToken);

      const res = await addMember(room.id, { userId: crypto.randomUUID() }, accessToken).expect(
        404,
      );

      expect(res.body.errorCode).toBe('USER_NOT_FOUND');
      expect(await getMemberIds(room.id)).toEqual([teacher.id]);
    });
  });

  describe('conflicts', () => {
    it('returns 409 ALREADY_MEMBER when the user is already a member', async () => {
      const { teacher, accessToken } = await seedTeacher();
      const room = await seedRoom(accessToken);
      const s1 = await seedStudent(1);
      await addMember(room.id, { userId: s1.id }, accessToken).expect(201);

      const res = await addMember(room.id, { userId: s1.id }, accessToken).expect(409);

      expect(res.body.errorCode).toBe('ALREADY_MEMBER');
      expect(await getMemberIds(room.id)).toEqual([teacher.id, s1.id].sort());
    });

    it('returns 409 ALREADY_MEMBER when adding the owner', async () => {
      const { teacher, accessToken } = await seedTeacher();
      const room = await seedRoom(accessToken);

      const res = await addMember(room.id, { userId: teacher.id }, accessToken).expect(409);

      expect(res.body.errorCode).toBe('ALREADY_MEMBER');
    });
  });
});

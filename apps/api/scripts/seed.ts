/**
 * Dev seed: users, rooms, room_members.
 * Idempotent — safe to re-run (conflicts on email / invite_code / membership are skipped).
 * Every seeded user's password is SEED_PASSWORD.
 */
import { hash } from 'bcrypt';
import { pg } from '../src/lib/pg.js';
import { hashString } from '../src/features/auth/utils/hashing.js';

const SEED_PASSWORD = 'password123';

const users = [
  { firstName: 'Anna', lastName: 'Ivanova', email: 'anna.teacher@example.com', role: 'teacher' },
  { firstName: 'Mark', lastName: 'Novak', email: 'mark.teacher@example.com', role: 'teacher' },
  { firstName: 'Liam', lastName: 'Smith', email: 'liam@example.com', role: 'student' },
  { firstName: 'Olivia', lastName: 'Brown', email: 'olivia@example.com', role: 'student' },
  { firstName: 'Noah', lastName: 'Garcia', email: 'noah@example.com', role: 'student' },
  { firstName: 'Emma', lastName: 'Müller', email: 'emma@example.com', role: 'student' },
  { firstName: 'Lucas', lastName: 'Rossi', email: 'lucas@example.com', role: 'student' },
  { firstName: 'Sofia', lastName: 'Petrova', email: 'sofia@example.com', role: 'student' },
] as const;

const rooms = [
  {
    roomName: 'English B1 — Evening group',
    meetingUrl: 'https://meet.example.com/eng-b1',
    owner: 'anna.teacher@example.com',
    inviteCode: 'a1b2c3d4',
    members: ['liam@example.com', 'olivia@example.com', 'noah@example.com'],
  },
  {
    roomName: 'IELTS Speaking prep',
    meetingUrl: null,
    owner: 'anna.teacher@example.com',
    inviteCode: 'e5f6a7b8',
    members: ['olivia@example.com', 'emma@example.com'],
  },
  {
    roomName: 'German A2',
    meetingUrl: 'https://meet.example.com/de-a2',
    owner: 'mark.teacher@example.com',
    inviteCode: 'c9d0e1f2',
    members: ['lucas@example.com', 'sofia@example.com', 'noah@example.com', 'emma@example.com'],
  },
  {
    roomName: 'Private lessons — Sofia',
    meetingUrl: null,
    owner: 'mark.teacher@example.com',
    inviteCode: '3a4b5c6d',
    members: ['sofia@example.com'],
  },
];

async function main() {
  const passwordHash = await hash(hashString(SEED_PASSWORD), 10);
  const client = await pg.connect();

  try {
    await client.query('BEGIN');

    for (const u of users) {
      await client.query(
        `
          INSERT INTO users (first_name, last_name, email, password, role, is_verified)
          VALUES ($1, $2, $3, $4, $5, TRUE)
          ON CONFLICT (email) DO NOTHING;
        `,
        [u.firstName, u.lastName, u.email, passwordHash, u.role],
      );
    }

    const { rows } = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email = ANY($1);`,
      [users.map((u) => u.email)],
    );
    const idByEmail = new Map(rows.map((r) => [r.email, r.id]));

    for (const r of rooms) {
      await client.query(
        `
          INSERT INTO rooms (room_name, meeting_url, owner_id, invite_code)
          SELECT $1, $2, $3::uuid, $4::varchar
          WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE invite_code = $4::varchar);
        `,
        [r.roomName, r.meetingUrl, idByEmail.get(r.owner), r.inviteCode],
      );

      // Owner is a member too, matching createRoom() in rooms.service.ts
      const memberIds = [r.owner, ...r.members].map((e) => idByEmail.get(e));
      await client.query(
        `
          INSERT INTO room_members (user_id, room_id)
          SELECT unnest($1::uuid[]), (SELECT id FROM rooms WHERE invite_code = $2)
          ON CONFLICT (user_id, room_id) DO NOTHING;
        `,
        [memberIds, r.inviteCode],
      );
    }

    await client.query('COMMIT');
    console.log(
      `Seeded ${users.length} users, ${rooms.length} rooms. Password for all: ${SEED_PASSWORD}`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

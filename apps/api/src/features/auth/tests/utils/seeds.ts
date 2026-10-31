import { hash } from 'bcrypt';
import { hashString } from '../../utils/hashing.js';
import { pg } from '../../../../lib/pg.js';
import crypto from 'crypto';
import { VerificationTokenRepo } from '../../auth.repository.js';

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

export async function seedToken(userId: string, subject = 'reset-password') {
  const token = crypto.randomBytes(32).toString('hex');

  await VerificationTokenRepo.create({
    tokenHash: hashString(token),
    userId,
    subject,
    ttlSeconds: 15 * 60,
  });

  return token;
}

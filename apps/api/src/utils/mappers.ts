import type { UserDomain, UserRow } from '../auth/auth.types.js';

export function toUserDomain(userRow: UserRow): UserDomain {
  return {
    id: userRow.id,
    firstName: userRow.first_name,
    lastName: userRow.last_name,
    email: userRow.email,
    password: userRow.password,
    createdAt: userRow.created_at,
    role: userRow.role,
  };
}

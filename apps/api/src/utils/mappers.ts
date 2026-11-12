import type { UserDomain, UserRow } from '../features/user/user.types.js';

export function toUserDomain(data: UserRow): UserDomain {
  return {
    id: data.id,
    googleId: data.google_id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    password: data.password,
    createdAt: data.created_at,
    role: data.role,
    isVerified: data.is_verified,
  };
}

export function toUserDomainList(data: UserRow[]): UserDomain[] {
  return data.map((row) => toUserDomain(row));
}

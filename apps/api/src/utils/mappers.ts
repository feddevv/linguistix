import type { UserDomain, UserRow } from '../features/user/user.types.js';
import type { RoomDomain, RoomRow } from '../features/rooms/rooms.types.js';

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

export function toRoomDomain(data: RoomRow): RoomDomain {
  return {
    id: data.id,
    roomName: data.room_name,
    meetingUrl: data.meeting_url,
    ownerId: data.owner_id,
    createdAt: data.created_at,
  };
}

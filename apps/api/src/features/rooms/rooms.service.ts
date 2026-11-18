import type { AddRoomMemberInput, CreateRoomInput } from '@repo/shared';
import { AppError } from '../../errors/AppError.js';
import { pg } from '../../lib/pg.js';
import { RoomRepo } from './rooms.repository.js';
import { randomBytes } from 'node:crypto';

const INVITE_CODE_ATTEMPTS = 5;

function generateInviteCode() {
  return randomBytes(4).toString('hex');
}

export async function createRoom(
  ownerId: string,
  { roomName, meetingUrl, users }: CreateRoomInput,
) {
  const memberIds = [...new Set([ownerId, ...(users ?? [])])];

  const client = await pg.connect();
  try {
    await client.query('BEGIN');

    let room = null;
    for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS && !room; attempt++) {
      const inviteCode = generateInviteCode();
      room = await RoomRepo.create({ roomName, meetingUrl, ownerId, inviteCode }, client);
    }
    if (!room) {
      throw new Error(
        `Failed to generate a unique invite code in ${INVITE_CODE_ATTEMPTS} attempts`,
      );
    }

    const insertedMemberIds = await RoomRepo.addMembers(room.id, memberIds, client);

    await client.query('COMMIT');

    return { ...room, memberIds: insertedMemberIds };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function addMember(
  requesterId: string,
  roomId: string,
  { userId }: AddRoomMemberInput,
) {
  const room = await RoomRepo.findById(roomId);
  if (!room) {
    throw new AppError('ROOM_NOT_FOUND', "This room doesn't exist");
  }
  if (room.ownerId !== requesterId) {
    throw new AppError('FORBIDDEN', 'Only the room owner can add members');
  }

  await RoomRepo.addMember(roomId, userId);
  const memberIds = await RoomRepo.getMemberIds(roomId);

  return { ...room, memberIds };
}

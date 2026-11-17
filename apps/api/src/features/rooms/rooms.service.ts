import type { AddRoomMemberInput, CreateRoomInput } from '@repo/shared';
import { AppError } from '../../errors/AppError.js';
import { pg } from '../../lib/pg.js';
import { RoomRepo } from './rooms.repository.js';

export async function createRoom(
  ownerId: string,
  { roomName, meetingUrl, users }: CreateRoomInput,
) {
  const memberIds = [...new Set([ownerId, ...(users ?? [])])];

  const client = await pg.connect();
  try {
    await client.query('BEGIN');

    const room = await RoomRepo.create({ roomName, meetingUrl, ownerId }, client);
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

import type { CreateRoomInput } from '@repo/shared';
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

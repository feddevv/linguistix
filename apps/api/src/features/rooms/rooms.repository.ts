import { DatabaseError, type PoolClient } from 'pg';
import { pg } from '../../lib/pg.js';
import { AppError } from '../../errors/AppError.js';
import { toRoomDomain } from '../../utils/mappers.js';
import type { CreateRoomParameters, RoomRow } from './rooms.types.js';

const ROOM_COLUMNS = 'id, room_name, meeting_url, owner_id, created_at::text AS created_at';

class Room {
  async create({ roomName, meetingUrl, ownerId }: CreateRoomParameters, client?: PoolClient) {
    const executor = client ?? pg;
    try {
      const room = await executor.query<RoomRow>(
        `
          INSERT INTO rooms (room_name, meeting_url, owner_id)
          VALUES ($1, $2, $3)
          RETURNING ${ROOM_COLUMNS};
        `,
        [roomName, meetingUrl ?? null, ownerId],
      );

      return toRoomDomain(room.rows[0]!);
    } catch (err) {
      if (err instanceof DatabaseError && err.code === '23503') {
        throw new AppError('USER_NOT_FOUND', "This user doesn't exist");
      }

      throw err;
    }
  }

  async addMembers(roomId: string, userIds: string[], client?: PoolClient) {
    const executor = client ?? pg;
    try {
      const members = await executor.query<{ user_id: string }>(
        `
          INSERT INTO room_members (user_id, room_id)
          SELECT user_id, $2 FROM unnest($1::uuid[]) AS user_id
          ON CONFLICT (user_id, room_id) DO NOTHING
          RETURNING user_id;
        `,
        [userIds, roomId],
      );

      return members.rows.map((row) => row.user_id);
    } catch (err) {
      if (err instanceof DatabaseError && err.code === '23503') {
        throw new AppError('USER_NOT_FOUND', 'One or more users do not exist');
      }

      throw err;
    }
  }
}

export const RoomRepo = new Room();

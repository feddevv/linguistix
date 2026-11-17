import { DatabaseError, type PoolClient } from 'pg';
import { pg } from '../../lib/pg.js';
import { AppError } from '../../errors/AppError.js';
import { toRoomDomain } from '../../utils/mappers.js';
import type { CreateRoomParameters, RoomDomain, RoomRow } from './rooms.types.js';

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

  async findById(roomId: string, client?: PoolClient): Promise<RoomDomain | null> {
    const executor = client ?? pg;
    const room = await executor.query<RoomRow>(`SELECT ${ROOM_COLUMNS} FROM rooms WHERE id = $1;`, [
      roomId,
    ]);

    return room.rows[0] ? toRoomDomain(room.rows[0]) : null;
  }

  async addMember(roomId: string, userId: string, client?: PoolClient) {
    const executor = client ?? pg;
    try {
      await executor.query(
        `
          INSERT INTO room_members (user_id, room_id)
          VALUES ($1, $2);
        `,
        [userId, roomId],
      );
    } catch (err) {
      if (err instanceof DatabaseError && err.code === '23505') {
        throw new AppError('ALREADY_MEMBER', 'This user is already a member of the room');
      }
      if (err instanceof DatabaseError && err.code === '23503') {
        if (err.constraint?.includes('room_id')) {
          throw new AppError('ROOM_NOT_FOUND', "This room doesn't exist");
        }
        throw new AppError('USER_NOT_FOUND', "This user doesn't exist");
      }

      throw err;
    }
  }

  async getMemberIds(roomId: string, client?: PoolClient) {
    const executor = client ?? pg;
    const members = await executor.query<{ user_id: string }>(
      'SELECT user_id FROM room_members WHERE room_id = $1 ORDER BY id;',
      [roomId],
    );

    return members.rows.map((row) => row.user_id);
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

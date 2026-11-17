import type { Request, Response } from 'express';
import type { CreateRoomInput, RoomResponseDTO } from '@repo/shared';
import * as roomsService from './rooms.service.js';

export async function createRoom(
  req: Request<unknown, unknown, CreateRoomInput>,
  res: Response<RoomResponseDTO>,
) {
  const room = await roomsService.createRoom(req.user!.id, req.body);

  res.status(201).json({
    room: {
      id: room.id,
      roomName: room.roomName,
      meetingUrl: room.meetingUrl,
      ownerId: room.ownerId,
      createdAt: room.createdAt,
      memberIds: room.memberIds,
    },
  });
}

import type { Request, Response } from 'express';
import type {
  AddRoomMemberInput,
  CreateRoomInput,
  RoomIdParams,
  RoomResponseDTO,
} from '@repo/shared';
import type { RoomDomain } from './rooms.types.js';
import * as roomsService from './rooms.service.js';

function toRoomResponse(room: RoomDomain & { memberIds: string[] }): RoomResponseDTO {
  return {
    room: {
      id: room.id,
      roomName: room.roomName,
      meetingUrl: room.meetingUrl,
      ownerId: room.ownerId,
      inviteCode: room.inviteCode,
      createdAt: room.createdAt,
      memberIds: room.memberIds,
    },
  };
}

export async function createRoom(
  req: Request<unknown, unknown, CreateRoomInput>,
  res: Response<RoomResponseDTO>,
) {
  const room = await roomsService.createRoom(req.user!.id, req.body);

  res.status(201).json(toRoomResponse(room));
}

export async function addMember(
  req: Request<RoomIdParams, unknown, AddRoomMemberInput>,
  res: Response<RoomResponseDTO>,
) {
  const room = await roomsService.addMember(req.user!.id, req.params.id, req.body);

  res.status(201).json(toRoomResponse(room));
}

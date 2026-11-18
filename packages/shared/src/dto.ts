import z from 'zod';
import {
  addRoomMemberSchema,
  createRoomSchema,
  loginSchema,
  registerSchema,
  roomIdParamsSchema,
} from './schemas.js';

export type Role = 'student' | 'teacher';

export type RegisterInput = z.infer<typeof registerSchema>;
export interface RegisterResponseDTO {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: Role | null;
  };
}

export type LoginInput = z.infer<typeof loginSchema>;
export interface LoginResponseDTO {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: Role | null;
  };
}

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type RoomIdParams = z.infer<typeof roomIdParamsSchema>;
export type AddRoomMemberInput = z.infer<typeof addRoomMemberSchema>;
export interface RoomResponseDTO {
  room: {
    id: string;
    roomName: string;
    meetingUrl: string | null;
    ownerId: string;
    inviteCode: string;
    createdAt: string;
    memberIds: string[];
  };
}

export type ErrorCode =
  | 'SERVER_ERROR'
  | 'EMAIL_IN_USE'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'INVALID_VERIFICATION_TOKEN'
  | 'USER_NOT_FOUND'
  | 'EMAIL_UNVERIFIED'
  | 'ACCOUNT_IN_USE'
  | 'CANCELED_AUTH'
  | 'INVALID_STATE'
  | 'INVALID_GRANT'
  | 'VALIDATION_ERROR'
  | 'EMAIL_ALREADY_VERIFIED'
  | 'REQUEST_LIMIT'
  | 'COOLDOWN'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'ROOM_NOT_FOUND'
  | 'ALREADY_MEMBER';

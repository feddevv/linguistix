import z from 'zod';
import { loginSchema, registerSchema } from './schemas.js';

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

export type ErrorCode =
  | 'SERVER_ERROR'
  | 'EMAIL_IN_USE'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'USER_NOT_FOUND'
  | 'EMAIL_UNVERIFIED'
  | 'ACCOUNT_IN_USE'
  | 'CANCELED_AUTH'
  | 'INVALID_STATE'
  | 'INVALID_GRANT'
  | 'VALIDATION_ERROR';

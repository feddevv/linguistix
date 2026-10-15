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

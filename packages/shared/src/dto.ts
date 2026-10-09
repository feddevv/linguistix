import z from 'zod';
import { loginSchema, registerSchema } from './schemas.js';

export type Role = 'student' | 'teacher';

export type RegisterInput = z.infer<typeof registerSchema>;
export interface RegisterResponseDTO {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}

export type LoginInput = z.infer<typeof loginSchema>;
export interface LoginResponseDTO {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}

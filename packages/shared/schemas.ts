import { z } from 'zod';

export const registerSchema = z.object({
  firstName: z
    .string('First name should be a string')
    .trim()
    .min(2, 'First name should be at least 2 characters long')
    .max(100, 'First name should not exceed 100 characters'),
  lastName: z
    .string('Last name should be a string')
    .trim()
    .min(2, 'Last name should be at least 2 characters long')
    .max(100, 'Last name should not exceed 100 characters'),
  email: z.email('Invalid email format').max(255, 'Email should not exceed 255 characters'),
  password: z
    .string('Password should be a string')
    .trim()
    .min(6, 'Password should be at least 6 characters long')
    .max(255, 'Password should not exceed 255 characters'),
  role: z.enum(['student', 'teacher'], {
    error: () => 'Role can only be either "student" or "teacher"',
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

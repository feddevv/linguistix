import { z } from 'zod';

export const registerSchema = z.object({
  firstName: z
    .string({
      error: (iss) => (!iss.input ? 'First name is required' : 'First name should be a string'),
    })
    .trim()
    .min(2, 'First name should be at least 2 characters long')
    .max(100, 'First name should not exceed 100 characters'),
  lastName: z
    .string({
      error: (iss) => (!iss.input ? 'Last name is required' : 'Last name should be a string'),
    })
    .trim()
    .min(2, 'Last name should be at least 2 characters long')
    .max(100, 'Last name should not exceed 100 characters'),
  email: z
    .email({
      error: (iss) => (!iss.input ? 'Email is required' : 'Invalid email format'),
    })
    .max(255, 'Email should not exceed 255 characters'),
  password: z
    .string({
      error: (iss) => (!iss.input ? 'Password is required' : 'Password should be a string'),
    })
    .trim()
    .min(6, 'Password should be at least 6 characters long')
    .max(255, 'Password should not exceed 255 characters'),
  role: z.enum(['student', 'teacher'], {
    error: (iss) => (!iss.input ? 'Role is required' : `Role '${iss.input}' doesn't exist`),
  }),
});

import { z } from 'zod';

export const registerSchema = z
  .object({
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
      .toLowerCase()
      .max(255, 'Email should not exceed 255 characters'),
    password: z
      .string({
        error: (iss) => {
          return !iss.input ? 'Password is required' : 'Password should be a string';
        },
      })
      .trim()
      .min(6, {
        error: (iss) =>
          iss.input?.length === 0
            ? 'Password is required'
            : 'Password should be at least 6 characters long',
      })
      .max(255, 'Password should not exceed 255 characters'),
    confirmPassword: z
      .string({
        error: (iss) =>
          !iss.input
            ? 'Password confirmation is required'
            : 'Password confirmation should be a string',
      })
      .trim()
      .min(6, 'Password confirmation should be at least 6 characters long')
      .max(255, 'Password confirmation should not exceed 255 characters'),
    role: z.enum(['student', 'teacher'], {
      error: (iss) => (!iss.input ? 'Role is required' : `Role '${iss.input}' doesn't exist`),
    }),
  })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: "Passwords don't match",
        path: ['confirmPassword'],
      });
    }
  });

export const loginSchema = z.object({
  email: registerSchema.shape.email,
  password: registerSchema.shape.password,
});

export const createRoomSchema = z.object({
  roomName: z
    .string({
      error: (iss) => (!iss.input ? 'Room name is required' : 'Room name should be a string'),
    })
    .trim()
    .min(1, 'Room name is required')
    .max(100, 'Room name should not exceed 100 characters'),
  meetingUrl: z
    .url({ protocol: /^https?$/, error: 'Invalid meeting URL' })
    .trim()
    .optional(),
  users: z
    .array(z.uuid({ error: 'Invalid user id' }), { error: 'Users should be an array' })
    .max(100, 'A room cannot have more than 100 users at creation')
    .optional(),
});

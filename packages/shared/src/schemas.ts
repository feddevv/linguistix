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
        error: (iss) => (!iss.input ? 'Password is required' : 'Password should be a string'),
      })
      .trim()
      .min(6, 'Password should be at least 6 characters long')
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

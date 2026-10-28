import { registerSchema } from '@repo/shared';
import z from 'zod';

export const oauthSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});
export type OAuthQueryString = z.infer<typeof oauthSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1, 'Token is empty'),
});
export type VerifyEmailQueryString = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: z
    .email({
      error: (iss) => (!iss.input ? 'Email is required' : 'Invalid email format'),
    })
    .toLowerCase()
    .max(255, 'Email should not exceed 255 characters'),
});
export type ResendVerificationBody = z.infer<typeof resendVerificationSchema>;

export const forgotPasswordSchema = z.object({
  email: resendVerificationSchema.shape.email,
});

export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  email: resendVerificationSchema.shape.email,
  verificationToken: verifyEmailSchema.shape.token,
  newPassword: registerSchema.shape.password,
  confirmPassword: registerSchema.shape.confirmPassword,
});

export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;

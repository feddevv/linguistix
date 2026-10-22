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

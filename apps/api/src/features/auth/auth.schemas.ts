import z from 'zod';

export const oauthSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export type OAuthQueryString = z.infer<typeof oauthSchema>;

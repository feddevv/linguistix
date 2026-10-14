import z from 'zod';

export const oauthSchema = z.object({
  code: z.string(),
  state: z.string(),
  error: z.string().optional(),
});

export type OAuthQueryString = z.infer<typeof oauthSchema>;

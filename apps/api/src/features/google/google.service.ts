import { AppError } from '../../errors/HttpError.js';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token: string;
}

interface GoogleTokenError {
  error: string;
  error_description: string;
}

export async function getGoogleTokens(code: string) {
  const response = await fetch(`https://oauth2.googleapis.com/token`, {
    signal: AbortSignal.timeout(10000),
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });

  const data = (await response.json()) as GoogleTokenResponse | GoogleTokenError;

  if (!response.ok) {
    if ('error' in data && data.error === 'invalid_grant') {
      throw new AppError('INVALID_GRANT', 400, data.error_description);
    } else {
      console.error(data, response);
      throw new AppError('SERVER_ERROR', 502, 'Authorization error');
    }
  }

  return data as GoogleTokenResponse;
}

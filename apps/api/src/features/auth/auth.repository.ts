import type { RefreshTokenInputDto } from './auth.types.js';
import { redisClient } from '../../lib/redis.js';

const refreshTokenKey = (hash: string) => `refreshToken:${hash}`;
const userRefreshTokensKey = (userId: string) => `refreshToken:user:${userId}`;

class RefreshToken {
  async create({ refreshTokenHash, userId, expiresAt }: RefreshTokenInputDto) {
    const userKey = userRefreshTokensKey(userId);
    const expiresAtSeconds = Math.ceil(expiresAt.getTime() / 1000);

    await redisClient
      .multi()
      .SET(refreshTokenKey(refreshTokenHash), userId, {
        expiration: { value: expiresAtSeconds, type: 'EX' },
      })
      .SADD(userKey, refreshTokenHash)
      .EXPIREAT(userKey, expiresAtSeconds, 'NX')
      .EXPIREAT(userKey, expiresAtSeconds, 'GT')
      .exec();
  }

  async find(refreshTokenHash: string) {
    return redisClient.GET(refreshTokenKey(refreshTokenHash));
  }

  async rotate(oldRefreshTokenHash: string, newRefreshTokenHash: string, expiresAt: Date) {
    const userId = await redisClient.GETDEL(refreshTokenKey(oldRefreshTokenHash));
    if (!userId) return false;

    await redisClient.SREM(userRefreshTokensKey(userId), oldRefreshTokenHash);
    await this.create({ refreshTokenHash: newRefreshTokenHash, userId, expiresAt });

    return true;
  }

  async delete(refreshTokenHash: string) {
    const userId = await redisClient.GETDEL(refreshTokenKey(refreshTokenHash));
    if (userId) await redisClient.SREM(userRefreshTokensKey(userId), refreshTokenHash);
  }

  async revokeAll(userId: string) {
    const userKey = userRefreshTokensKey(userId);
    const hashes = await redisClient.SMEMBERS(userKey);

    await redisClient.DEL([userKey, ...hashes.map(refreshTokenKey)]);
  }
}

interface CreateTokenParameters {
  tokenHash: string;
  userId: string;
  subject: string;
  ttlSeconds: number;
}

class VerificationToken {
  async create({ tokenHash, userId, subject, ttlSeconds }: CreateTokenParameters) {
    const userKey = `verificationToken:user:${userId}:${subject}`;
    const prevHash = await redisClient.GETDEL(userKey);

    const multi = redisClient.multi();
    if (prevHash) await redisClient.DEL(`verificationToken:${prevHash}:${subject}`);
    multi.SETEX(`verificationToken:${tokenHash}:${subject}`, ttlSeconds, userId);
    multi.SETEX(userKey, ttlSeconds, tokenHash);
    await multi.exec();
  }

  async consume(tokenHash: string, subject: string) {
    const userId = await redisClient.GETDEL(`verificationToken:${tokenHash}:${subject}`);
    if (userId) await redisClient.DEL(`verificationToken:user:${userId}:${subject}`);

    return userId;
  }
}

export const RefreshTokenRepo = new RefreshToken();
export const VerificationTokenRepo = new VerificationToken();

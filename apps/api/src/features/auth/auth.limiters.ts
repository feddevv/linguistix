import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../../lib/redis.js';

export const strictLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { errorCode: 'REQUEST_LIMIT', message: 'Too many requests' },
  store: new RedisStore({
    prefix: 'rl:strict:',
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  }),
  keyGenerator: (req) => `${ipKeyGenerator(req.ip!)}:${req.baseUrl}${req.path}`,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { errorCode: 'REQUEST_LIMIT', message: 'Too many requests' },
  store: new RedisStore({
    prefix: 'rl:auth:',
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  }),
  keyGenerator: (req) => `${ipKeyGenerator(req.ip!)}:${req.baseUrl}${req.path}`,
});

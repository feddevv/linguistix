import { Router } from 'express';
import * as authController from './auth.controller.js';
import { validate } from '../../middlewares/validator.js';
import { loginSchema, registerSchema } from '@repo/shared';
import { oauthSchema, resendVerificationSchema, verifyEmailSchema } from './auth.schemas.js';
import { rateLimit } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { client } from '../../lib/redis.js';

export const router: Router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ipv6Subnet: 56,
  message: { message: 'Too many requests' },
  store: new RedisStore({ sendCommand: (...args: string[]) => client.sendCommand(args) }),
});

router.post('/auth/register', validate({ body: registerSchema }), authController.register);
router.post('/auth/login', validate({ body: loginSchema }), authController.login);
router.post('/auth/refresh', authController.refresh);
router.post('/auth/logout', authController.logout);
router.get('/auth/google', authController.google);
router.get(
  '/auth/google/callback',
  validate({ query: oauthSchema }),
  authController.googleCallback,
);
router.get(
  '/auth/verify-email',
  limiter,
  validate({ query: verifyEmailSchema }),
  authController.verifyEmail,
);

router.post(
  '/auth/resend-verification',
  limiter,
  validate({ body: resendVerificationSchema }),
  authController.resendVerification,
);

import { Router } from 'express';
import * as authController from './auth.controller.js';
import { validate } from '../../middlewares/validator.js';
import { loginSchema, registerSchema } from '@repo/shared';

export const router: Router = Router();

router.post('/auth/register', validate({ body: registerSchema }), authController.register);
router.post('/auth/login', validate({ body: loginSchema }), authController.login);
router.post('/auth/refresh', authController.refresh);
router.post('/auth/logout', authController.logout);
router.get('/auth/google/callback', authController.googleCallback);

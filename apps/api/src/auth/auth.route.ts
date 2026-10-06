import { Router } from 'express';
import * as authController from './auth.controller.js';
import { validate } from '../middlewares/validator.js';
import { registerSchema } from '@repo/shared';

export const router: Router = Router();

router.post('/auth/register', validate({ body: registerSchema }), authController.register);

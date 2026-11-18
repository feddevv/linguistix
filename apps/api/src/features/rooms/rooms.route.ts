import { Router } from 'express';
import { addRoomMemberSchema, createRoomSchema, roomIdParamsSchema } from '@repo/shared';
import { validate } from '../../middlewares/validator.js';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as roomsController from './rooms.controller.js';

export const router: Router = Router();

router.post(
  '/rooms',
  requireAuth,
  requireRole('teacher'),
  validate({ body: createRoomSchema }),
  roomsController.createRoom,
);

router.post(
  '/rooms/:id/members',
  requireAuth,
  requireRole('teacher'),
  validate({ params: roomIdParamsSchema, body: addRoomMemberSchema }),
  roomsController.addMember,
);

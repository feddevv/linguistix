import { createNodeRedisClient, Queue } from 'bullmq';
import { redisClient } from '../../lib/redis.js';

export const emailQueue = new Queue('email-queue', {
  connection: createNodeRedisClient(redisClient),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

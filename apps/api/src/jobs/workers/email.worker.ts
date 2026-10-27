import { createNodeRedisClient, Worker, type Job } from 'bullmq';
import { EMAIL_QUEUE_NAME } from '../queues/email.queue.js';
import { redisClient } from '../../lib/redis.js';
import { sendVerificationEmail } from '../../shared/services/email.service.js';

export const emailWorker = new Worker(
  EMAIL_QUEUE_NAME,
  async (job: Job) => {
    switch (job.name) {
      case 'email-verification':
        await sendVerificationEmail(job.data.email, job.data.verificationToken);
        break;
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  },
  {
    connection: createNodeRedisClient(redisClient),
    concurrency: 5,
  },
);

emailWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error: ${err.message}`);
});

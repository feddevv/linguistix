import { createNodeRedisClient, Worker, type Job } from 'bullmq';
import { EMAIL_QUEUE_NAME } from '../queues/email.queue.js';
import { transporter } from '../../lib/transporter.js';
import { redisClient } from '../../lib/redis.js';

export const emailWorker = new Worker(
  EMAIL_QUEUE_NAME,
  async (job: Job) => {
    switch (job.name) {
      case 'email-verification':
        await transporter.sendMail({
          from: 'linguistix@lang.com',
          to: job.data.email,
          subject: 'Linguistix email verification',
          text: `Verify your email ${process.env.BACKEND_URL}/api/auth/verify-email?token=${job.data.verificationToken}`,
        });
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

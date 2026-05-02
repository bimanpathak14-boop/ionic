import Queue from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

export const taskQueue = new Queue('task-queue', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export const aiQueue = new Queue('ai-queue', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: true,
  },
});

export default {
  taskQueue,
  aiQueue,
};

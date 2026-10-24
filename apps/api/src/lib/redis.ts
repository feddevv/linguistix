import { createClient } from 'redis';

const redisClient = createClient({
  url: 'redis://default:1221@localhost:6379',
});
redisClient.on('error', (err) => console.log('Redis Client Error', err));
await redisClient.connect();

export { redisClient };

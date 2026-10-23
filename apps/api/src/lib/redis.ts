import { createClient } from 'redis';

const client = createClient({
  url: 'redis://default:1221@localhost:6379',
});
client.on('error', (err) => console.log('Redis Client Error', err));
await client.connect();

export { client };

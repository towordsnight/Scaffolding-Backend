import Redis from 'ioredis';
import 'dotenv/config';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL env var is required');
}

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
});

redis.on('error', (err) => {
  console.error('[Redis] connection error:', err);
});

export default redis;

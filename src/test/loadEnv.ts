import dotenv from 'dotenv';
import path from 'path';

// Load .env.test before any module is imported so pool, redis, jwt all pick up test values.
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

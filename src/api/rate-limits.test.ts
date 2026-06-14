import express from 'express';
import request from 'supertest';
import { makeLimiter } from './rate-limits';

// The exported limiters skip under NODE_ENV=test (so integration suites don't
// trip shared buckets), so we exercise the factory with the skip forced off.
function makeApp(keyGenerator?: (req: express.Request) => string) {
  const limiter = makeLimiter({ windowMs: 60_000, max: 2, keyGenerator, skip: () => false });

  const app = express();
  app.use(express.json());
  app.post('/t', limiter, (_req, res) => { res.status(200).json({ ok: true }); });
  return app;
}

describe('rate limiters', () => {
  it('returns 429 once the limit is exceeded', async () => {
    const app = makeApp();
    await request(app).post('/t').expect(200);
    await request(app).post('/t').expect(200);
    const res = await request(app).post('/t').expect(429);
    expect(res.body).toEqual({ error: 'Too many requests. Please wait and try again.' });
  });

  it('tracks separate keys in separate buckets', async () => {
    const app = makeApp((req) => String(req.body?.user ?? ''));
    await request(app).post('/t').send({ user: 'a' }).expect(200);
    await request(app).post('/t').send({ user: 'a' }).expect(200);
    await request(app).post('/t').send({ user: 'a' }).expect(429);
    // A different key is unaffected by user a's exhausted bucket.
    await request(app).post('/t').send({ user: 'b' }).expect(200);
  });

  it('is skipped entirely under NODE_ENV=test', async () => {
    const app = express();
    app.use(express.json());
    const limiter = makeLimiter({ windowMs: 60_000, max: 1 });
    app.post('/t', limiter, (_req, res) => { res.status(200).json({ ok: true }); });
    await request(app).post('/t').expect(200);
    await request(app).post('/t').expect(200);
    await request(app).post('/t').expect(200);
  });
});

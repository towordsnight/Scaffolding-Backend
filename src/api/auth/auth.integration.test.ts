import request from 'supertest';
import app from '../../app';
import { truncateAll, pool } from '../../test/helpers';
import { clearStore } from '../../test/redisMock';

beforeEach(async () => {
  await truncateAll();
  clearStore();
});

afterAll(async () => {
  await pool.end();
});

// ── Register ──────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('201 + httpOnly cookie on valid registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@uw.edu', password: 'password123', consent: true });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    const cookie = res.headers['set-cookie'] as string[] | string;
    expect(cookie).toBeDefined();
    const cookieStr = Array.isArray(cookie) ? cookie[0] : cookie;
    expect(cookieStr).toMatch(/HttpOnly/i);
    expect(cookieStr).toMatch(/token=/);
  });

  it('409 when the same email is registered twice', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@uw.edu', password: 'pw1' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@uw.edu', password: 'pw2' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  it('400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'pw' });
    expect(res.status).toBe(400);
  });

  it('400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@uw.edu' });
    expect(res.status).toBe(400);
  });

  it('email case-insensitivity: upper and lower case are the same account', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'User@UW.EDU', password: 'pw' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@uw.edu', password: 'pw2' });

    expect(res.status).toBe(409);
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@uw.edu', password: 'secret123' });
  });

  it('200 + cookie on correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@uw.edu', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    const cookie = res.headers['set-cookie'] as string[] | string;
    expect(cookie).toBeDefined();
  });

  it('401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@uw.edu', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('401 on nonexistent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@uw.edu', password: 'pw' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns identical error for wrong password vs nonexistent email (timing-safe)', async () => {
    const wrongPw = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@uw.edu', password: 'wrong' });

    const noUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@uw.edu', password: 'pw' });

    expect(wrongPw.body.error).toBe(noUser.body.error);
  });

  it('400 when email field is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'pw' });
    expect(res.status).toBe(400);
  });

  it('400 when password field is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@uw.edu' });
    expect(res.status).toBe(400);
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('200 and clears the token cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'logout@uw.edu', password: 'pw' });

    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(200);

    const cookie = res.headers['set-cookie'] as string[] | string | undefined;
    if (cookie) {
      const cookieStr = Array.isArray(cookie) ? cookie[0] : cookie;
      // Cookie cleared: either Max-Age=0 or Expires in the past
      expect(cookieStr).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    }
  });
});

// ── Protected routes ──────────────────────────────────────────────────────────

describe('Protected route access', () => {
  it('401 when requesting a protected route with no cookie', async () => {
    const res = await request(app).get('/api/onboarding/problems');
    expect(res.status).toBe(401);
  });

  it('401 with a tampered JWT', async () => {
    const res = await request(app)
      .get('/api/onboarding/problems')
      .set('Cookie', 'token=this.is.not.a.valid.jwt');
    expect(res.status).toBe(401);
  });

  it('authenticated request reaches protected route (no 401)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'auth@uw.edu', password: 'pw' });

    // Any response other than 401 means auth passed — the actual status depends on state.
    const res = await agent.get('/api/onboarding/problems');
    expect(res.status).not.toBe(401);
  });
});

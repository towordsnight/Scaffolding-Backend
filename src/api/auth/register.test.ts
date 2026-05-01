import { register } from './register';
import pool from '../../db/client';
import type { Request, Response } from 'express';

jest.mock('../../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_pw'),
}));

const mockPool = pool as jest.Mocked<typeof pool>;

function makeRes(): jest.Mocked<Response> {
  const res = { status: jest.fn(), json: jest.fn(), cookie: jest.fn() } as unknown as jest.Mocked<Response>;
  res.status.mockReturnValue(res);
  res.cookie.mockReturnValue(res);
  return res;
}

function makeClientMock(studentId = 'stu-1') {
  const q = jest.fn()
    .mockResolvedValueOnce({ rows: [] })                     // BEGIN
    .mockResolvedValueOnce({ rows: [] })                     // SELECT (no duplicate)
    .mockResolvedValueOnce({ rows: [{ id: studentId }] })    // INSERT students
    .mockResolvedValue({ rows: [] });                        // consent_log, cognitive_state, skills, COMMIT…
  return { query: q, release: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRES_IN = '7d';
});

describe('POST /api/auth/register', () => {
  it('returns 400 when email is missing', async () => {
    const req = { body: { password: 'pw' }, ip: '' } as unknown as Request;
    const res = makeRes();
    await register(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when password is missing', async () => {
    const req = { body: { email: 'a@b.com' }, ip: '' } as unknown as Request;
    const res = makeRes();
    await register(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 409 when email already registered', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })                     // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'existing' }] }), // SELECT found dup
      release: jest.fn(),
    };
    (mockPool.connect as jest.Mock).mockResolvedValue(client);

    const req = { body: { email: 'a@b.com', password: 'pw' }, ip: '' } as unknown as Request;
    const res = makeRes();
    await register(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('creates student and returns 201 with cookie on happy path', async () => {
    (mockPool.connect as jest.Mock).mockResolvedValue(makeClientMock('new-stu'));

    const req = {
      body: { email: 'new@test.com', password: 'secret', consent: true },
      ip: '127.0.0.1',
    } as unknown as Request;
    const res = makeRes();
    await register(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.cookie).toHaveBeenCalledWith('token', expect.any(String), expect.objectContaining({ httpOnly: true }));
  });
});

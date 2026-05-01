import { login } from './login';
import pool from '../../db/client';
import type { Request, Response } from 'express';

jest.mock('../../db/client', () => ({
  __esModule: true,
  default: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

import bcrypt from 'bcryptjs';
const mockPool = pool as jest.Mocked<typeof pool>;
const mockCompare = bcrypt.compare as jest.Mock;

function makeRes(): jest.Mocked<Response> {
  const res = { status: jest.fn(), json: jest.fn(), cookie: jest.fn() } as unknown as jest.Mocked<Response>;
  res.status.mockReturnValue(res);
  res.cookie.mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_EXPIRES_IN = '7d';
});

describe('POST /api/auth/login', () => {
  it('returns 400 when email is missing', async () => {
    const req = { body: { password: 'pw' } } as unknown as Request;
    const res = makeRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 when no account found', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    mockCompare.mockResolvedValue(false);
    const req = { body: { email: 'x@x.com', password: 'pw' } } as unknown as Request;
    const res = makeRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 200 with cookie on valid credentials', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'stu-1', password_hash: 'hash' }] });
    mockCompare.mockResolvedValue(true);
    const req = { body: { email: 'x@x.com', password: 'correct' } } as unknown as Request;
    const res = makeRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalledWith('token', expect.any(String), expect.objectContaining({ httpOnly: true }));
  });
});

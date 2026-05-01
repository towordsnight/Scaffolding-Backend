import { logout } from './logout';
import type { Request, Response } from 'express';

function makeRes(): jest.Mocked<Response> {
  const res = {
    clearCookie: jest.fn(),
    status:      jest.fn(),
    json:        jest.fn(),
  } as unknown as jest.Mocked<Response>;
  res.clearCookie.mockReturnValue(res);
  res.status.mockReturnValue(res);
  return res;
}

describe('POST /api/auth/logout', () => {
  it('clears the token cookie and returns 200', () => {
    const req = {} as Request;
    const res = makeRes();
    logout(req, res);
    expect(res.clearCookie).toHaveBeenCalledWith('token', expect.objectContaining({ httpOnly: true }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Logged out' });
  });
});

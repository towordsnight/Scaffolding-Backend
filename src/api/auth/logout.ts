import { Request, Response } from 'express';

export function logout(_req: Request, res: Response): void {
  res
    .clearCookie('token', { httpOnly: true, sameSite: 'strict' })
    .status(200)
    .json({ message: 'Logged out' });
}

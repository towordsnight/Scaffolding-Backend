import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../../db/client';

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const emailHash = hashEmail(email);

  const result = await pool.query<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM students WHERE email_hash = $1',
    [emailHash],
  );

  // Constant-time-ish: always run bcrypt even if no row found to avoid timing attacks
  const row = result.rows[0];
  const hashToCheck = row?.password_hash ?? '$2a$12$invalidhashpadding000000000000000000000000000000000000000';

  const valid = await bcrypt.compare(password, hashToCheck);
  if (!row || !valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');

  const token = jwt.sign({ sub: row.id }, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'],
  });

  res
    .cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    .status(200)
    .json({ id: row.id });
}

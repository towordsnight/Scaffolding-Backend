import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../../db/client';
import { Topic } from '../../types/schema';

const ALL_TOPICS: Topic[] = ['kvl', 'kcl', 'phasors', 'impedance'];

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function issueToken(studentId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return jwt.sign({ sub: studentId }, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'],
  });
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, display_name, course_level, consent } = req.body as {
    email?: string;
    password?: string;
    display_name?: string;
    course_level?: string;
    consent?: boolean;
  };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  // Constraint #3: never store raw email
  const emailHash = hashEmail(email);
  const passwordHash = await bcrypt.hash(password, 12);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check for duplicate
    const existing = await client.query(
      'SELECT id FROM students WHERE email_hash = $1',
      [emailHash],
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Account already exists' });
      return;
    }

    // Insert student
    const studentResult = await client.query<{ id: string }>(
      `INSERT INTO students (email_hash, password_hash, display_name, course_level)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [emailHash, passwordHash, display_name ?? null, course_level ?? 'intro'],
    );
    const studentId = studentResult.rows[0].id;

    // Constraint #2: log consent before onboarding can proceed
    const consentGranted = consent === true;
    const ipRaw = req.ip ?? '';
    const ipHash = ipRaw
      ? crypto.createHash('sha256').update(ipRaw).digest('hex')
      : null;

    await client.query(
      `INSERT INTO consent_log (student_id, consent_type, granted, ip_hash)
       VALUES ($1, 'ferpa', $2, $3)`,
      [studentId, consentGranted, ipHash],
    );

    if (consentGranted) {
      await client.query(
        `UPDATE students SET consent_given_at = now() WHERE id = $1`,
        [studentId],
      );
    }

    // Init cognitive_state
    await client.query(
      `INSERT INTO cognitive_state (student_id) VALUES ($1)`,
      [studentId],
    );

    // Init adaptive_config with base defaults (thresholds from adaptive_config, not hardcoded)
    await client.query(
      `INSERT INTO adaptive_config (student_id) VALUES ($1)`,
      [studentId],
    );

    // Init student_skills for all topics at tier 1
    for (const topic of ALL_TOPICS) {
      await client.query(
        `INSERT INTO student_skills (student_id, topic) VALUES ($1, $2)`,
        [studentId, topic],
      );
    }

    await client.query('COMMIT');

    const token = issueToken(studentId);
    res
      .cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      })
      .status(201)
      .json({ id: studentId });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

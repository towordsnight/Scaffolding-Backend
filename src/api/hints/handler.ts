import { Request, Response } from 'express';

import pool from '../../db/client';
import { AuthRequest } from '../auth/middleware';
import { getSession, setSession } from '../../redis/session-store';
import { sessionBelongsToStudent } from '../../db/queries/sessions';
import { streamHint, type HintRequest, type HintTrigger } from '../../services/ai-tutor';

const VALID_TRIGGERS: ReadonlySet<HintTrigger> = new Set(['idle', 'error_streak', 'hint_budget_exhausted', 'manual']);

// POST /api/hints
// Body: { session_id, problem_id, trigger_type? }
// Streams a Claude hint over SSE, then logs to hint_events + updates Redis.
export async function postHint(req: Request, res: Response): Promise<void> {
  const studentId = (req as AuthRequest).studentId;
  const { session_id, problem_id, trigger_type } = req.body as {
    session_id?: string;
    problem_id?: string;
    trigger_type?: HintTrigger;
  };

  if (!session_id || !problem_id) {
    res.status(400).json({ error: 'session_id and problem_id are required' });
    return;
  }
  const triggerType: HintTrigger = trigger_type && VALID_TRIGGERS.has(trigger_type) ? trigger_type : 'manual';

  // session_id is client-supplied: hints must not read or bill against another
  // student's session, and hint_events must not be attributed to it.
  if (!(await sessionBelongsToStudent(session_id, studentId))) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const session = await getSession(session_id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const configRow = await pool.query<{ hint_budget: number }>(
    'SELECT hint_budget FROM adaptive_config WHERE student_id=$1',
    [studentId],
  );
  const hintBudget = configRow.rows[0]?.hint_budget ?? 3;
  const hintsUsed = session.hints_used_this_problem ?? 0;

  // The budget holds for every trigger. trigger_type is client-supplied and only
  // shapes prompt phrasing — it must never bypass the cap (the server-driven
  // exhausted-budget intervention resets hints_used at submit, so its follow-up
  // hint passes this check without an exception).
  if (hintsUsed >= hintBudget) {
    res.status(409).json({ error: 'Hint budget exhausted for this problem' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const hintRequest: HintRequest = {
    sessionId: session_id,
    studentId,
    problemId: problem_id,
    hintLevel: hintsUsed + 1,
    idleSeconds: session.idle_streak_seconds ?? 0,
    triggerType,
  };

  let aborted = false;
  req.on('close', () => { aborted = true; });

  const gen = streamHint(hintRequest);

  try {
    while (true) {
      const next = await gen.next();
      if (next.done) {
        const ctx = next.value;

        // Persist state before closing the connection so the next request
        // always sees the updated hint count (avoids a race with concurrent requests).
        await pool.query(
          `INSERT INTO hint_events
             (session_id, problem_id, student_id, hint_level, hint_depth, absorbed)
           VALUES ($1, $2, $3, $4, $5, FALSE)`,
          [session_id, problem_id, studentId, ctx.hintLevel, ctx.hintDepth],
        );

        const nowIso = new Date().toISOString();
        await setSession(session_id, {
          ...session,
          hint_history: [
            ...session.hint_history,
            { hint_id: ctx.hintId, hint_level: ctx.hintLevel, shown_at: nowIso, absorbed: false },
          ],
          hints_used_this_problem: hintsUsed + 1,
        });

        if (!aborted) {
          res.write(`event: done\ndata: ${JSON.stringify({ hint_id: ctx.hintId, hint_level: ctx.hintLevel, hint_depth: ctx.hintDepth, response_budget: ctx.responseBudget })}\n\n`);
          res.end();
        }
        return;
      }

      if (aborted) return;
      res.write(`data: ${JSON.stringify({ token: next.value })}\n\n`);
    }
  } catch (err) {
    if (!aborted) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
      res.end();
    }
  }
}

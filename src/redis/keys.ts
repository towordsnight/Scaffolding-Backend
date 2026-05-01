// Redis key constants and builders.

export const SESSION_TTL_S = 60 * 60 * 24; // 24 hours

export const sessionKey = (sessionId: string): string =>
  `session:${sessionId}`;

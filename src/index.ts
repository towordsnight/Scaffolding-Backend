import app from './app';

// Rejections that escape request context (timers, fire-and-forget calls):
// log and keep serving — one bad promise must not take down every session.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// A synchronous uncaught throw leaves the process in an unknown state:
// log and exit so the platform (Railway) restarts a clean instance.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;

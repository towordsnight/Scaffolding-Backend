import type { Feedback as FeedbackData } from '../types';

interface FeedbackProps {
  feedback: FeedbackData;
}

/**
 * Success / warning banner shown beneath an input after the student
 * presses the action button. Mirrors the "Excellent" alert from step 2's
 * checked variant in Figma (frame 65:202).
 */
export function Feedback({ feedback }: FeedbackProps) {
  const palette =
    feedback.tone === 'success'
      ? { border: '#10B981', bg: '#ECFDF5', titleText: '#065F46', bodyText: '#064E3B' }
      : feedback.tone === 'warning'
        ? { border: '#F59E0B', bg: '#FFFBEB', titleText: '#92400E', bodyText: '#7C2D12' }
        : { border: '#EF4444', bg: '#FEF2F2', titleText: '#991B1B', bodyText: '#7F1D1D' };

  return (
    <div
      className="mt-3 flex items-start gap-2 rounded-lg border p-3"
      style={{ borderColor: palette.border, backgroundColor: palette.bg }}
    >
      <span aria-hidden="true" style={{ color: palette.border }}>
        <CheckCircleIcon />
      </span>
      <div className="text-[13px] leading-[18px]">
        <p className="font-bold" style={{ color: palette.titleText }}>
          {feedback.title}
        </p>
        <p className="mt-0.5" style={{ color: palette.bodyText }}>
          {feedback.body}
        </p>
      </div>
    </div>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 8.5l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

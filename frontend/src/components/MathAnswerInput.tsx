import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import katex from 'katex';
import { plainMathToTex } from '../lib/math-preview';

interface MathAnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  multiline?: boolean;
  displayMode?: boolean;
  mathPreview?: boolean;
  inputType?: 'text' | 'number';
  inputClassName?: string;
  renderClassName?: string;
  labelClassName?: string;
  rows?: number;
}

const DEFAULT_LABEL_CLASS = 'text-xs font-bold uppercase tracking-[0.05em] text-[#99A1AF]';
const DEFAULT_INPUT_CLASS = 'mt-2 h-[50px] w-full rounded-[10px] border border-[#D1D5DC] bg-white px-4 text-[15px] focus:border-[#615FFF] focus:outline-none focus:ring-2 focus:ring-[#615FFF]/20';
const DEFAULT_TEXTAREA_CLASS = 'mt-2 min-h-28 w-full rounded-[10px] border border-[#D1D5DC] bg-white p-4 text-[15px] focus:border-[#615FFF] focus:outline-none focus:ring-2 focus:ring-[#615FFF]/20';

export function MathAnswerInput({
  value,
  onChange,
  label,
  placeholder,
  multiline = false,
  displayMode = false,
  mathPreview = true,
  inputType = 'text',
  inputClassName,
  renderClassName,
  labelClassName,
  rows,
}: MathAnswerInputProps) {
  const [showRendered, setShowRendered] = useState(false);
  const previewHtml = useMemo(() => (
    mathPreview ? renderPreview(value, displayMode) : null
  ), [displayMode, mathPreview, value]);

  useEffect(() => {
    setShowRendered(false);
    if (!previewHtml) return undefined;

    const timeoutId = window.setTimeout(() => setShowRendered(true), 650);
    return () => window.clearTimeout(timeoutId);
  }, [previewHtml, value]);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onChange(event.target.value);
  }

  const inputClasses = inputClassName ?? (multiline ? DEFAULT_TEXTAREA_CLASS : DEFAULT_INPUT_CLASS);
  const hiddenInputStyle = showRendered && previewHtml
    ? { color: 'transparent', caretColor: 'transparent' }
    : undefined;
  const renderedClasses = renderClassName ?? (
    multiline
      ? 'pointer-events-none absolute inset-x-0 bottom-0 top-2 overflow-auto rounded-[10px] px-4 py-4 text-[15px] text-black'
      : 'pointer-events-none absolute inset-x-0 bottom-0 top-2 flex items-center overflow-x-auto rounded-[10px] px-4 text-[15px] text-black'
  );

  return (
    <label className="block">
      {label && (
        <span className={labelClassName ?? DEFAULT_LABEL_CLASS}>{label}</span>
      )}
      <span className="relative block">
        {multiline ? (
          <textarea
            value={value}
            onChange={handleChange}
            onFocus={() => setShowRendered(false)}
            onPointerDown={() => setShowRendered(false)}
            rows={rows}
            className={inputClasses}
            style={hiddenInputStyle}
            placeholder={placeholder}
          />
        ) : (
          <input
            type={inputType}
            value={value}
            onChange={handleChange}
            onFocus={() => setShowRendered(false)}
            onPointerDown={() => setShowRendered(false)}
            className={inputClasses}
            style={hiddenInputStyle}
            placeholder={placeholder}
          />
        )}
        {showRendered && previewHtml && (
          <span
            className={renderedClasses}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </span>
    </label>
  );
}

function renderPreview(value: string, displayMode: boolean) {
  if (isPlainNumber(value)) return null;

  const tex = plainMathToTex(value);
  if (!tex) return null;

  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      trust: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return null;
  }
}

function isPlainNumber(value: string) {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim());
}

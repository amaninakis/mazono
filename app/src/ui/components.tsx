import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { parseDecimal } from '../core/progress';

/** − value + control with a typeable number in the middle. Accepts comma decimals. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  label,
  id,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  label: string;
  id?: string;
}) {
  const { i18n } = useTranslation();
  const [text, setText] = useState(value == null ? '' : fmt(value, i18n.language));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : fmt(value, i18n.language));
  }, [value, i18n.language]);

  const bump = (dir: 1 | -1) => {
    const next = Math.max(min, round((value ?? 0) + dir * step));
    onChange(next);
  };

  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="step-btn" onClick={() => bump(-1)} aria-label={`− ${label}`}>
        −
      </button>
      <input
        id={id}
        className="step-input"
        inputMode="decimal"
        value={text}
        placeholder="0"
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          setText(value == null ? '' : fmt(value, i18n.language));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseDecimal(e.target.value);
          if (e.target.value.trim() === '') onChange(null);
          else if (n != null && n >= min) onChange(n);
        }}
      />
      <button type="button" className="step-btn" onClick={() => bump(1)} aria-label={`+ ${label}`}>
        +
      </button>
    </div>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 3, useGrouping: false }).format(n);

/* ---------- Toast ---------- */

interface ToastMsg {
  id: number;
  title: string;
  lines?: string[];
  action?: { label: string; run: () => void };
}

const ToastCtx = createContext<(m: Omit<ToastMsg, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((m: Omit<ToastMsg, 'id'>) => {
    window.clearTimeout(timer.current);
    setMsg({ ...m, id: Date.now() });
    timer.current = window.setTimeout(() => setMsg(null), 4500);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status" key={msg.id}>
          <div className="toast-body">
            <strong>{msg.title}</strong>
            {msg.lines?.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
          {msg.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                msg.action!.run();
                setMsg(null);
              }}
            >
              {msg.action.label}
            </button>
          )}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------- Small pieces ---------- */

export function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <span>{label}</span>
        {help && <small>{help}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
    </label>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

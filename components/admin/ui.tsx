"use client";

// Small building blocks shared by every dashboard screen.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ApiFailure, asFailure } from "./api";
import { prefersReducedMotion } from "./hooks";
import { IconCheck, IconClose, IconEye, IconEyeOff } from "./icons";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ------------------------------------------------------------- buttons

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "secondary" | "primary" | "accent" | "danger" | "ghost";
  busy?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "secondary", busy, icon, children, className, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx("a-btn", `a-btn--${variant}`, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type={type} className={cx("a-iconbtn", className)} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="a-spinner" role="status" aria-label="Working" />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "red" | "green" | "amber"; children: ReactNode }) {
  return <span className={cx("a-badge", `a-badge--${tone}`)}>{children}</span>;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled} className="a-switch" onClick={() => onChange(!checked)}>
      <span className="a-switch__knob" />
    </button>
  );
}

// -------------------------------------------------------------- fields

type FieldProps = { label: string; error?: string | null; hint?: ReactNode; children: ReactNode; className?: string };

/** A label above a control, with the error (or a hint) right under it. */
export function Field({ label, error, hint, children, className }: FieldProps) {
  return (
    <label className={cx("a-field", error && "a-field--error", className)}>
      <span className="a-field__label">{label}</span>
      {children}
      {error ? (
        <span className="a-field__note a-field__note--error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="a-field__note">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx("a-input", props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx("a-input a-input--area", props.className)} />;
}

export function PasswordInput({ className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <span className="a-password">
      <input {...rest} type={shown ? "text" : "password"} className={cx("a-input", className)} />
      <button type="button" className="a-password__toggle" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
        {shown ? <IconEyeOff /> : <IconEye />}
      </button>
    </span>
  );
}

export function Select({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx("a-input a-select", rest.className)}>
      {children}
    </select>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; count?: number }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="a-segmented" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="tab" aria-selected={value === option.value} className="a-segmented__item" onClick={() => onChange(option.value)}>
          {option.label}
          {option.count ? <span className="a-segmented__count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------------- notes

export function ErrorNote({ error, onRetry }: { error: ApiFailure | string; onRetry?: () => void }) {
  return (
    <div className="a-note a-note--error" role="alert">
      <span>{typeof error === "string" ? error : error.message}</span>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="a-empty">
      <p className="a-empty__title">{title}</p>
      {children && <p className="a-empty__text">{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="a-pagehead">
      <h1 className="a-pagehead__title">{title}</h1>
      {children && <div className="a-pagehead__actions">{children}</div>}
    </header>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="a-loading" role="status" aria-label={label}>
      <span className="a-spinner a-spinner--big" />
    </div>
  );
}

// --------------------------------------------------------------- toasts

type Toast = { id: number; message: string; tone: "ok" | "error" };
const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    const id = ++counter.current;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3400);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="a-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={cx("a-toast", toast.tone === "error" && "a-toast--error")}>
            {toast.tone === "ok" && <IconCheck />}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------- save status

type SaveActionsProps = {
  dirty: boolean;
  saving?: boolean;
  saveLabel?: string;
  canSave?: boolean;
  onSave: () => void;
  onCancel: () => void;
};

/** "Not saved yet" with Cancel and Save. Edits wait for Save. */
export function SaveActions({ dirty, saving, saveLabel = "Save", canSave = true, onSave, onCancel }: SaveActionsProps) {
  return (
    <div className="a-saveactions">
      <span className={cx("a-saveactions__status", dirty && "is-dirty")} role="status">
        {dirty ? "Not saved yet" : ""}
      </span>
      <Button variant="ghost" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <Button variant="primary" onClick={onSave} busy={saving} disabled={!dirty || !canSave}>
        {saveLabel}
      </Button>
    </div>
  );
}

/** Floating bar for whole-page edits. Slides up when something changes. */
export function PageSaveBar({ dirty, error, ...actions }: SaveActionsProps & { error?: string | null }) {
  return (
    <div className={cx("a-savebar", dirty && "is-visible")} aria-hidden={!dirty}>
      <div className="a-savebar__inner">
        {error && (
          <p className="a-savebar__error" role="alert">
            {error}
          </p>
        )}
        <SaveActions dirty={dirty} {...actions} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sheet

type SheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** "side" is a drawer on desktop and a bottom sheet on phones; "wide" is a larger one; "center" is a small dialog. */
  variant?: "side" | "wide" | "center";
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  saveLabel?: string;
  canSave?: boolean;
  error?: ReactNode;
  /** Replaces the default Cancel / Save footer. */
  footer?: ReactNode;
};

/** A native modal dialog: focus stays inside, Esc closes, the page behind is inert. */
export function Sheet({ title, onClose, children, variant = "side", dirty = false, saving, onSave, saveLabel, canSave, error, footer }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const timer = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [asking, setAsking] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const finish = useCallback(() => {
    setClosing(true);
    timer.current = window.setTimeout(onClose, prefersReducedMotion() ? 0 : 220);
  }, [onClose]);

  const request = useCallback(() => {
    if (saving) return;
    if (dirty) setAsking(true);
    else finish();
  }, [dirty, saving, finish]);

  const hasFooter = Boolean(footer || onSave);

  return (
    <dialog
      ref={ref}
      className={cx("a-sheet", `a-sheet--${variant}`, closing && "is-closing")}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        request();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
        if (!inside) request();
      }}
    >
      <div className="a-sheet__panel">
        <header className="a-sheet__head">
          <h2 id={titleId} className="a-sheet__title">
            {title}
          </h2>
          <IconButton label="Close" onClick={request}>
            <IconClose />
          </IconButton>
        </header>
        <div className="a-sheet__body">{children}</div>
        {hasFooter && (
          <footer className="a-sheet__foot">
            {error && (
              <p className="a-sheet__error" role="alert">
                {error}
              </p>
            )}
            {asking ? (
              <div className="a-saveactions">
                <span className="a-saveactions__status is-dirty">Discard your changes?</span>
                <Button variant="ghost" onClick={() => setAsking(false)}>
                  Keep editing
                </Button>
                <Button variant="danger" onClick={finish}>
                  Discard
                </Button>
              </div>
            ) : (
              footer ?? <SaveActions dirty={dirty} saving={saving} saveLabel={saveLabel} canSave={canSave} onSave={onSave ?? (() => undefined)} onCancel={request} />
            )}
          </footer>
        )}
      </div>
    </dialog>
  );
}

// ------------------------------------------------------------- confirm

type ConfirmProps = {
  title: string;
  /** What will happen, in plain words. */
  children: ReactNode;
  actionLabel: string;
  /** When set, the person must type this exactly before the button works. */
  typed?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

/** Destructive confirmation. Acts at once when confirmed. */
export function ConfirmDialog({ title, children, actionLabel, typed, onConfirm, onClose }: ConfirmProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed === undefined || text.trim() === typed;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (failure) {
      setError(asFailure(failure).message);
      setBusy(false);
    }
  }

  return (
    <Sheet
      variant="center"
      title={title}
      onClose={onClose}
      saving={busy}
      error={error}
      footer={
        <div className="a-saveactions">
          <span className="a-saveactions__status" />
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={run} busy={busy} disabled={!ready}>
            {actionLabel}
          </Button>
        </div>
      }
    >
      <div className="a-confirm">
        <div className="a-confirm__text">{children}</div>
        {typed !== undefined && (
          <Field label={`Type ${typed} to confirm`}>
            <TextInput value={text} onChange={(event) => setText(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </Field>
        )}
      </div>
    </Sheet>
  );
}

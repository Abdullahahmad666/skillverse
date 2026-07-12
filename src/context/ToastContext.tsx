import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error";

interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastContextValue {
  /** Show a short notification. Defaults to a success toast. */
  toast: (text: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TOAST_MS = 3800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (text: string, kind: ToastKind = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-2), { id, kind, text }]);
      window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Stack sits above the mobile tab bar, centered. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            role={t.kind === "error" ? "alert" : "status"}
            className={`toast-in pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm font-medium shadow-lift ${
              t.kind === "error"
                ? "bg-danger text-white"
                : "bg-abyss text-glow"
            }`}
          >
            <span aria-hidden className="flex-none">
              {t.kind === "error" ? <CrossIcon /> : <CheckIcon />}
            </span>
            {t.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
      <path d="M5 12.5 10 17.5 19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

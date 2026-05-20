import { createContext, useCallback, useContext, useState } from "react";

type Toast = {
  id: number;
  kind: "info" | "error";
  text: string;
};

type Ctx = {
  push: (kind: Toast["kind"], text: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-md px-4 py-3 shadow-lg text-sm animate-in slide-in-from-bottom-2 ${
              t.kind === "error"
                ? "bg-red-50 border border-red-200 text-red-800"
                : "bg-white border border-[var(--color-border)] text-[var(--color-fg)]"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

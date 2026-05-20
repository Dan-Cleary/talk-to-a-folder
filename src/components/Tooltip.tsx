import type { ReactNode } from "react";

type Props = {
  label: string;
  side?: "top" | "bottom";
  children: ReactNode;
};

/**
 * Lightweight CSS-only tooltip. Wrap a button/icon, set `label` to the
 * hover text. Appears above by default; pass side="bottom" to flip.
 */
export function Tooltip({ label, side = "top", children }: Props) {
  const positionClass =
    side === "top"
      ? "bottom-full mb-1.5 left-1/2 -translate-x-1/2"
      : "top-full mt-1.5 left-1/2 -translate-x-1/2";
  const arrowClass =
    side === "top"
      ? "top-full left-1/2 -translate-x-1/2 border-t-gray-900 border-l-transparent border-r-transparent border-b-transparent"
      : "bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 border-l-transparent border-r-transparent border-t-transparent";

  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${positionClass} px-2 py-1 rounded-md bg-gray-900 text-white text-[11px] font-medium whitespace-nowrap opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-100 origin-center z-50 shadow-lg`}
      >
        {label}
        <span
          className={`absolute w-0 h-0 border-4 ${arrowClass}`}
          aria-hidden
        />
      </span>
    </span>
  );
}

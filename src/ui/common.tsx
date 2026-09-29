import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LedgerState } from "../types";

/** 最近一次操作提示 */
export interface Toast {
  kind: "ok" | "err";
  text: string;
  key: number;
}

export function ToastBar({ toast }: { toast: Toast | null }) {
  if (!toast) return null;
  return (
    <div key={toast.key} className={`toast toast-${toast.kind}`}>
      {toast.kind === "ok" ? "✓ " : "⚠ "}
      {toast.text}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = (kind: Toast["kind"], text: string) => {
    window.clearTimeout(timer.current);
    setToast({ kind, text, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), 3200);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { toast, show };
}

/** 从已录数据中汇集探方编号 */
export function knownSquares(state: LedgerState): string[] {
  const set = new Set<string>();
  state.strata.forEach((s) => set.add(s.square));
  state.features.forEach((f) => set.add(f.square));
  state.finds.forEach((f) => set.add(f.square));
  return [...set].sort();
}

export function SquareInput({
  value,
  onChange,
  options,
  required = true,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
}) {
  return (
    <input
      list="square-list"
      value={value}
      required={required}
      placeholder="如 T0203"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <em className="field-hint">{hint}</em>}
      </span>
      {children}
    </label>
  );
}

export function stratumSeqOptions(
  state: LedgerState,
  square: string
): number[] {
  const sq = square.trim();
  if (!sq) return [];
  return state.strata
    .filter((s) => s.square === sq)
    .map((s) => s.seq)
    .sort((a, b) => a - b);
}

export function fmtTime(ts: number | null): string {
  if (!ts) return "尚未保存";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`;
}

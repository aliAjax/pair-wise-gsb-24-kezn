import { useCallback, useEffect, useRef, useState } from "react";
import {
  addFeature as domAddFeature,
  addFind as domAddFind,
  addStratum as domAddStratum,
  assignFind as domAssignFind,
  autosaveState,
  clearStorage,
  createState,
  deleteFeature as domDeleteFeature,
  deleteFind as domDeleteFind,
  deleteStratum as domDeleteStratum,
  loadState,
  parseState,
  placeFeature as domPlaceFeature,
  saveState,
  unassignFind as domUnassignFind,
  updateStratum as domUpdateStratum,
} from "./domain";
import type { Feature, Find, LedgerState, Result, Stratum } from "./types";

function initial(): LedgerState {
  try {
    return loadState() ?? createState();
  } catch {
    return createState();
  }
}

export interface LedgerApi {
  state: LedgerState;
  savedAt: number | null;
  dirty: boolean;
  mutate: <T>(fn: (s: LedgerState) => Result<T>) => Result<T>;
  addStratum: (raw: {
    square: string;
    seq: number;
    top: number;
    bottom: number;
    note?: string;
  }) => Result<Stratum>;
  updateStratum: (
    id: string,
    patch: { top?: number; bottom?: number; note?: string }
  ) => Result<Stratum>;
  deleteStratum: (id: string) => Result<void>;
  addFeature: (raw: {
    square: string;
    code: string;
    kind: string;
    stratumSeq: number | "" | null;
    coord: string;
    note?: string;
  }) => Result<Feature>;
  placeFeature: (id: string, seq: number | null) => Result<Feature>;
  deleteFeature: (id: string) => Result<void>;
  addFind: (raw: {
    square: string;
    name: string;
    count: number;
    coord: string;
    stratumSeq: number | "" | null;
    featureId: string | "" | null;
    note?: string;
  }) => Result<Find>;
  assignFind: (
    id: string,
    target: { stratumSeq: number | null; featureId?: string | null }
  ) => Result<Find>;
  unassignFind: (id: string) => Result<Find>;
  deleteFind: (id: string) => Result<void>;
  manualSave: () => void;
  importJSON: (text: string) => Result<LedgerState>;
  replaceState: (next: LedgerState) => void;
  wipe: () => void;
}

export function useLedger(): LedgerApi {
  const [state, setState] = useState<LedgerState>(initial);
  const [savedAt, setSavedAt] = useState<number | null>(state.savedAt);
  const [dirty, setDirty] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 防抖自动保存：现场录入不丢，重开页面接着整理
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      const at = autosaveState(stateRef.current);
      setSavedAt(at);
      setDirty(false);
    }, 400);
    return () => clearTimeout(t);
  }, [state, dirty]);

  // 关闭/刷新页面前兜底落盘
  useEffect(() => {
    const flush = () => {
      if (dirty) autosaveState(stateRef.current);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [dirty]);

  const mutate = useCallback(
    <T,>(fn: (s: LedgerState) => Result<T>): Result<T> => {
      const r = fn(stateRef.current);
      if (r.ok) {
        setState({ ...stateRef.current });
        setDirty(true);
      }
      return r;
    },
    []
  );

  const manualSave = useCallback(() => {
    const at = saveState(stateRef.current);
    setState({ ...stateRef.current });
    setSavedAt(at);
    setDirty(false);
  }, []);

  const replaceState = useCallback((next: LedgerState) => {
    setState(next);
    setDirty(true);
  }, []);

  const importJSON = useCallback(
    (text: string): Result<LedgerState> => {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        return { ok: false, error: "JSON 解析失败，不是有效存档文件" };
      }
      const parsed = parseState(data);
      if (parsed.ok) replaceState(parsed.value);
      return parsed;
    },
    [replaceState]
  );

  const wipe = useCallback(() => {
    clearStorage();
    const fresh = createState();
    setState(fresh);
    setSavedAt(null);
    setDirty(false);
  }, []);

  return {
    state,
    savedAt,
    dirty,
    mutate,
    addStratum: (raw) => mutate((s) => domAddStratum(s, raw)),
    updateStratum: (id, patch) => mutate((s) => domUpdateStratum(s, id, patch)),
    deleteStratum: (id) => mutate((s) => domDeleteStratum(s, id)),
    addFeature: (raw) => mutate((s) => domAddFeature(s, raw)),
    placeFeature: (id, seq) => mutate((s) => domPlaceFeature(s, id, seq)),
    deleteFeature: (id) => mutate((s) => domDeleteFeature(s, id)),
    addFind: (raw) => mutate((s) => domAddFind(s, raw)),
    assignFind: (id, target) => mutate((s) => domAssignFind(s, id, target)),
    unassignFind: (id) => mutate((s) => domUnassignFind(s, id)),
    deleteFind: (id) => mutate((s) => domDeleteFind(s, id)),
    manualSave,
    importJSON,
    replaceState,
    wipe,
  };
}

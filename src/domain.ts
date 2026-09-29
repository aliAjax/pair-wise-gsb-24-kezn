// 续编发掘簿 —— 纯领域逻辑（可在浏览器与 Node 测试中复用）
import type {
  Anomaly,
  Feature,
  Find,
  LedgerState,
  Result,
  SquareStat,
  Stratum,
  StratumStat,
} from "./types";

/** 标高比对容差：5 毫米，视为正常测量误差 */
export const ELEV_EPS = 0.005;

let seqCounter = 0;
export function uid(prefix: string): string {
  seqCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${seqCounter}`;
}

export function createState(): LedgerState {
  return { strata: [], features: [], finds: [], savedAt: null };
}

/** 坐标归一化：去空白、统一大写，E3 n4 → E3N4 */
export function normalizeCoord(coord: string): string {
  return coord.replace(/\s+/g, "").toUpperCase();
}

function numField(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function intField(v: unknown): number | null {
  const n = numField(v);
  if (n === null || !Number.isInteger(n)) return null;
  return n;
}

// ---------- 查询辅助 ----------

export function strataOf(state: LedgerState, square: string): Stratum[] {
  return state.strata
    .filter((s) => s.square === square)
    .sort((a, b) => a.seq - b.seq);
}

export function squaresList(state: LedgerState): string[] {
  const set = new Set<string>();
  state.strata.forEach((s) => set.add(s.square));
  state.features.forEach((f) => set.add(f.square));
  state.finds.forEach((f) => set.add(f.square));
  return [...set].sort();
}

function getFeature(state: LedgerState, id: string | null): Feature | null {
  if (!id) return null;
  return state.features.find((f) => f.id === id) ?? null;
}

/** 出土物实际归属的地层序号：显式指定优先，否则跟随关联遗迹 */
export function effectiveStratumSeq(
  state: LedgerState,
  find: Find
): number | null {
  if (find.stratumSeq !== null) return find.stratumSeq;
  const feature = getFeature(state, find.featureId);
  return feature ? feature.stratumSeq : null;
}

export function isFindPending(state: LedgerState, find: Find): boolean {
  return effectiveStratumSeq(state, find) === null;
}

// ---------- 地层录入 ----------

export interface StratumInput {
  square: string;
  seq: number;
  top: number;
  bottom: number;
  note?: string;
}

export function addStratum(
  state: LedgerState,
  raw: { square: string; seq: unknown; top: unknown; bottom: unknown; note?: string }
): Result<Stratum> {
  const square = raw.square.trim();
  if (!square) return { ok: false, error: "请填写探方编号" };
  const seq = intField(raw.seq);
  if (seq === null || seq <= 0)
    return { ok: false, error: "地层序号须为正整数" };
  const top = numField(raw.top);
  const bottom = numField(raw.bottom);
  if (top === null || bottom === null)
    return { ok: false, error: "顶、底标高须为数字（米）" };
  if (bottom >= top)
    return {
      ok: false,
      error: `第 ${seq} 层层序倒挂：底标高 ${bottom} 必须小于顶标高 ${top}`,
    };
  if (state.strata.some((s) => s.square === square && s.seq === seq))
    return { ok: false, error: `探方 ${square} 第 ${seq} 层已存在，同层序号不许重号` };

  const stratum: Stratum = {
    id: uid("s"),
    square,
    seq,
    top,
    bottom,
    note: raw.note?.trim() || undefined,
    createdAt: Date.now(),
  };
  state.strata.push(stratum);
  return { ok: true, value: stratum };
}

export function updateStratum(
  state: LedgerState,
  id: string,
  patch: { top?: unknown; bottom?: unknown; note?: string }
): Result<Stratum> {
  const s = state.strata.find((x) => x.id === id);
  if (!s) return { ok: false, error: "地层记录不存在" };
  const top = patch.top === undefined ? s.top : numField(patch.top);
  const bottom = patch.bottom === undefined ? s.bottom : numField(patch.bottom);
  if (top === null || bottom === null)
    return { ok: false, error: "顶、底标高须为数字（米）" };
  if (bottom >= top)
    return {
      ok: false,
      error: `第 ${s.seq} 层层序倒挂：底标高 ${bottom} 必须小于顶标高 ${top}`,
    };
  s.top = top;
  s.bottom = bottom;
  if (patch.note !== undefined) s.note = patch.note.trim() || undefined;
  return { ok: true, value: s };
}

/** 删层：仍有遗迹/出土物挂在该层时拒绝，避免断了引用 */
export function deleteStratum(state: LedgerState, id: string): Result<void> {
  const s = state.strata.find((x) => x.id === id);
  if (!s) return { ok: false, error: "地层记录不存在" };
  const usedBy: string[] = [];
  state.features.forEach((f) => {
    if (f.square === s.square && f.stratumSeq === s.seq)
      usedBy.push(`遗迹 ${f.code}`);
  });
  state.finds.forEach((f) => {
    if (f.square === s.square && f.stratumSeq === s.seq)
      usedBy.push(`出土物「${f.name}」`);
    const feature = getFeature(state, f.featureId);
    if (
      f.stratumSeq === null &&
      feature &&
      feature.square === s.square &&
      feature.stratumSeq === s.seq
    )
      usedBy.push(`出土物「${f.name}」（随遗迹 ${feature.code}）`);
  });
  if (usedBy.length)
    return {
      ok: false,
      error: `第 ${s.seq} 层仍被 ${[...new Set(usedBy)].join("、")} 引用，请先改挂再删除`,
    };
  state.strata = state.strata.filter((x) => x.id !== id);
  return { ok: true, value: undefined };
}

// ---------- 遗迹录入 ----------

export interface FeatureInput {
  square: string;
  code: string;
  kind: string;
  stratumSeq: number | null;
  coord: string;
  note?: string;
}

export function addFeature(
  state: LedgerState,
  raw: {
    square: string;
    code: string;
    kind: string;
    stratumSeq: number | "" | null;
    coord: string;
    note?: string;
  }
): Result<Feature> {
  const square = raw.square.trim();
  const code = raw.code.trim();
  if (!square) return { ok: false, error: "请填写探方编号" };
  if (!code) return { ok: false, error: "请填写遗迹编号，如 H12" };
  if (!raw.coord.trim()) return { ok: false, error: "请填写坐标点" };
  if (
    state.features.some(
      (f) => f.square === square && f.code.toUpperCase() === code.toUpperCase()
    )
  )
    return { ok: false, error: `探方 ${square} 内遗迹编号 ${code} 已存在` };

  let seq: number | null = null;
  if (raw.stratumSeq !== "" && raw.stratumSeq !== null) {
    seq = intField(raw.stratumSeq);
    if (seq === null) return { ok: false, error: "地层序号无效" };
    if (!state.strata.some((s) => s.square === square && s.seq === seq))
      return {
        ok: false,
        error: `探方 ${square} 尚无第 ${seq} 层，请先录地层`,
      };
  }

  const feature: Feature = {
    id: uid("f"),
    square,
    code,
    kind: raw.kind.trim() || "未分类",
    stratumSeq: seq,
    coord: normalizeCoord(raw.coord),
    note: raw.note?.trim() || undefined,
    createdAt: Date.now(),
  };
  state.features.push(feature);
  return { ok: true, value: feature };
}

/** 遗迹归层/改层；挂在该遗迹下、未单独指层的出土物会随之归入 */
export function placeFeature(
  state: LedgerState,
  id: string,
  seq: number | null
): Result<Feature> {
  const f = state.features.find((x) => x.id === id);
  if (!f) return { ok: false, error: "遗迹不存在" };
  if (seq !== null) {
    if (!Number.isInteger(seq) || seq <= 0)
      return { ok: false, error: "地层序号无效" };
    if (!state.strata.some((s) => s.square === f.square && s.seq === seq))
      return { ok: false, error: `探方 ${f.square} 尚无第 ${seq} 层` };
  }
  f.stratumSeq = seq;
  return { ok: true, value: f };
}

export function deleteFeature(state: LedgerState, id: string): Result<void> {
  const f = state.features.find((x) => x.id === id);
  if (!f) return { ok: false, error: "遗迹不存在" };
  // 解除出土物关联；显式归层的不受影响，其余退回待归区
  state.finds.forEach((item) => {
    if (item.featureId === id) item.featureId = null;
  });
  state.features = state.features.filter((x) => x.id !== id);
  return { ok: true, value: undefined };
}

// ---------- 出土物录入 ----------

export function addFind(
  state: LedgerState,
  raw: {
    square: string;
    name: string;
    count: unknown;
    coord: string;
    stratumSeq: number | "" | null;
    featureId: string | "" | null;
    note?: string;
  }
): Result<Find> {
  const square = raw.square.trim();
  const name = raw.name.trim();
  if (!square) return { ok: false, error: "请填写探方编号" };
  if (!name) return { ok: false, error: "请填写出土物名称" };
  const count = intField(raw.count);
  if (count === null || count <= 0)
    return { ok: false, error: "出土件数须为正整数" };
  if (!raw.coord.trim()) return { ok: false, error: "请填写坐标点" };

  let seq: number | null = null;
  if (raw.stratumSeq !== "" && raw.stratumSeq !== null) {
    seq = intField(raw.stratumSeq);
    if (seq === null) return { ok: false, error: "地层序号无效" };
    if (!state.strata.some((s) => s.square === square && s.seq === seq))
      return { ok: false, error: `探方 ${square} 尚无第 ${seq} 层` };
  }

  let featureId: string | null = null;
  if (raw.featureId) {
    const feature = state.features.find((f) => f.id === raw.featureId);
    if (!feature) return { ok: false, error: "关联遗迹不存在" };
    if (feature.square !== square)
      return { ok: false, error: `遗迹 ${feature.code} 不在探方 ${square}` };
    featureId = feature.id;
  }

  const find: Find = {
    id: uid("it"),
    square,
    name,
    count,
    coord: normalizeCoord(raw.coord),
    stratumSeq: seq,
    featureId,
    note: raw.note?.trim() || undefined,
    createdAt: Date.now(),
  };
  state.finds.push(find);
  return { ok: true, value: find };
}

/** 待归区出土物归入某层（可同时改挂遗迹） */
export function assignFind(
  state: LedgerState,
  id: string,
  target: { stratumSeq: number | null; featureId?: string | null }
): Result<Find> {
  const find = state.finds.find((x) => x.id === id);
  if (!find) return { ok: false, error: "出土物记录不存在" };

  let featureId = find.featureId;
  if (target.featureId !== undefined) {
    if (target.featureId === null) {
      featureId = null;
    } else {
      const feature = state.features.find((f) => f.id === target.featureId);
      if (!feature) return { ok: false, error: "关联遗迹不存在" };
      if (feature.square !== find.square)
        return { ok: false, error: "遗迹与出土物不在同一探方" };
      featureId = feature.id;
    }
  }

  let seq = find.stratumSeq;
  if (target.stratumSeq !== null) {
    if (!Number.isInteger(target.stratumSeq) || target.stratumSeq <= 0)
      return { ok: false, error: "地层序号无效" };
    if (
      !state.strata.some(
        (s) => s.square === find.square && s.seq === target.stratumSeq
      )
    )
      return { ok: false, error: `探方 ${find.square} 尚无第 ${target.stratumSeq} 层` };
    seq = target.stratumSeq;
  }
  find.featureId = featureId;
  find.stratumSeq = seq;
  return { ok: true, value: find };
}

/** 已归层的出土物退回待归区：清掉显式层位，必要时连遗迹关联一起解除 */
export function unassignFind(state: LedgerState, id: string): Result<Find> {
  const find = state.finds.find((x) => x.id === id);
  if (!find) return { ok: false, error: "出土物记录不存在" };
  find.stratumSeq = null;
  find.featureId = null;
  return { ok: true, value: find };
}

export function deleteFind(state: LedgerState, id: string): Result<void> {
  if (!state.finds.some((x) => x.id === id))
    return { ok: false, error: "出土物记录不存在" };
  state.finds = state.finds.filter((x) => x.id !== id);
  return { ok: true, value: undefined };
}

// ---------- 异常核查 ----------

export function auditSquare(state: LedgerState, square: string): Anomaly[] {
  const out: Anomaly[] = [];
  const strata = strataOf(state, square);

  // 重号（录入时已拦，导入/历史数据仍可能存在）
  const seen = new Map<number, number>();
  state.strata.forEach((s) => {
    if (s.square !== square) return;
    seen.set(s.seq, (seen.get(s.seq) ?? 0) + 1);
  });
  seen.forEach((times, seq) => {
    if (times > 1)
      out.push({
        level: "error",
        kind: "dup_seq",
        square,
        seqs: [seq],
        message: `第 ${seq} 层重号 ${times} 次，同层序号不许重号`,
      });
  });

  // 层内倒挂 + 序号断档 / 标高衔接
  for (let i = 0; i < strata.length; i++) {
    const cur = strata[i];
    if (cur.bottom >= cur.top)
      out.push({
        level: "error",
        kind: "inverted",
        square,
        seqs: [cur.seq],
        message: `第 ${cur.seq} 层层序倒挂：底标高 ${cur.bottom}m 不低于顶标高 ${cur.top}m`,
      });

    if (i > 0) {
      const upper = strata[i - 1];
      // 序号断档
      if (cur.seq - upper.seq > 1) {
        const missing: number[] = [];
        for (let q = upper.seq + 1; q < cur.seq; q++) missing.push(q);
        out.push({
          level: "error",
          kind: "gap",
          square,
          seqs: [upper.seq, cur.seq],
          message: `地层序号断档：第 ${upper.seq} 层之后直接是第 ${cur.seq} 层，缺第 ${missing.join("、")} 层`,
        });
      }
      // 标高衔接：上层底 = 下层顶
      const diff = roundMm(upper.bottom - cur.top);
      if (Math.abs(diff) > ELEV_EPS) {
        if (diff > 0)
          out.push({
            level: "error",
            kind: "gap",
            square,
            seqs: [upper.seq, cur.seq],
            message: `第 ${upper.seq} 层底标高 ${upper.bottom}m 与第 ${cur.seq} 层顶标高 ${cur.top}m 之间断档 ${diff}m（中间缺土）`,
          });
        else
          out.push({
            level: "error",
            kind: "overlap",
            square,
            seqs: [upper.seq, cur.seq],
            message: `第 ${upper.seq} 层与第 ${cur.seq} 层标高重叠 ${Math.abs(diff)}m（第 ${cur.seq} 层顶 ${cur.top}m 高于第 ${upper.seq} 层底 ${upper.bottom}m，疑似层序倒挂）`,
          });
      }
    }
  }

  const seqSet = new Set(strata.map((s) => s.seq));

  // 遗迹核查
  const coordMap = new Map<string, string[]>();
  state.features
    .filter((f) => f.square === square)
    .forEach((f) => {
      if (f.stratumSeq === null)
        out.push({
          level: "warn",
          kind: "feature_unplaced",
          square,
          message: `遗迹 ${f.code}（${f.kind}）尚未归入地层，暂不参与分层统计`,
        });
      else if (!seqSet.has(f.stratumSeq))
        out.push({
          level: "error",
          kind: "dangling_ref",
          square,
          seqs: [f.stratumSeq],
          message: `遗迹 ${f.code} 指向第 ${f.stratumSeq} 层，但该层不存在`,
        });
      const key = f.coord;
      coordMap.set(key, [...(coordMap.get(key) ?? []), f.code]);
    });
  coordMap.forEach((codes, coord) => {
    if (codes.length > 1)
      out.push({
        level: "warn",
        kind: "dup_coord",
        square,
        message: `坐标 ${coord} 上有多个遗迹单位：${codes.join("、")}，请核实是否重复记录`,
      });
  });

  // 出土物核查
  const findCoordMap = new Map<string, string[]>();
  state.finds
    .filter((x) => x.square === square)
    .forEach((x) => {
      const eff = effectiveStratumSeq(state, x);
      if (eff === null)
        out.push({
          level: "info",
          kind: "find_pending",
          square,
          message: `出土物「${x.name}」${x.count} 件（${x.coord}）在待归区，归入地层后才进入统计`,
        });
      else if (!seqSet.has(eff))
        out.push({
          level: "error",
          kind: "dangling_ref",
          square,
          seqs: [eff],
          message: `出土物「${x.name}」指向第 ${eff} 层，但该层不存在`,
        });
      if (x.featureId && !state.features.some((f) => f.id === x.featureId))
        out.push({
          level: "error",
          kind: "dangling_ref",
          square,
          message: `出土物「${x.name}」关联的遗迹单位已不存在`,
        });
      const key = x.coord;
      findCoordMap.set(key, [...(findCoordMap.get(key) ?? []), x.name]);
    });
  findCoordMap.forEach((names, coord) => {
    if (names.length > 1)
      out.push({
        level: "warn",
        kind: "dup_coord",
        square,
        message: `坐标 ${coord} 上有多条出土物记录：${names.join("、")}，请核实`,
      });
  });

  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort(
    (a, b) =>
      rank[a.level] - rank[b.level] ||
      (a.seqs?.[0] ?? 0) - (b.seqs?.[0] ?? 0) ||
      a.message.localeCompare(b.message)
  );
}

export function audit(state: LedgerState): Anomaly[] {
  return squaresList(state).flatMap((sq) => auditSquare(state, sq));
}

function roundMm(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ---------- 统计 ----------

export function squareStats(state: LedgerState, square: string): SquareStat {
  const strata = strataOf(state, square);
  const rows: StratumStat[] = strata.map((stratum) => {
    const features = state.features.filter(
      (f) => f.square === square && f.stratumSeq === stratum.seq
    );
    const finds = state.finds.filter(
      (f) => f.square === square && effectiveStratumSeq(state, f) === stratum.seq
    );
    return {
      stratum,
      features,
      finds,
      findCount: finds.reduce((sum, f) => sum + f.count, 0),
    };
  });
  const unplacedFeatures = state.features.filter(
    (f) => f.square === square && f.stratumSeq === null
  );
  const pendingFinds = state.finds.filter(
    (f) => f.square === square && isFindPending(state, f)
  );
  return {
    square,
    strata: rows,
    unplacedFeatures,
    pendingFinds,
    totalFindCount: rows.reduce((sum, r) => sum + r.findCount, 0),
  };
}

// ---------- 导出台账（CSV） ----------

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

export function strataCSV(state: LedgerState): string {
  return csv(
    ["探方", "地层序号", "顶标高(m)", "底标高(m)", "厚度(m)", "备注"],
    [...state.strata]
      .sort((a, b) => a.square.localeCompare(b.square) || a.seq - b.seq)
      .map((s) => [
        s.square,
        s.seq,
        s.top,
        s.bottom,
        roundMm(s.top - s.bottom),
        s.note ?? "",
      ])
  );
}

export function featuresCSV(state: LedgerState): string {
  return csv(
    ["探方", "遗迹编号", "类型", "地层序号", "坐标", "状态", "备注"],
    [...state.features]
      .sort((a, b) => a.square.localeCompare(b.square) || a.code.localeCompare(b.code))
      .map((f) => [
        f.square,
        f.code,
        f.kind,
        f.stratumSeq ?? "",
        f.coord,
        f.stratumSeq === null ? "待归层" : `第${f.stratumSeq}层`,
        f.note ?? "",
      ])
  );
}

export function findsCSV(state: LedgerState, includePending: boolean): string {
  return csv(
    [
      "探方",
      "出土物",
      "件数",
      "坐标",
      "关联遗迹",
      "归入地层",
      "状态",
      "备注",
    ],
    state.finds
      .filter((f) => includePending || !isFindPending(state, f))
      .map((f) => {
        const eff = effectiveStratumSeq(state, f);
        const feature = getFeature(state, f.featureId);
        return [
          f.square,
          f.name,
          f.count,
          f.coord,
          feature ? feature.code : "",
          eff ?? "",
          eff === null ? "待归区" : `第${eff}层`,
          f.note ?? "",
        ];
      })
  );
}

export function summaryCSV(state: LedgerState): string {
  return csv(
    ["探方", "地层序号", "顶标高(m)", "底标高(m)", "遗迹单位", "出土物件数"],
    squaresList(state).flatMap((sq) => {
      const stat = squareStats(state, sq);
      const rows = stat.strata.map((r) => [
        sq,
        r.stratum.seq,
        r.stratum.top,
        r.stratum.bottom,
        r.features.map((f) => f.code).join(" "),
        r.findCount,
      ]);
      if (stat.pendingFinds.length)
        rows.push([
          sq,
          "待归区",
          "",
          "",
          stat.unplacedFeatures.map((f) => f.code).join(" "),
          stat.pendingFinds.reduce((n, f) => n + f.count, 0),
        ]);
      return rows;
    })
  );
}

// ---------- 存档读写 / 校验 ----------

const STORAGE_KEY = "xubian-fajue-bu:v1";

export function saveState(state: LedgerState): number {
  const at = Date.now();
  state.savedAt = at;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return at;
}

/** 自动保存：写入本地存档但不改动内存对象，返回保存时间戳 */
export function autosaveState(state: LedgerState): number {
  const at = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt: at }));
  return at;
}

export function loadState(): LedgerState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const result = parseState(parsed);
    return result.ok ? result.value : null;
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function serializeState(state: LedgerState): string {
  return JSON.stringify(
    { ...state, savedAt: null, exportedAt: new Date().toISOString() },
    null,
    2
  );
}

export function parseState(input: unknown): Result<LedgerState> {
  if (!input || typeof input !== "object")
    return { ok: false, error: "存档格式不正确" };
  const obj = input as Record<string, unknown>;
  const asList = (v: unknown): unknown[] =>
    Array.isArray(v) ? v : [];
  const state = createState();
  for (const raw of asList(obj.strata)) {
    const r = raw as Record<string, unknown>;
    const made = addStratum(state, {
      square: String(r.square ?? ""),
      seq: r.seq,
      top: r.top,
      bottom: r.bottom,
      note: typeof r.note === "string" ? r.note : undefined,
    });
    if (!made.ok) return { ok: false, error: `地层存档无效：${made.error}` };
  }
  for (const raw of asList(obj.features)) {
    const r = raw as Record<string, unknown>;
    const made = addFeature(state, {
      square: String(r.square ?? ""),
      code: String(r.code ?? ""),
      kind: String(r.kind ?? ""),
      stratumSeq:
        r.stratumSeq === null || r.stratumSeq === undefined
          ? null
          : (r.stratumSeq as number),
      coord: String(r.coord ?? ""),
      note: typeof r.note === "string" ? r.note : undefined,
    });
    if (!made.ok) return { ok: false, error: `遗迹存档无效：${made.error}` };
    // 恢复原始 id
    state.features[state.features.length - 1].id = String(r.id ?? made.value.id);
  }
  for (const raw of asList(obj.finds)) {
    const r = raw as Record<string, unknown>;
    const made = addFind(state, {
      square: String(r.square ?? ""),
      name: String(r.name ?? ""),
      count: r.count,
      coord: String(r.coord ?? ""),
      stratumSeq:
        r.stratumSeq === null || r.stratumSeq === undefined
          ? null
          : (r.stratumSeq as number),
      featureId:
        r.featureId === null || r.featureId === undefined
          ? null
          : String(r.featureId),
      note: typeof r.note === "string" ? r.note : undefined,
    });
    if (!made.ok) return { ok: false, error: `出土物存档无效：${made.error}` };
    state.finds[state.finds.length - 1].id = String(r.id ?? made.value.id);
  }
  state.savedAt = typeof obj.savedAt === "number" ? obj.savedAt : null;
  return { ok: true, value: state };
}

// 续编发掘簿 · 领域核心
// 纯数据结构与纯函数，不依赖 DOM，便于在 Node 下测试。

export const STORAGE_KEY = "xubian-fajue-bu:v1";
export const SCHEMA_VERSION = 1;
/** 标高衔接容差（米）：差值在 5mm 内视为接上 */
export const ELEV_TOL = 0.005;

export interface Layer {
  id: string;
  trench: string; // 探方号，如 T0203
  seq: number; // 地层序号（自然数，由浅入深）
  top: number; // 顶板标高 m
  bottom: number; // 底板标高 m
  note?: string;
}

export interface Feature {
  id: string;
  trench: string;
  seq?: number | null; // 所在地层序号；未判明归层时为空
  code: string; // 遗迹单位号，如 H12
  kind: string; // 灰坑/墓葬/房址/沟/柱洞…
  coord: string; // 坐标，如 E3.0N4.0
}

export interface Find {
  id: string;
  trench: string;
  seq?: number | null; // 归入的地层序号；null = 待归区
  featureId?: string | null; // 关联遗迹单位（可空）
  coord: string; // 坐标
  count: number; // 出土物件数
  material: string; // 类别/描述，如 陶片
}

export interface LedgerState {
  version: number;
  layers: Layer[];
  features: Feature[];
  finds: Find[];
  updatedAt: string;
}

export type Severity = "error" | "warning";

export interface Anomaly {
  trench: string;
  seq?: number | null;
  kind: string;
  severity: Severity;
  message: string;
}

export interface Result<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export function emptyState(): LedgerState {
  return { version: SCHEMA_VERSION, layers: [], features: [], finds: [], updatedAt: "" };
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: string): Result<T> {
  return { ok: false, error };
}

// ---------- 基础工具 ----------

export function normTrench(s: string): string {
  return s.trim().toUpperCase();
}

export function normCode(s: string): string {
  return s.trim().toUpperCase();
}

/** 坐标归一化：去空白、转大写，便于查重；不强制坐标系格式 */
export function normCoord(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

export function fmtNum(n: number, digits = 2): string {
  return n.toFixed(digits);
}

export function fmtLayer(seq: number | null | undefined): string {
  return seq == null ? "待归" : `第${seq}层`;
}

let counter = 0;
export function genId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

function trenchLayers(state: LedgerState, trench: string): Layer[] {
  return state.layers
    .filter((l) => l.trench === trench)
    .slice()
    .sort((a, b) => a.seq - b.seq);
}

// ---------- 地层录入 / 编辑 ----------

function checkLayerInput(
  state: LedgerState,
  trench: string,
  seq: number,
  top: number,
  bottom: number,
  excludeId?: string
): Result<null> {
  if (!trench) return fail("请填写探方号");
  if (!Number.isInteger(seq) || seq < 1) return fail("地层序号必须是不小于 1 的整数");
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return fail("顶、底标高必须是数字");
  if (bottom >= top - ELEV_TOL) {
    return fail(`第${seq}层底板标高 ${fmtNum(bottom)} 必须低于顶板标高 ${fmtNum(top)}（层序倒挂）`);
  }
  const dup = state.layers.find(
    (l) => l.trench === trench && l.seq === seq && l.id !== excludeId
  );
  if (dup) {
    return fail(`${trench} 第${seq}层 已存在，同探方内同层序号不许重号`);
  }
  return ok(null);
}

export interface LayerInput {
  trench: string;
  seq: number;
  top: number;
  bottom: number;
  note?: string;
}

export function addLayer(state: LedgerState, input: LayerInput): Result<LedgerState> {
  const trench = normTrench(input.trench);
  const v = checkLayerInput(state, trench, input.seq, input.top, input.bottom);
  if (!v.ok) return fail(v.error!);
  const layer: Layer = {
    id: genId("L"),
    trench,
    seq: input.seq,
    top: input.top,
    bottom: input.bottom,
    note: input.note?.trim() || undefined,
  };
  return ok({ ...state, layers: [...state.layers, layer], updatedAt: new Date().toISOString() });
}

export function updateLayer(state: LedgerState, id: string, patch: Partial<LayerInput>): Result<LedgerState> {
  const old = state.layers.find((l) => l.id === id);
  if (!old) return fail("地层记录不存在");
  const next: Layer = {
    ...old,
    ...("note" in patch ? { note: patch.note?.trim() || undefined } : {}),
    ...(patch.trench !== undefined ? { trench: normTrench(patch.trench) } : {}),
    ...(patch.seq !== undefined ? { seq: patch.seq } : {}),
    ...(patch.top !== undefined ? { top: patch.top } : {}),
    ...(patch.bottom !== undefined ? { bottom: patch.bottom } : {}),
  };
  const v = checkLayerInput(state, next.trench, next.seq, next.top, next.bottom, id);
  if (!v.ok) return fail(v.error!);

  let layers = state.layers.map((l) => (l.id === id ? next : l));
  let features = state.features;
  let finds = state.finds;
  // 探方或序号变更：级联更新挂靠在该层的遗迹、出土物
  if (next.trench !== old.trench || next.seq !== old.seq) {
    features = features.map((f) =>
      f.id !== id && f.trench === old.trench && f.seq === old.seq
        ? { ...f, trench: next.trench, seq: next.seq }
        : f
    );
    finds = finds.map((f) =>
      f.trench === old.trench && f.seq === old.seq
        ? { ...f, trench: next.trench, seq: next.seq }
        : f
    );
  }
  return ok({ ...state, layers, features, finds, updatedAt: new Date().toISOString() });
}

export function deleteLayer(state: LedgerState, id: string): Result<LedgerState> {
  const layer = state.layers.find((l) => l.id === id);
  if (!layer) return fail("地层记录不存在");
  const usedFeature = state.features.find(
    (f) => f.trench === layer.trench && f.seq === layer.seq
  );
  if (usedFeature) {
    return fail(
      `第${layer.seq}层上有遗迹单位 ${usedFeature.code}，请先处理遗迹再删除地层`
    );
  }
  // 已归入该层的出土物退回待归区，不直接删除
  const finds = state.finds.map((f) =>
    f.trench === layer.trench && f.seq === layer.seq ? { ...f, seq: null } : f
  );
  return ok({
    ...state,
    layers: state.layers.filter((l) => l.id !== id),
    finds,
    updatedAt: new Date().toISOString(),
  });
}

// ---------- 遗迹单位 ----------

export interface FeatureInput {
  trench: string;
  seq?: number | null;
  code: string;
  kind: string;
  coord: string;
}

function checkFeatureInput(
  state: LedgerState,
  trench: string,
  seq: number | null | undefined,
  code: string,
  coord: string,
  excludeId?: string
): Result<null> {
  if (!trench) return fail("请填写探方号");
  if (!code) return fail("请填写遗迹单位号（如 H12）");
  if (!coord) return fail("请填写坐标");
  if (seq != null) {
    if (!Number.isInteger(seq) || seq < 1) return fail("地层序号必须是不小于 1 的整数");
    if (!state.layers.some((l) => l.trench === trench && l.seq === seq)) {
      return fail(`${trench} 第${seq}层 尚未建立，请先补录地层`);
    }
  }
  if (state.features.some((f) => f.trench === trench && f.code === code && f.id !== excludeId)) {
    return fail(`${trench} 内遗迹单位 ${code} 已存在，单位号不许重复`);
  }
  if (
    state.features.some(
      (f) => f.trench === trench && f.coord && normCoord(f.coord) === normCoord(coord) && f.id !== excludeId
    )
  ) {
    return fail(`${trench} 坐标 ${coord} 已被其他遗迹单位占用，禁止重复坐标`);
  }
  return ok(null);
}

export function addFeature(state: LedgerState, input: FeatureInput): Result<LedgerState> {
  const trench = normTrench(input.trench);
  const seq = input.seq ?? null;
  const code = normCode(input.code);
  const coord = input.coord.trim();
  const v = checkFeatureInput(state, trench, seq, code, coord);
  if (!v.ok) return fail(v.error!);
  const feature: Feature = {
    id: genId("F"),
    trench,
    seq,
    code,
    kind: input.kind.trim(),
    coord,
  };
  return ok({ ...state, features: [...state.features, feature], updatedAt: new Date().toISOString() });
}

export function updateFeature(state: LedgerState, id: string, patch: Partial<FeatureInput>): Result<LedgerState> {
  const old = state.features.find((f) => f.id === id);
  if (!old) return fail("遗迹单位不存在");
  const next: Feature = {
    ...old,
    ...(patch.trench !== undefined ? { trench: normTrench(patch.trench) } : {}),
    ...(patch.seq !== undefined ? { seq: patch.seq ?? null } : {}),
    ...(patch.code !== undefined ? { code: normCode(patch.code) } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind.trim() } : {}),
    ...(patch.coord !== undefined ? { coord: patch.coord.trim() } : {}),
  };
  const v = checkFeatureInput(state, next.trench, next.seq, next.code, next.coord, id);
  if (!v.ok) return fail(v.error!);

  let features = state.features.map((f) => (f.id === id ? next : f));
  let finds = state.finds;
  // 遗迹改层/改探方：挂靠的出土物随行，但仍可独立留在待归区（featureId 非空而 seq 为空）
  if (next.trench !== old.trench || next.seq !== old.seq) {
    finds = finds.map((f) =>
      f.featureId === id ? { ...f, trench: next.trench, seq: next.seq } : f
    );
  }
  return ok({ ...state, features, finds, updatedAt: new Date().toISOString() });
}

export function deleteFeature(state: LedgerState, id: string): Result<LedgerState> {
  const feature = state.features.find((f) => f.id === id);
  if (!feature) return fail("遗迹单位不存在");
  if (state.finds.some((f) => f.featureId === id)) {
    return fail(`遗迹 ${feature.code} 下挂有出土物，请先改挂或退回待归区`);
  }
  return ok({
    ...state,
    features: state.features.filter((f) => f.id !== id),
    updatedAt: new Date().toISOString(),
  });
}

// ---------- 出土物（含待归区） ----------

export interface FindInput {
  trench: string;
  seq?: number | null;
  featureId?: string | null;
  coord: string;
  count: number;
  material: string;
}

function checkFindInput(
  state: LedgerState,
  trench: string,
  seq: number | null | undefined,
  featureId: string | null | undefined,
  coord: string,
  count: number,
  material: string
): Result<null> {
  if (!trench) return fail("请填写探方号");
  if (!coord) return fail("请填写坐标");
  if (!material.trim()) return fail("请填写出土物类别/描述");
  if (!Number.isFinite(count) || count < 1 || Math.floor(count) !== count) {
    return fail("出土物件数必须是不小于 1 的整数");
  }
  if (seq != null) {
    if (!Number.isInteger(seq) || seq < 1) return fail("地层序号必须是不小于 1 的整数");
    if (!state.layers.some((l) => l.trench === trench && l.seq === seq)) {
      return fail(`${trench} 第${seq}层 尚未建立，无法归入；可先存入待归区`);
    }
  }
  if (featureId) {
    const feature = state.features.find((f) => f.id === featureId);
    if (!feature) return fail("所选遗迹单位不存在");
    if (feature.trench !== trench) return fail(`遗迹 ${feature.code} 不在探方 ${trench}`);
    if (seq != null && feature.seq != null && feature.seq !== seq) {
      return fail(`遗迹 ${feature.code} 属于第${feature.seq}层，与所填第${seq}层不一致`);
    }
  }
  return ok(null);
}

export function addFind(state: LedgerState, input: FindInput): Result<LedgerState> {
  const trench = normTrench(input.trench);
  const seq = input.seq ?? null;
  const featureId = input.featureId || null;
  const v = checkFindInput(state, trench, seq, featureId, input.coord, input.count, input.material);
  if (!v.ok) return fail(v.error!);
  const find: Find = {
    id: genId("X"),
    trench,
    seq,
    featureId,
    coord: input.coord.trim(),
    count: Math.floor(input.count),
    material: input.material.trim(),
  };
  return ok({ ...state, finds: [...state.finds, find], updatedAt: new Date().toISOString() });
}

/** 待归区出土物归入某层（可同时挂到该层遗迹） */
export function assignFind(
  state: LedgerState,
  id: string,
  seq: number,
  featureId?: string | null
): Result<LedgerState> {
  const find = state.finds.find((f) => f.id === id);
  if (!find) return fail("出土物记录不存在");
  const v = checkFindInput(state, find.trench, seq, featureId ?? null, find.coord, find.count, find.material);
  if (!v.ok) return fail(v.error!);
  return ok({
    ...state,
    finds: state.finds.map((f) =>
      f.id === id ? { ...f, seq, featureId: featureId ?? null } : f
    ),
    updatedAt: new Date().toISOString(),
  });
}

/** 已归层的出土物退回待归区 */
export function unassignFind(state: LedgerState, id: string): Result<LedgerState> {
  const find = state.finds.find((f) => f.id === id);
  if (!find) return fail("出土物记录不存在");
  return ok({
    ...state,
    finds: state.finds.map((f) => (f.id === id ? { ...f, seq: null, featureId: null } : f)),
    updatedAt: new Date().toISOString(),
  });
}

export function deleteFind(state: LedgerState, id: string): Result<LedgerState> {
  if (!state.finds.some((f) => f.id === id)) return fail("出土物记录不存在");
  return ok({
    ...state,
    finds: state.finds.filter((f) => f.id !== id),
    updatedAt: new Date().toISOString(),
  });
}

// ---------- 查询 / 统计 ----------

export function trenches(state: LedgerState): string[] {
  const set = new Set<string>();
  state.layers.forEach((l) => set.add(l.trench));
  state.features.forEach((f) => set.add(f.trench));
  state.finds.forEach((f) => set.add(f.trench));
  return Array.from(set).sort();
}

/** 只有已归入地层的出土物才进入统计 */
export function statsForTrench(state: LedgerState, trench: string) {
  const layers = trenchLayers(state, trench);
  const findCount = state.finds
    .filter((f) => f.trench === trench && f.seq != null)
    .reduce((s, f) => s + f.count, 0);
  const pending = state.finds.filter((f) => f.trench === trench && f.seq == null).length;
  return {
    layers: layers.length,
    features: state.features.filter((f) => f.trench === trench).length,
    findCount,
    pending,
  };
}

export function findCountOfLayer(state: LedgerState, trench: string, seq: number): number {
  return state.finds
    .filter((f) => f.trench === trench && f.seq === seq)
    .reduce((s, f) => s + f.count, 0);
}

// ---------- 异常核查 ----------

export function validateTrench(state: LedgerState, trench: string): Anomaly[] {
  const out: Anomaly[] = [];
  const layers = trenchLayers(state, trench);
  const seqs = layers.map((l) => l.seq);

  // 重号（正常录入已拦截，导入/历史数据仍需兜底）
  const seen = new Map<number, number>();
  for (const s of seqs) seen.set(s, (seen.get(s) ?? 0) + 1);
  seen.forEach((n, s) => {
    if (n > 1) {
      out.push({
        trench,
        seq: s,
        kind: "重号",
        severity: "error",
        message: `${trench} 第${s}层 出现 ${n} 条记录，同层序号不许重号`,
      });
    }
  });

  // 缺号
  if (layers.length > 0) {
    const max = Math.max(...seqs);
    for (let s = 1; s <= max; s++) {
      if (!seqs.includes(s)) {
        out.push({
          trench,
          seq: s,
          kind: "缺号",
          severity: "error",
          message: `${trench} 地层断档：第${s}层缺失（现有 1–${max}，请补录或说明）`,
        });
      }
    }
  }

  // 单层倒挂 + 相邻层衔接
  for (const l of layers) {
    if (l.bottom >= l.top - ELEV_TOL) {
      out.push({
        trench,
        seq: l.seq,
        kind: "层序倒挂",
        severity: "error",
        message: `${trench} 第${l.seq}层 顶板 ${fmtNum(l.top)}m 不高于底板 ${fmtNum(
          l.bottom
        )}m，层序倒挂`,
      });
    }
  }
  for (let i = 1; i < layers.length; i++) {
    const upper = layers[i - 1];
    const lower = layers[i];
    if (lower.seq !== upper.seq + 1) continue; // 缺号已另行列出
    // 正常衔接：下层顶板标高 == 上层底板标高。
    // 下层顶板高于上层底板 → 两层占据同一标高区间 → 重叠；
    // 下层顶板低于上层底板 → 两区间之间留出空段 → 断档。
    const d = lower.top - upper.bottom;
    if (d > ELEV_TOL) {
      out.push({
        trench,
        seq: lower.seq,
        kind: "标高重叠",
        severity: "error",
        message: `${trench} 第${upper.seq}层底板 ${fmtNum(upper.bottom)}m 低于第${
          lower.seq
        }层顶板 ${fmtNum(lower.top)}m，地层区间重叠 ${fmtNum(d)}m`,
      });
    } else if (d < -ELEV_TOL) {
      out.push({
        trench,
        seq: lower.seq,
        kind: "标高断档",
        severity: "warning",
        message: `${trench} 第${upper.seq}层底板 ${fmtNum(upper.bottom)}m 与第${
          lower.seq
        }层顶板 ${fmtNum(lower.top)}m 之间断档 ${fmtNum(-d)}m，地层区间未接上`,
      });
    }
  }

  // 遗迹：悬空归层、重复坐标（导入兜底）
  for (const f of state.features.filter((x) => x.trench === trench)) {
    if (f.seq != null && !state.layers.some((l) => l.trench === trench && l.seq === f.seq)) {
      out.push({
        trench,
        seq: f.seq,
        kind: "遗迹悬空",
        severity: "error",
        message: `${trench} 遗迹 ${f.code} 所归第${f.seq}层不存在`,
      });
    }
  }
  const coordMap = new Map<string, Feature[]>();
  for (const f of state.features.filter((x) => x.trench === trench && x.coord)) {
    const key = normCoord(f.coord);
    const arr = coordMap.get(key) ?? [];
    arr.push(f);
    coordMap.set(key, arr);
  }
  coordMap.forEach((arr) => {
    if (arr.length > 1) {
      out.push({
        trench,
        seq: null,
        kind: "重复坐标",
        severity: "error",
        message: `${trench} 坐标 ${arr[0].coord} 被遗迹单位 ${arr
          .map((f) => f.code)
          .join("、")} 重复登记`,
      });
    }
  });

  // 已归层出土物悬空（改层兜底）
  for (const f of state.finds.filter((x) => x.trench === trench && x.seq != null)) {
    if (!state.layers.some((l) => l.trench === trench && l.seq === f.seq)) {
      out.push({
        trench,
        seq: f.seq,
        kind: "归层缺失",
        severity: "error",
        message: `${trench} 出土物「${f.material}」（${f.count}件）归入的第${f.seq}层不存在`,
      });
    }
  }

  const pendingCount = state.finds.filter((f) => f.trench === trench && f.seq == null).length;
  if (pendingCount > 0) {
    out.push({
      trench,
      seq: null,
      kind: "待归",
      severity: "warning",
      message: `${trench} 有 ${pendingCount} 批出土物尚在待归区，归入地层后才计入统计`,
    });
  }

  return out;
}

export function validateAll(state: LedgerState): Anomaly[] {
  return trenches(state).flatMap((t) => validateTrench(state, t));
}

// ---------- 台账导出（CSV，Excel 可直接打开） ----------

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function buildLedgerCSV(state: LedgerState): string {
  const lines: string[] = [];
  lines.push(csvRow(["# 续编发掘簿台账", `导出时间 ${new Date().toLocaleString()}`]));

  lines.push("");
  lines.push(csvRow(["## 探方汇总", "探方", "地层数", "遗迹单位数", "已归层出土件数", "待归批数"]));
  for (const t of trenches(state)) {
    const s = statsForTrench(state, t);
    lines.push(csvRow(["", t, s.layers, s.features, s.findCount, s.pending]));
  }

  lines.push("");
  lines.push(csvRow(["## 地层", "探方", "层序", "顶板标高m", "底板标高m", "层厚m", "本层出土件数", "备注"]));
  trenchLayersAll(state).forEach((l) => {
    lines.push(
      csvRow([
        "",
        l.trench,
        l.seq,
        fmtNum(l.top),
        fmtNum(l.bottom),
        fmtNum(l.top - l.bottom),
        findCountOfLayer(state, l.trench, l.seq),
        l.note ?? "",
      ])
    );
  });

  lines.push("");
  lines.push(csvRow(["## 遗迹单位", "探方", "单位号", "类型", "地层", "坐标"]));
  state.features.forEach((f) => {
    lines.push(csvRow(["", f.trench, f.code, f.kind, f.seq == null ? "未判明" : `第${f.seq}层`, f.coord]));
  });

  lines.push("");
  lines.push(csvRow(["## 出土物", "探方", "地层", "遗迹单位", "坐标", "件数", "类别/描述", "状态"]));
  state.finds.forEach((x) => {
    const feature = x.featureId ? state.features.find((f) => f.id === x.featureId) : undefined;
    lines.push(
      csvRow([
        "",
        x.trench,
        x.seq == null ? "待归" : `第${x.seq}层`,
        feature ? feature.code : "",
        x.coord,
        x.count,
        x.material,
        x.seq == null ? "待归区" : "已统计",
      ])
    );
  });

  const anomalies = validateAll(state);
  lines.push("");
  lines.push(csvRow(["## 异常", "探方", "层序", "类型", "级别", "说明"]));
  anomalies.forEach((a) => {
    lines.push(csvRow(["", a.trench, a.seq == null ? "-" : `第${a.seq}层`, a.kind, a.severity === "error" ? "错误" : "提示", a.message]));
  });

  return "﻿" + lines.join("\r\n");
}

function trenchLayersAll(state: LedgerState): Layer[] {
  return trenches(state).flatMap((t) => trenchLayers(state, t));
}

// ---------- 备份 / 恢复（JSON，重开继续整理） ----------

export function toJSON(state: LedgerState): string {
  return JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2);
}

export function fromJSON(text: string): Result<LedgerState> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("备份文件不是合法 JSON");
  }
  if (typeof raw !== "object" || raw === null) return fail("备份文件结构不正确");
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.layers) || !Array.isArray(obj.features) || !Array.isArray(obj.finds)) {
    return fail("备份缺少 layers / features / finds 数据段");
  }
  const state: LedgerState = {
    version: SCHEMA_VERSION,
    layers: obj.layers as Layer[],
    features: obj.features as Feature[],
    finds: obj.finds as Find[],
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
  };
  return ok(state);
}

// ---------- 本地持久化 ----------

export function loadState(): LedgerState {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return emptyState();
    const parsed = fromJSON(text);
    return parsed.ok ? parsed.data! : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(state: LedgerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式或配额超限时静默失败，界面上会给出提示
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------- 示例数据（故意保留几种典型异常，供演示核查） ----------

export function sampleState(): LedgerState {
  let s = emptyState();
  // T0203：1/2 层接上，2/3 层断档
  const layers: LayerInput[] = [
    { trench: "T0203", seq: 1, top: 100.42, bottom: 100.1, note: "耕土，灰褐色" },
    { trench: "T0203", seq: 2, top: 100.1, bottom: 99.78, note: "灰褐土，出陶片" },
    { trench: "T0203", seq: 3, top: 99.5, bottom: 99.2, note: "黄土，较致密" },
    // T0204：2/3 层重叠
    { trench: "T0204", seq: 1, top: 100.5, bottom: 100.2 },
    { trench: "T0204", seq: 2, top: 100.2, bottom: 99.9 },
    { trench: "T0204", seq: 3, top: 100.0, bottom: 99.65 },
    // T0301：缺第2层
    { trench: "T0301", seq: 1, top: 99.8, bottom: 99.55 },
    { trench: "T0301", seq: 3, top: 99.55, bottom: 99.3 },
  ];
  for (const l of layers) s = addLayer(s, l).data!;

  const features: FeatureInput[] = [
    { trench: "T0203", seq: 2, code: "H12", kind: "灰坑", coord: "E3.0N4.0" },
    { trench: "T0203", seq: 3, code: "H13", kind: "柱洞", coord: "E5.5N4.0" },
    { trench: "T0204", seq: 2, code: "F2", kind: "房址", coord: "E1.0N1.0" },
    { trench: "T0301", seq: 1, code: "G1", kind: "沟", coord: "E2.0N6.0" },
  ];
  for (const f of features) s = addFeature(s, f).data!;
  // 与 H13 同坐标的脏数据（模拟临时表补录/历史导入造成的重复坐标；界面录入会被拦截）
  s = {
    ...s,
    features: [
      ...s.features,
      { id: genId("F"), trench: "T0203", seq: 3, code: "H14", kind: "柱洞", coord: "E5.5 N4.0" },
    ],
  };

  const finds: FindInput[] = [
    { trench: "T0203", seq: 2, featureId: null, coord: "E3.1N4.2", count: 12, material: "夹砂陶片" },
    { trench: "T0203", seq: 2, featureId: s.features[0].id, coord: "E3.0N4.0", count: 3, material: "兽骨" },
    { trench: "T0204", seq: 1, featureId: null, coord: "E4.0N2.0", count: 6, material: "泥质陶片" },
    // 待归区：尚未判明层位
    { trench: "T0301", seq: null, featureId: null, coord: "E2.2N6.1", count: 2, material: "石斧（半成品）" },
    { trench: "T0203", seq: null, featureId: null, coord: "E6.0N0.5", count: 1, material: "铜簇" },
  ];
  for (const x of finds) s = addFind(s, x).data!;

  return { ...s, updatedAt: new Date().toISOString() };
}

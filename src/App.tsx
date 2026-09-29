import { useEffect, useMemo, useRef, useState } from "react";
import {
  addLayer,
  updateLayer,
  deleteLayer,
  addFeature,
  updateFeature,
  deleteFeature,
  addFind,
  assignFind,
  unassignFind,
  deleteFind,
  validateTrench,
  validateAll,
  statsForTrench,
  findCountOfLayer,
  trenches,
  loadState,
  saveState,
  toJSON,
  fromJSON,
  sampleState,
  buildLedgerCSV,
  fmtNum,
  normTrench,
  type LedgerState,
  type Layer,
  type Feature,
  type Find,
  type Result,
  type Anomaly,
} from "./domain";

type Tab = "layers" | "features" | "finds" | "anomalies" | "ledger";

const FEATURE_KINDS = ["灰坑", "墓葬", "房址", "沟", "柱洞", "窑址", "灶", "其他"];

function useToast() {
  const [toast, setToast] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  function show(kind: "error" | "ok", text: string) {
    setToast({ kind, text });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3200);
  }
  return { toast, show };
}

/** 应用 Result：成功更新状态并提示；失败弹出原因 */
function apply(
  r: Result<LedgerState>,
  setter: (s: LedgerState) => void,
  show: (k: "error" | "ok", t: string) => void,
  okText: string
): boolean {
  if (!r.ok) {
    show("error", r.error!);
    return false;
  }
  setter(r.data!);
  show("ok", okText);
  return true;
}

function TrenchField({
  value,
  onChange,
  placeholder = "如 T0203",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      list="trench-list"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      autoCapitalize="characters"
    />
  );
}

function LayerSeqSelect({
  state,
  trench,
  value,
  onChange,
  nullLabel,
  allowNull,
}: {
  state: LedgerState;
  trench: string;
  value: number | "";
  onChange: (v: number | "") => void;
  nullLabel: string;
  allowNull: boolean;
}) {
  const layers = state.layers
    .filter((l) => l.trench === normTrench(trench))
    .sort((a, b) => a.seq - b.seq);
  return (
    <select
      value={value === "" ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
    >
      {allowNull && <option value="">{nullLabel}</option>}
      {layers.map((l) => (
        <option key={l.id} value={l.seq}>
          第{l.seq}层（{fmtNum(l.top)}～{fmtNum(l.bottom)}m）
        </option>
      ))}
    </select>
  );
}

function FeatureSelect({
  state,
  trench,
  seq,
  value,
  onChange,
  allowNone,
}: {
  state: LedgerState;
  trench: string;
  seq: number | "";
  value: string;
  onChange: (v: string) => void;
  allowNone: boolean;
}) {
  const list = state.features.filter(
    (f) =>
      f.trench === normTrench(trench) &&
      (seq === "" || f.seq == null || f.seq === seq)
  );
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">不关联遗迹</option>}
      {list.map((f) => (
        <option key={f.id} value={f.id}>
          {f.code}（{f.kind}
          {f.seq == null ? "·层位未判明" : `·第${f.seq}层`}）
        </option>
      ))}
    </select>
  );
}

function App() {
  const [state, setState] = useState<LedgerState>(() => loadState());
  const [tab, setTab] = useState<Tab>("layers");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const { toast, show } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // 每次变更立即落本地，重开页面即可接着整理
  useEffect(() => {
    saveState(state);
    setSavedAt(new Date());
  }, [state]);

  const allTrenches = useMemo(() => trenches(state), [state]);
  const anomalies = useMemo(() => validateAll(state), [state]);
  const [anomalyTrench, setAnomalyTrench] = useState<string>("");
  useEffect(() => {
    if (anomalyTrench && !allTrenches.includes(anomalyTrench)) setAnomalyTrench("");
  }, [allTrenches, anomalyTrench]);

  const totals = useMemo(() => {
    let layers = 0;
    let features = 0;
    let findCount = 0;
    let pending = 0;
    for (const t of allTrenches) {
      const s = statsForTrench(state, t);
      layers += s.layers;
      features += s.features;
      findCount += s.findCount;
      pending += s.pending;
    }
    return { layers, features, findCount, pending };
  }, [state, allTrenches]);

  function exportCSV() {
    const blob = new Blob([buildLedgerCSV(state)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `续编发掘簿台账_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    show("ok", "台账 CSV 已导出");
  }

  function exportJSON() {
    const blob = new Blob([toJSON(state)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `发掘簿备份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    show("ok", "备份文件已下载");
  }

  function importJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const r = fromJSON(String(reader.result));
      if (!r.ok) {
        show("error", r.error!);
        return;
      }
      setState(r.data!);
      show("ok", "备份已恢复，可以接着整理");
    };
    reader.readAsText(file);
  }

  function loadSample() {
    if (state.layers.length || state.features.length || state.finds.length) {
      if (!window.confirm("载入演示数据会覆盖当前发掘簿，确定继续？")) return;
    }
    setState(sampleState());
    show("ok", "已载入演示数据（含几种典型异常）");
  }

  return (
    <main className="app-shell">
      <datalist id="trench-list">
        {allTrenches.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <header className="hero">
        <div>
          <p className="eyebrow">续编发掘簿 · 田野临时记录补录</p>
          <h1>探方地层续编与出土物归层台账</h1>
          <p className="subtitle">
            录入探方、地层序号、顶底标高、遗迹单位、坐标与出土物件数；同层不许重号，
            上下层标高自动核接，断档/重叠按探方点名。未判明层位的出土物先入待归区，归入地层后才计入统计。
          </p>
          <p className="save-hint">
            {state.layers.length + state.features.length + state.finds.length === 0
              ? "当前为空白簿"
              : savedAt
              ? `已自动保存于本地 ${savedAt.toLocaleTimeString()}，关闭重开可继续`
              : ""}
          </p>
        </div>
        <div className="hero-actions">
          <button onClick={exportCSV} className="primary-action">导出台账 CSV</button>
          <button onClick={exportJSON}>下载备份</button>
          <button onClick={() => fileRef.current?.click()}>恢复备份</button>
          <button onClick={loadSample}>载入演示数据</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJSON(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>探方</span>
          <strong>{allTrenches.length}</strong>
        </article>
        <article className="metric-card">
          <span>地层</span>
          <strong>{totals.layers}</strong>
        </article>
        <article className="metric-card">
          <span>遗迹单位</span>
          <strong>{totals.features}</strong>
        </article>
        <article className="metric-card">
          <span>已统计出土物（件）</span>
          <strong>{totals.findCount}</strong>
          <em className="badge ok">仅计已归层</em>
        </article>
        <article className={`metric-card ${totals.pending ? "alert" : ""}`}>
          <span>待归区（批）</span>
          <strong>{totals.pending}</strong>
          {totals.pending > 0 && <em className="badge danger">待归层，暂不计入</em>}
        </article>
        <article
          className={`metric-card ${
            anomalies.some((a) => a.severity === "error") ? "alert" : ""
          }`}
        >
          <span>异常</span>
          <strong>
            {anomalies.filter((a) => a.severity === "error").length}
            <small> 错 / {anomalies.filter((a) => a.severity === "warning").length} 提示</small>
          </strong>
        </article>
      </section>

      <nav className="tabs">
        {(
          [
            ["layers", "地层"],
            ["features", "遗迹单位"],
            ["finds", `出土物${totals.pending ? `（待归 ${totals.pending}）` : ""}`],
            ["anomalies", `异常核查${anomalies.length ? `（${anomalies.length}）` : ""}`],
            ["ledger", "按探方查账"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "layers" && <LayersTab state={state} setState={setState} show={show} />}
      {tab === "features" && <FeaturesTab state={state} setState={setState} show={show} />}
      {tab === "finds" && <FindsTab state={state} setState={setState} show={show} />}
      {tab === "anomalies" && (
        <AnomaliesTab
          state={state}
          allTrenches={allTrenches}
          trench={anomalyTrench}
          setTrench={setAnomalyTrench}
        />
      )}
      {tab === "ledger" && <LedgerTab state={state} allTrenches={allTrenches} />}

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </main>
  );
}

// ---------------- 地层 ----------------

function LayersTab({
  state,
  setState,
  show,
}: {
  state: LedgerState;
  setState: (s: LedgerState) => void;
  show: (k: "error" | "ok", t: string) => void;
}) {
  const all = trenches(state);
  const blank = { trench: "", seq: "", top: "", bottom: "", note: "" };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  function submit() {
    const trench = form.trench.trim();
    const seq = Number(form.seq);
    const top = Number(form.top);
    const bottom = Number(form.bottom);
    if (editingId) {
      if (
        apply(
          updateLayer(state, editingId, { trench, seq, top, bottom, note: form.note }),
          setState,
          show,
          "地层已更新"
        )
      ) {
        setEditingId(null);
        setForm(blank);
      }
    } else {
      if (
        apply(
          addLayer(state, { trench, seq, top, bottom, note: form.note }),
          setState,
          show,
          `已续编 ${normTrench(trench)} 第${seq}层`
        )
      ) {
        setForm({ ...blank, trench });
      }
    }
  }

  function startEdit(l: Layer) {
    setEditingId(l.id);
    setForm({
      trench: l.trench,
      seq: String(l.seq),
      top: String(l.top),
      bottom: String(l.bottom),
      note: l.note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const list = all.filter((t) => !filter || t === filter);

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{editingId ? "编辑地层" : "续编地层"}</h2>
        {editingId && (
          <button
            onClick={() => {
              setEditingId(null);
              setForm(blank);
            }}
          >
            取消编辑
          </button>
        )}
      </div>
      <div className="field-grid">
        <label>
          <span>探方号 *</span>
          <TrenchField
            value={form.trench}
            onChange={(v) => setForm({ ...form, trench: v })}
          />
        </label>
        <label>
          <span>地层序号 *（由浅入深，从 1 起）</span>
          <input
            type="number"
            min={1}
            step={1}
            value={form.seq}
            onChange={(e) => setForm({ ...form, seq: e.target.value })}
            placeholder="如 2"
          />
        </label>
        <label>
          <span>顶板标高 m *</span>
          <input
            type="number"
            step="0.01"
            value={form.top}
            onChange={(e) => setForm({ ...form, top: e.target.value })}
            placeholder="如 100.10"
          />
        </label>
        <label>
          <span>底板标高 m *</span>
          <input
            type="number"
            step="0.01"
            value={form.bottom}
            onChange={(e) => setForm({ ...form, bottom: e.target.value })}
            placeholder="如 99.78"
          />
        </label>
        <label className="wide">
          <span>土质土色 / 备注</span>
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="如 灰褐土，夹炭屑"
          />
        </label>
      </div>
      <div className="form-actions">
        <button className="primary-action" onClick={submit}>
          {editingId ? "保存修改" : "录入地层"}
        </button>
        <span className="hint">
          同探方同序号会被拒绝；底板必须低于顶板；与上一层断档或重叠请看「异常核查」。
        </span>
      </div>

      <div className="list-toolbar">
        <h3>已录地层（按探方）</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">全部探方</option>
          {all.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {list.map((t) => {
        const layers = state.layers
          .filter((l) => l.trench === t)
          .sort((a, b) => a.seq - b.seq);
        const anoms = validateTrench(state, t);
        const errN = anoms.filter((a) => a.severity === "error").length;
        const warnN = anoms.filter((a) => a.severity === "warning").length;
        return (
          <div key={t} className="trench-block">
            <h4 className="trench-title">
              {t}
              <span className="trench-meta">{layers.length} 层</span>
              {errN > 0 && <span className="tag danger">{errN} 处错误</span>}
              {warnN > 0 && <span className="tag warning">{warnN} 处提示</span>}
            </h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>层序</th>
                    <th>顶板 m</th>
                    <th>底板 m</th>
                    <th>层厚 m</th>
                    <th>与上层衔接</th>
                    <th>本层出土（件）</th>
                    <th>备注</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {layers.map((l, i) => {
                    const join = joinStatus(layers, i);
                    return (
                      <tr key={l.id} className={editingId === l.id ? "editing" : ""}>
                        <td>第{l.seq}层</td>
                        <td>{fmtNum(l.top)}</td>
                        <td>{fmtNum(l.bottom)}</td>
                        <td>{fmtNum(l.top - l.bottom)}</td>
                        <td>
                          {join === null ? (
                            <span className="tag">表层</span>
                          ) : join === "ok" ? (
                            <span className="tag ok">接上</span>
                          ) : join === "gap" ? (
                            <span className="tag warning">断档</span>
                          ) : join === "overlap" ? (
                            <span className="tag danger">重叠</span>
                          ) : (
                            <span className="tag danger">隔层/缺号</span>
                          )}
                        </td>
                        <td>{findCountOfLayer(state, t, l.seq)}</td>
                        <td className="note-cell">{l.note ?? "—"}</td>
                        <td className="row-actions">
                          <button onClick={() => startEdit(l)}>改</button>
                          <button
                            onClick={() =>
                              apply(
                                deleteLayer(state, l.id),
                                setState,
                                show,
                                "地层已删除，该层出土物已退回待归区"
                              )
                            }
                          >
                            删
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {list.length === 0 && <p className="empty">还没有地层记录。先在上方录入第一条。</p>}
    </section>
  );
}

function joinStatus(layers: Layer[], i: number): null | "ok" | "gap" | "overlap" | "skip" {
  if (i === 0) return null;
  const upper = layers[i - 1];
  const lower = layers[i];
  if (lower.seq !== upper.seq + 1) return "skip";
  const d = lower.top - upper.bottom;
  const TOL = 0.005;
  if (Math.abs(d) <= TOL) return "ok";
  return d > 0 ? "overlap" : "gap";
}

// ---------------- 遗迹单位 ----------------

function FeaturesTab({
  state,
  setState,
  show,
}: {
  state: LedgerState;
  setState: (s: LedgerState) => void;
  show: (k: "error" | "ok", t: string) => void;
}) {
  const all = trenches(state);
  const blank = {
    trench: "",
    seq: "" as number | "",
    code: "",
    kind: FEATURE_KINDS[0],
    coord: "",
  };
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);

  function submit() {
    const payload = {
      trench: form.trench.trim(),
      seq: form.seq === "" ? null : form.seq,
      code: form.code.trim(),
      kind: form.kind,
      coord: form.coord.trim(),
    };
    if (editingId) {
      if (apply(updateFeature(state, editingId, payload), setState, show, "遗迹单位已更新")) {
        setEditingId(null);
        setForm(blank);
      }
    } else {
      if (
        apply(addFeature(state, payload), setState, show, `已登记遗迹 ${payload.code.toUpperCase()}`)
      ) {
        setForm({ ...blank, trench: payload.trench, kind: payload.kind });
      }
    }
  }

  function startEdit(f: Feature) {
    setEditingId(f.id);
    setForm({
      trench: f.trench,
      seq: f.seq ?? "",
      code: f.code,
      kind: f.kind || FEATURE_KINDS[0],
      coord: f.coord,
    });
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{editingId ? "编辑遗迹单位" : "登记遗迹单位"}</h2>
        {editingId && (
          <button
            onClick={() => {
              setEditingId(null);
              setForm(blank);
            }}
          >
            取消编辑
          </button>
        )}
      </div>
      <div className="field-grid">
        <label>
          <span>所在探方 *</span>
          <TrenchField
            value={form.trench}
            onChange={(v) => setForm({ ...form, trench: v, seq: "" })}
          />
        </label>
        <label>
          <span>所在地层</span>
          <LayerSeqSelect
            state={state}
            trench={form.trench}
            value={form.seq}
            onChange={(v) => setForm({ ...form, seq: v })}
            nullLabel="层位未判明（暂不挂层）"
            allowNull
          />
        </label>
        <label>
          <span>单位号 *（如 H12、F2）</span>
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="H12"
          />
        </label>
        <label>
          <span>遗迹类型</span>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {FEATURE_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          <span>坐标 *（如 E3.0N4.0）</span>
          <input
            value={form.coord}
            onChange={(e) => setForm({ ...form, coord: e.target.value })}
            placeholder="E3.0N4.0"
          />
        </label>
      </div>
      <div className="form-actions">
        <button className="primary-action" onClick={submit}>
          {editingId ? "保存修改" : "登记遗迹"}
        </button>
        <span className="hint">
          同探方单位号不许重复；同一坐标不许登记两个单位；挂层须先有该地层。
        </span>
      </div>

      <div className="list-toolbar">
        <h3>遗迹单位清单</h3>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>探方</th>
              <th>单位号</th>
              <th>类型</th>
              <th>地层</th>
              <th>坐标</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {state.features.map((f) => (
              <tr key={f.id} className={editingId === f.id ? "editing" : ""}>
                <td>{f.trench}</td>
                <td>{f.code}</td>
                <td>{f.kind}</td>
                <td>
                  {f.seq == null ? (
                    <span className="tag warning">层位未判明</span>
                  ) : (
                    `第${f.seq}层`
                  )}
                </td>
                <td>{f.coord}</td>
                <td className="row-actions">
                  <button onClick={() => startEdit(f)}>改</button>
                  <button
                    onClick={() =>
                      apply(deleteFeature(state, f.id), setState, show, "遗迹单位已删除")
                    }
                  >
                    删
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.features.length === 0 && <p className="empty">还没有遗迹单位。</p>}
    </section>
  );
}

// ---------------- 出土物 / 待归区 ----------------

function FindsTab({
  state,
  setState,
  show,
}: {
  state: LedgerState;
  setState: (s: LedgerState) => void;
  show: (k: "error" | "ok", t: string) => void;
}) {
  const all = trenches(state);
  const blank = {
    trench: "",
    seq: "" as number | "",
    featureId: "",
    coord: "",
    count: "1",
    material: "",
  };
  const [form, setForm] = useState(blank);
  const pending = state.finds.filter((f) => f.seq == null);
  const assigned = state.finds.filter((f) => f.seq != null);

  function submit() {
    const payload = {
      trench: form.trench.trim(),
      seq: form.seq === "" ? null : form.seq,
      featureId: form.featureId || null,
      coord: form.coord.trim(),
      count: Number(form.count),
      material: form.material.trim(),
    };
    const ok = apply(
      addFind(state, payload),
      setState,
      show,
      payload.seq == null ? "已存入待归区，归入地层后才计入统计" : "出土物已登记并计入该层统计"
    );
    if (ok) setForm({ ...blank, trench: payload.trench });
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>出土物登记</h2>
      </div>
      <div className="field-grid">
        <label>
          <span>探方号 *</span>
          <TrenchField
            value={form.trench}
            onChange={(v) =>
              setForm({ ...form, trench: v, seq: "", featureId: "" })
            }
          />
        </label>
        <label>
          <span>坐标 *</span>
          <input
            value={form.coord}
            onChange={(e) => setForm({ ...form, coord: e.target.value })}
            placeholder="E3.1N4.2"
          />
        </label>
        <label>
          <span>件数 *（正整数）</span>
          <input
            type="number"
            min={1}
            step={1}
            value={form.count}
            onChange={(e) => setForm({ ...form, count: e.target.value })}
          />
        </label>
        <label>
          <span>类别 / 描述 *</span>
          <input
            value={form.material}
            onChange={(e) => setForm({ ...form, material: e.target.value })}
            placeholder="如 夹砂陶片"
          />
        </label>
        <label>
          <span>归入地层</span>
          <LayerSeqSelect
            state={state}
            trench={form.trench}
            value={form.seq}
            onChange={(v) => setForm({ ...form, seq: v, featureId: "" })}
            nullLabel="暂不判明 → 入待归区"
            allowNull
          />
        </label>
        <label>
          <span>关联遗迹单位</span>
          <FeatureSelect
            state={state}
            trench={form.trench}
            seq={form.seq}
            value={form.featureId}
            onChange={(v) => setForm({ ...form, featureId: v })}
            allowNone
          />
        </label>
      </div>
      <div className="form-actions">
        <button className="primary-action" onClick={submit}>
          登记出土物
        </button>
        <span className="hint">
          层位不确定就留空，记录先进待归区；挂遗迹时层位须与遗迹一致。
        </span>
      </div>

      <div className="pending-zone">
        <div className="list-toolbar">
          <h3>
            待归区 <span className="tag warning">{pending.length} 批</span>
          </h3>
        </div>
        {pending.length === 0 ? (
          <p className="empty">待归区为空，所有出土物都已归层。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>探方</th>
                  <th>坐标</th>
                  <th>件数</th>
                  <th>类别/描述</th>
                  <th>归入地层</th>
                  <th>关联遗迹</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((f) => (
                  <PendingRow
                    key={f.id}
                    state={state}
                    find={f}
                    setState={setState}
                    show={show}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="list-toolbar">
        <h3>已归层出土物（计入统计）</h3>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>探方</th>
              <th>地层</th>
              <th>遗迹</th>
              <th>坐标</th>
              <th>件数</th>
              <th>类别/描述</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {assigned.map((f) => {
              const feature = f.featureId
                ? state.features.find((x) => x.id === f.featureId)
                : undefined;
              return (
                <tr key={f.id}>
                  <td>{f.trench}</td>
                  <td>第{f.seq}层</td>
                  <td>{feature ? feature.code : "—"}</td>
                  <td>{f.coord}</td>
                  <td>{f.count}</td>
                  <td>{f.material}</td>
                  <td className="row-actions">
                    <button
                      onClick={() =>
                        apply(unassignFind(state, f.id), setState, show, "已退回待归区，统计已扣减")
                      }
                    >
                      退回待归
                    </button>
                    <button
                      onClick={() =>
                        apply(deleteFind(state, f.id), setState, show, "出土物记录已删除")
                      }
                    >
                      删
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {assigned.length === 0 && <p className="empty">尚无已归层的出土物。</p>}
    </section>
  );
}

function PendingRow({
  state,
  find,
  setState,
  show,
}: {
  state: LedgerState;
  find: Find;
  setState: (s: LedgerState) => void;
  show: (k: "error" | "ok", t: string) => void;
}) {
  const [seq, setSeq] = useState<number | "">("");
  const [featureId, setFeatureId] = useState("");
  return (
    <tr>
      <td>{find.trench}</td>
      <td>{find.coord}</td>
      <td>{find.count}</td>
      <td>{find.material}</td>
      <td>
        <LayerSeqSelect
          state={state}
          trench={find.trench}
          value={seq}
          onChange={setSeq}
          nullLabel="选择地层…"
          allowNull={false}
        />
      </td>
      <td>
        <FeatureSelect
          state={state}
          trench={find.trench}
          seq={seq}
          value={featureId}
          onChange={setFeatureId}
          allowNone
        />
      </td>
      <td className="row-actions">
        <button
          className="primary-action"
          disabled={seq === ""}
          onClick={() =>
            apply(
              assignFind(state, find.id, seq as number, featureId || null),
              setState,
              show,
              `已归入 ${find.trench} 第${seq}层，计入统计`
            )
          }
        >
          归入
        </button>
        <button
          onClick={() =>
            apply(deleteFind(state, find.id), setState, show, "出土物记录已删除")
          }
        >
          删
        </button>
      </td>
    </tr>
  );
}

// ---------------- 异常核查 ----------------

function AnomaliesTab({
  state,
  allTrenches,
  trench,
  setTrench,
}: {
  state: LedgerState;
  allTrenches: string[];
  trench: string;
  setTrench: (t: string) => void;
}) {
  const list: Anomaly[] = trench ? validateTrench(state, trench) : validateAll(state);
  const errors = list.filter((a) => a.severity === "error");
  const warnings = list.filter((a) => a.severity === "warning");

  return (
    <section className="panel">
      <div className="list-toolbar">
        <h2>异常核查</h2>
        <select value={trench} onChange={(e) => setTrench(e.target.value)}>
          <option value="">全部探方</option>
          {allTrenches.map((t) => (
            <option key={t} value={t}>
              仅看 {t}
            </option>
          ))}
        </select>
      </div>
      <p className="hint">
        核查项：同层重号、地层缺号（断档）、层序倒挂、上下层标高断档/重叠、遗迹重复坐标、
        遗迹与出土物悬空归层、待归区未处理。
      </p>

      {list.length === 0 && (
        <p className="empty good">
          ✓ 未发现异常。{allTrenches.length === 0 && "（空白簿）"}
        </p>
      )}

      {errors.length > 0 && (
        <>
          <h4 className="anomaly-group danger-text">错误（{errors.length}）— 须改正后才能定稿</h4>
          <ul className="anomaly-list">
            {errors.map((a, i) => (
              <li key={i} className="anomaly danger">
                <span className="anomaly-head">
                  <b>{a.trench}</b>
                  {a.seq != null && <span className="tag">第{a.seq}层</span>}
                  <span className="tag danger">{a.kind}</span>
                </span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {warnings.length > 0 && (
        <>
          <h4 className="anomaly-group warning-text">提示（{warnings.length}）— 请核实</h4>
          <ul className="anomaly-list">
            {warnings.map((a, i) => (
              <li key={i} className="anomaly warning">
                <span className="anomaly-head">
                  <b>{a.trench}</b>
                  {a.seq != null && <span className="tag">第{a.seq}层</span>}
                  <span className="tag warning">{a.kind}</span>
                </span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ---------------- 按探方查账 ----------------

function LedgerTab({ state, allTrenches }: { state: LedgerState; allTrenches: string[] }) {
  return (
    <section className="panel">
      <div className="list-toolbar">
        <h2>按探方查账</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>探方</th>
              <th>地层数</th>
              <th>遗迹单位</th>
              <th>已归层出土物（件）</th>
              <th>待归区（批）</th>
              <th>错误</th>
              <th>提示</th>
              <th>地层序列（顶→底）</th>
            </tr>
          </thead>
          <tbody>
            {allTrenches.map((t) => {
              const s = statsForTrench(state, t);
              const anoms = validateTrench(state, t);
              const seq = state.layers
                .filter((l) => l.trench === t)
                .sort((a, b) => a.seq - b.seq)
                .map((l) => `${l.seq}:${fmtNum(l.top)}~${fmtNum(l.bottom)}`)
                .join(" ｜ ");
              return (
                <tr
                  key={t}
                  className={anoms.some((a) => a.severity === "error") ? "row-danger" : ""}
                >
                  <td>
                    <b>{t}</b>
                  </td>
                  <td>{s.layers}</td>
                  <td>{s.features}</td>
                  <td>{s.findCount}</td>
                  <td className={s.pending ? "num-warn" : ""}>{s.pending}</td>
                  <td>{anoms.filter((a) => a.severity === "error").length}</td>
                  <td>{anoms.filter((a) => a.severity === "warning").length}</td>
                  <td className="note-cell">{seq || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {allTrenches.length === 0 && <p className="empty">空白簿，先录入地层。</p>}
      <p className="hint">
        顶栏「导出台账 CSV」会一并写入探方汇总、地层、遗迹、出土物（标明待归/已统计）和全部异常说明。
      </p>
    </section>
  );
}

export default App;

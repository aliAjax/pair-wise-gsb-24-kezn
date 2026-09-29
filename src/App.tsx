import { useMemo, useState } from "react";
import "./styles.css";
import { useLedger } from "./useLedger";
import { audit, isFindPending, squaresList } from "./domain";
import { ToastBar, fmtTime, useToast } from "./ui/common";
import { StrataTab } from "./ui/StrataTab";
import { FeaturesTab } from "./ui/FeaturesTab";
import { FindsTab } from "./ui/FindsTab";
import { AuditTab } from "./ui/AuditTab";
import { ExportTab } from "./ui/ExportTab";

type TabId = "strata" | "features" | "finds" | "audit" | "export";

const TABS: { id: TabId; label: string }[] = [
  { id: "strata", label: "地层" },
  { id: "features", label: "遗迹单位" },
  { id: "finds", label: "出土物 / 待归区" },
  { id: "audit", label: "异常核查" },
  { id: "export", label: "台账 / 存档" },
];

function App() {
  const api = useLedger();
  const { state, savedAt, dirty } = api;
  const { toast, show } = useToast();
  const [tab, setTab] = useState<TabId>("strata");
  const [auditSquare, setAuditSquare] = useState("");

  const metrics = useMemo(() => {
    const anomalies = audit(state);
    return {
      squares: squaresList(state).length,
      strata: state.strata.length,
      features: state.features.length,
      pending: state.finds.filter((f) => isFindPending(state, f)).length,
      errors: anomalies.filter((a) => a.level === "error").length,
    };
  }, [state]);

  const notify = (ok: boolean, text: string) => show(ok ? "ok" : "err", text);

  const goAudit = (sq?: string) => {
    setAuditSquare(sq ?? "");
    setTab("audit");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">续编发掘簿</p>
          <h1>考古探方续编记录</h1>
          <p className="subtitle">探方地层 · 遗迹单位 · 出土物坐标档案 —— 换页不丢，重开续整</p>
        </div>
        <div className={`save-status ${dirty ? "is-dirty" : ""}`}>
          <span className="save-dot" />
          {dirty ? "改动自动保存中…" : `已保存 · ${fmtTime(savedAt)}`}
        </div>
      </header>

      <section className="metrics-grid">
        <MetricCard label="探方" value={metrics.squares} />
        <MetricCard label="地层记录" value={metrics.strata} />
        <MetricCard label="遗迹单位" value={metrics.features} />
        <MetricCard label="待归区出土物" value={metrics.pending} warn={metrics.pending > 0} />
        <button className="metric-card metric-button" onClick={() => goAudit()}>
          <span>地层/层序异常</span>
          <strong className={metrics.errors > 0 ? "num-err" : ""}>{metrics.errors}</strong>
          <i className="metric-go">去核查 →</i>
        </button>
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "finds" && metrics.pending > 0 && (
              <span className="tab-badge">{metrics.pending}</span>
            )}
            {t.id === "audit" && metrics.errors > 0 && (
              <span className="tab-badge badge-err">{metrics.errors}</span>
            )}
          </button>
        ))}
      </nav>

      {tab === "strata" && (
        <StrataTab
          api={api}
          state={state}
          notify={notify}
          jumpToAudit={(sq) => goAudit(sq)}
        />
      )}
      {tab === "features" && <FeaturesTab api={api} state={state} notify={notify} />}
      {tab === "finds" && <FindsTab api={api} state={state} notify={notify} />}
      {tab === "audit" && <AuditTab key={auditSquare} state={state} initialSquare={auditSquare} />}
      {tab === "export" && <ExportTab api={api} state={state} notify={notify} />}

      <ToastBar toast={toast} />
      <datalist id="square-list">
        {squaresList(state).map((sq) => (
          <option key={sq} value={sq} />
        ))}
      </datalist>
      <footer className="foot">
        数据保存在本机浏览器（localStorage），录入自动落盘；可导出 CSV 台账与 JSON 存档留档、换机续整。
      </footer>
    </main>
  );
}

function MetricCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong className={warn ? "num-warn" : ""}>{value}</strong>
    </article>
  );
}

export default App;

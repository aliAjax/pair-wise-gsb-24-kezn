import { useMemo, useState } from "react";
import type { Anomaly, LedgerState } from "../types";
import { auditSquare, squareStats } from "../domain";
import { knownSquares } from "./common";

interface Props {
  state: LedgerState;
  initialSquare: string;
}

const LEVEL_LABEL = { error: "错误", warn: "提醒", info: "提示" } as const;

export function AuditTab({ state, initialSquare }: Props) {
  const squares = useMemo(() => knownSquares(state), [state]);
  const [square, setSquare] = useState(initialSquare);

  const effective = square || squares[0] || "";
  const anomalies: Anomaly[] = effective ? auditSquare(state, effective) : [];
  const stats = effective ? squareStats(state, effective) : null;

  const counts = {
    error: anomalies.filter((a) => a.level === "error").length,
    warn: anomalies.filter((a) => a.level === "warn").length,
    info: anomalies.filter((a) => a.level === "info").length,
  };

  return (
    <div className="audit-layout">
      <section className="panel">
        <div className="panel-head wrap">
          <h3>按探方核查</h3>
          <label className="inline-field">
            <span>探方</span>
            <select value={effective} onChange={(e) => setSquare(e.target.value)}>
              {squares.length === 0 && <option value="">（暂无数据）</option>}
              {squares.map((sq) => (
                <option key={sq} value={sq}>{sq}</option>
              ))}
            </select>
          </label>
        </div>

        {squares.length === 0 ? (
          <p className="empty">还没有任何记录，先去录入地层。</p>
        ) : (
          <>
            <div className="anomaly-summary">
              <span className="sev-pill sev-error">错误 {counts.error}</span>
              <span className="sev-pill sev-warn">提醒 {counts.warn}</span>
              <span className="sev-pill sev-info">待办 {counts.info}</span>
              {anomalies.length === 0 && <span className="clean-note">✓ 该探方地层衔接、序号、坐标均未发现异常</span>}
            </div>
            {anomalies.length > 0 && (
              <ul className="anomaly-list">
                {anomalies.map((a, i) => (
                  <li key={i} className={`anomaly anomaly-${a.level}`}>
                    <span className="anomaly-level">{LEVEL_LABEL[a.level]}</span>
                    <div>
                      <strong>{a.square}</strong>
                      {a.seqs && a.seqs.length > 0 && (
                        <em className="anomaly-seqs">
                          {a.seqs.length === 2 ? ` 第${a.seqs[0]}↔${a.seqs[1]}层` : ` 第${a.seqs[0]}层`}
                        </em>
                      )}
                      <p>{a.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {stats && (
        <section className="panel">
          <h3>{effective} 分层统计台账</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>地层</th>
                  <th>顶底标高(m)</th>
                  <th>遗迹单位</th>
                  <th>出土物件数</th>
                </tr>
              </thead>
              <tbody>
                {stats.strata.map((r) => (
                  <tr key={r.stratum.id}>
                    <td className="seq-cell">第{r.stratum.seq}层</td>
                    <td className="mono">
                      {r.stratum.top} ~ {r.stratum.bottom}
                    </td>
                    <td>
                      {r.features.length === 0 ? (
                        "—"
                      ) : (
                        r.features.map((f) => (
                          <span key={f.id} className="feature-chip">
                            {f.code}
                            <em>{f.kind}</em>
                          </span>
                        ))
                      )}
                    </td>
                    <td className="count-cell">{r.findCount}</td>
                  </tr>
                ))}
                {stats.strata.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">该探方还没有地层。</td>
                  </tr>
                )}
                <tr className="pending-row">
                  <td>待归区</td>
                  <td>—</td>
                  <td>
                    {stats.unplacedFeatures.length === 0
                      ? "—"
                      : stats.unplacedFeatures.map((f) => (
                          <span key={f.id} className="feature-chip chip-warn">
                            {f.code}
                            <em>{f.kind}·待归层</em>
                          </span>
                        ))}
                  </td>
                  <td className="count-cell count-pending">
                    {stats.pendingFinds.reduce((n, f) => n + f.count, 0)}
                    <em>（不计入正式统计）</em>
                  </td>
                </tr>
                <tr className="total-row">
                  <td colSpan={3}>已归层合计</td>
                  <td className="count-cell">{stats.totalFindCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

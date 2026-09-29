import { useMemo, useState } from "react";
import type { Feature, LedgerState } from "../types";
import type { LedgerApi } from "../useLedger";
import { Field, SquareInput, knownSquares, stratumSeqOptions } from "./common";

interface Props {
  api: LedgerApi;
  state: LedgerState;
  notify: (ok: boolean, text: string) => void;
}

const FEATURE_KINDS = ["灰坑", "墓葬", "房址", "沟状遗迹", "柱洞", "窑址", "灶址", "其他"];

export function FeaturesTab({ api, state, notify }: Props) {
  const squares = useMemo(() => knownSquares(state), [state]);
  const [square, setSquare] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("灰坑");
  const [seq, setSeq] = useState<number | "">("");
  const [coord, setCoord] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<string>("");

  const seqs = stratumSeqOptions(state, square);
  const list = state.features
    .filter((f) => !filter || f.square === filter)
    .sort((a, b) => a.square.localeCompare(b.square) || a.code.localeCompare(b.code));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = api.addFeature({
      square: square.trim(),
      code: code.trim(),
      kind,
      stratumSeq: seq,
      coord,
      note,
    });
    if (r.ok) {
      notify(true, `遗迹 ${code.trim()} 已登记${seq === "" ? "，暂放待归层" : `，归入第 ${seq} 层`}`);
      setCode("");
      setCoord("");
      setNote("");
      setSeq("");
      if (!filter) setFilter(square.trim());
    } else {
      notify(false, r.error);
    }
  };

  return (
    <div className="tab-grid">
      <form className="panel entry-form" onSubmit={submit}>
        <h3>登记遗迹单位</h3>
        <p className="form-tip">
          层位未定的遗迹可以先不填地层，留在待归层；归层后其下出土物自动随层统计。
        </p>
        <div className="form-row">
          <Field label="探方">
            <SquareInput value={square} onChange={setSquare} options={squares} />
          </Field>
          <Field label="遗迹编号">
            <input required value={code} placeholder="如 H12" onChange={(e) => setCode(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="类型">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {FEATURE_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="归入地层" hint="可留空">
            <select value={seq} onChange={(e) => setSeq(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">待归层</option>
              {seqs.map((n) => (
                <option key={n} value={n}>
                  第 {n} 层
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="坐标点">
            <input required value={coord} placeholder="如 E3N4" onChange={(e) => setCoord(e.target.value)} />
          </Field>
        </div>
        <Field label="备注">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 打破第2层，关系待复核" />
        </Field>
        <button type="submit" className="primary-action">登记遗迹</button>
      </form>

      <section className="panel">
        <div className="panel-head">
          <h3>遗迹单位名录</h3>
          <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">全部探方</option>
            {squares.map((sq) => (
              <option key={sq} value={sq}>{sq}</option>
            ))}
          </select>
        </div>
        {list.length === 0 ? (
          <p className="empty">暂无遗迹记录。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>探方</th>
                  <th>编号</th>
                  <th>类型</th>
                  <th>坐标</th>
                  <th>层位</th>
                  <th>备注</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((f) => (
                  <FeatureRow key={f.id} feature={f} state={state} api={api} notify={notify} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function FeatureRow({
 feature,
  state,
  api,
  notify,
}: {
  feature: Feature;
  state: LedgerState;
  api: LedgerApi;
  notify: (ok: boolean, text: string) => void;
}) {
  const seqs = stratumSeqOptions(state, feature.square);
  const attachedFinds = state.finds.filter((f) => f.featureId === feature.id).length;
  const change = (v: string) => {
    const r = api.placeFeature(feature.id, v === "" ? null : Number(v));
    notify(
      r.ok,
      r.ok
        ? `遗迹 ${feature.code} 已${v === "" ? "退回待归层" : `归入第 ${v} 层`}`
        : r.error
    );
  };
  const remove = () => {
    if (attachedFinds > 0 && !window.confirm(`遗迹 ${feature.code} 下还有 ${attachedFinds} 条出土物记录，解除关联后将退回待归区。确认删除？`))
      return;
    const r = api.deleteFeature(feature.id);
    notify(r.ok, r.ok ? `遗迹 ${feature.code} 已删除，关联出土物已退回待归区` : r.error);
  };
  return (
    <tr>
      <td>{feature.square}</td>
      <td className="mono">{feature.code}</td>
      <td>{feature.kind}</td>
      <td className="mono">{feature.coord}</td>
      <td>
        <select
          className={feature.stratumSeq === null ? "seq-select warn-select" : "seq-select"}
          value={feature.stratumSeq ?? ""}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">待归层</option>
          {seqs.map((n) => (
            <option key={n} value={n}>第 {n} 层</option>
          ))}
        </select>
      </td>
      <td className="note-cell">
        {feature.note ?? "—"}
        {attachedFinds > 0 && <em className="attached"> · 出土物 {attachedFinds} 条</em>}
      </td>
      <td className="row-actions">
        <button className="mini danger" onClick={remove}>删</button>
      </td>
    </tr>
  );
}

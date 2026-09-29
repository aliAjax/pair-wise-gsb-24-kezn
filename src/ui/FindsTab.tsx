import { useMemo, useState } from "react";
import type { Feature, Find, LedgerState } from "../types";
import { effectiveStratumSeq, isFindPending } from "../domain";
import type { LedgerApi } from "../useLedger";
import { Field, SquareInput, knownSquares, stratumSeqOptions } from "./common";

interface Props {
  api: LedgerApi;
  state: LedgerState;
  notify: (ok: boolean, text: string) => void;
}

export function FindsTab({ api, state, notify }: Props) {
  const squares = useMemo(() => knownSquares(state), [state]);
  const [square, setSquare] = useState("");
  const [name, setName] = useState("");
  const [count, setCount] = useState("");
  const [coord, setCoord] = useState("");
  const [seq, setSeq] = useState<number | "">("");
  const [featureId, setFeatureId] = useState<string>("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("");

  const seqs = stratumSeqOptions(state, square);
  const squareFeatures = state.features.filter((f) => f.square === square.trim());

  const pending = state.finds.filter((f) => isFindPending(state, f));
  const registered = state.finds
    .filter((f) => !isFindPending(state, f))
    .filter((f) => !filter || f.square === filter)
    .sort((a, b) => a.square.localeCompare(b.square) || (effectiveStratumSeq(state, a) ?? 0) - (effectiveStratumSeq(state, b) ?? 0));

  const onSquare = (v: string) => {
    setSquare(v);
    setSeq("");
    setFeatureId("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = api.addFind({
      square: square.trim(),
      name: name.trim(),
      count: Number(count),
      coord,
      stratumSeq: seq,
      featureId: featureId || null,
      note,
    });
    if (r.ok) {
      const where =
        seq !== ""
          ? `第 ${seq} 层`
          : featureId
            ? `遗迹 ${squareFeatures.find((f) => f.id === featureId)?.code ?? ""}（随其层位）`
            : "待归区";
      notify(true, `「${name.trim()}」${count} 件已登记，去向：${where}`);
      setName("");
      setCount("");
      setCoord("");
      setNote("");
      setSeq("");
      setFeatureId("");
      if (!filter) setFilter(square.trim());
    } else {
      notify(false, r.error);
    }
  };

  return (
    <div className="finds-layout">
      <form className="panel entry-form" onSubmit={submit}>
        <h3>登记出土物</h3>
        <p className="form-tip">
          层位和遗迹都不填时先进<strong>待归区</strong>，归入某层后才计入该层统计；
          只关联已归层遗迹的，自动随遗迹入层。
        </p>
        <div className="form-row">
          <Field label="探方">
            <SquareInput value={square} onChange={onSquare} options={squares} />
          </Field>
          <Field label="出土物">
            <input required value={name} placeholder="如 夹砂陶片" onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="件数">
            <input required type="number" min={1} step={1} value={count} placeholder="如 12" onChange={(e) => setCount(e.target.value)} />
          </Field>
          <Field label="坐标点">
            <input required value={coord} placeholder="如 E3N4" onChange={(e) => setCoord(e.target.value)} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="归入地层" hint="可留空">
            <select value={seq} onChange={(e) => setSeq(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">未直接归层</option>
              {seqs.map((n) => (
                <option key={n} value={n}>第 {n} 层</option>
              ))}
            </select>
          </Field>
          <Field label="关联遗迹" hint="可留空">
            <select value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
              <option value="">不关联</option>
              {squareFeatures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code}（{f.kind}{f.stratumSeq === null ? "·待归层" : `·第${f.stratumSeq}层`}）
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="备注">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 可复原罐口沿" />
        </Field>
        <button type="submit" className="primary-action">登记出土物</button>
      </form>

      <section className="panel pending-panel">
        <div className="panel-head">
          <h3>
            待归区
            <span className="count-badge count-warn">{pending.length}</span>
          </h3>
        </div>
        {pending.length === 0 ? (
          <p className="empty">待归区已清空，所有出土物都有层位。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>探方</th>
                  <th>出土物</th>
                  <th>件数</th>
                  <th>坐标</th>
                  <th>现状</th>
                  <th>归入</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((f) => (
                  <PendingRow key={f.id} find={f} state={state} api={api} notify={notify} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>已归层出土物</h3>
          <div className="head-controls">
            <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">全部探方</option>
              {squares.map((sq) => (
                <option key={sq} value={sq}>{sq}</option>
              ))}
            </select>
          </div>
        </div>
        {registered.length === 0 ? (
          <p className="empty">还没有已归层的出土物。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>探方</th>
                  <th>出土物</th>
                  <th>件数</th>
                  <th>坐标</th>
                  <th>遗迹</th>
                  <th>地层</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {registered.map((f) => (
                  <RegisteredRow key={f.id} find={f} state={state} api={api} notify={notify} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function featureLabel(state: LedgerState, id: string | null): string {
  if (!id) return "";
  const f = state.features.find((x) => x.id === id);
  return f ? f.code : "";
}

function PendingRow({
  find,
  state,
  api,
  notify,
}: {
  find: Find;
  state: LedgerState;
  api: LedgerApi;
  notify: (ok: boolean, text: string) => void;
}) {
  const seqs = stratumSeqOptions(state, find.square);
  const features = state.features.filter((f) => f.square === find.square);
  const [targetSeq, setTargetSeq] = useState<number | "">("");
  const [targetFeature, setTargetFeature] = useState<string>(find.featureId ?? "");

  const assign = () => {
    if (targetSeq === "") {
      notify(false, "请先选择要归入的地层");
      return;
    }
    const r = api.assignFind(find.id, {
      stratumSeq: targetSeq,
      featureId: targetFeature || null,
    });
    notify(r.ok, r.ok ? `「${find.name}」已归入第 ${targetSeq} 层并计入统计` : r.error);
  };

  const currentFeature: Feature | null = targetFeature
    ? features.find((f) => f.id === targetFeature) ?? null
    : null;
  const seqValue = currentFeature && currentFeature.stratumSeq !== null
    ? currentFeature.stratumSeq
    : targetSeq;

  return (
    <tr>
      <td>{find.square}</td>
      <td>{find.name}</td>
      <td>{find.count}</td>
      <td className="mono">{find.coord}</td>
      <td className="note-cell">
        {find.featureId
          ? `随遗迹 ${featureLabel(state, find.featureId)}，但该遗迹尚未归层`
          : "未关联层位"}
      </td>
      <td>
        <div className="assign-controls">
          <select
            value={targetFeature}
            onChange={(e) => {
              setTargetFeature(e.target.value);
              const f = features.find((x) => x.id === e.target.value);
              if (f && f.stratumSeq !== null) setTargetSeq(f.stratumSeq);
            }}
          >
            <option value="">不关联遗迹</option>
            {features.map((f) => (
              <option key={f.id} value={f.id}>{f.code}</option>
            ))}
          </select>
          <select value={seqValue} onChange={(e) => setTargetSeq(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">选择地层</option>
            {seqs.map((n) => (
              <option key={n} value={n}>第 {n} 层</option>
            ))}
          </select>
          <button className="mini primary" onClick={assign}>归入</button>
          <button
            className="mini danger"
            onClick={() => {
              const r = api.deleteFind(find.id);
              notify(r.ok, r.ok ? "记录已删除" : r.error);
            }}
          >
            删
          </button>
        </div>
      </td>
    </tr>
  );
}

function RegisteredRow({
  find,
  state,
  api,
  notify,
}: {
  find: Find;
  state: LedgerState;
  api: LedgerApi;
  notify: (ok: boolean, text: string) => void;
}) {
  const eff = effectiveStratumSeq(state, find);
  const seqs = stratumSeqOptions(state, find.square);
  const move = (v: string) => {
    const r = api.assignFind(find.id, {
      stratumSeq: v === "" ? null : Number(v),
    });
    if (v === "") return;
    notify(r.ok, r.ok ? `「${find.name}」已改归第 ${v} 层` : r.error);
  };
  return (
    <tr>
      <td>{find.square}</td>
      <td>{find.name}{find.note ? <em className="attached"> · {find.note}</em> : null}</td>
      <td>{find.count}</td>
      <td className="mono">{find.coord}</td>
      <td className="mono">{featureLabel(state, find.featureId) || "—"}</td>
      <td>
        <select className="seq-select" value={eff ?? ""} onChange={(e) => move(e.target.value)}>
          {seqs.map((n) => (
            <option key={n} value={n}>第 {n} 层</option>
          ))}
        </select>
      </td>
      <td className="row-actions">
        <button
          className="mini"
          onClick={() => {
            const r = api.unassignFind(find.id);
            notify(r.ok, r.ok ? `「${find.name}」已退回待归区` : r.error);
          }}
        >
          退待归
        </button>
        <button
          className="mini danger"
          onClick={() => {
            const r = api.deleteFind(find.id);
            notify(r.ok, r.ok ? "记录已删除" : r.error);
          }}
        >
          删
        </button>
      </td>
    </tr>
  );
}

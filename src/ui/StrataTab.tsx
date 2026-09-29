import { useMemo, useState } from "react";
import type { LedgerState, Result, Stratum } from "../types";
import { strataOf } from "../domain";
import type { LedgerApi } from "../useLedger";
import { Field, SquareInput, knownSquares } from "./common";

interface Props {
  api: LedgerApi;
  state: LedgerState;
  notify: (ok: boolean, text: string) => void;
  jumpToAudit: (square: string) => void;
}

export function StrataTab({ api, state, notify, jumpToAudit }: Props) {
  const squares = useMemo(() => knownSquares(state), [state]);
  const [square, setSquare] = useState("");
  const [seq, setSeq] = useState("");
  const [top, setTop] = useState("");
  const [bottom, setBottom] = useState("");
  const [note, setNote] = useState("");

  const rows = square.trim() ? strataOf(state, square.trim()) : [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = api.addStratum({
      square: square.trim(),
      seq: Number(seq),
      top: Number(top),
      bottom: Number(bottom),
      note,
    });
    if (r.ok) {
      notify(true, `${square.trim()} 第${seq}层已录入`);
      setSeq("");
      setTop("");
      setBottom("");
      setNote("");
      document.getElementById("stratum-top")?.focus();
    } else {
      notify(false, r.error);
    }
  };

  // 下一层建议序号与顶标高：上一层底标高即新层顶标高
  const last = rows[rows.length - 1];
  const suggestedSeq = last ? last.seq + 1 : 1;
  const suggestedTop = last ? last.bottom : undefined;

  return (
    <div className="tab-grid">
      <form className="panel entry-form" onSubmit={submit}>
        <h3>录入地层</h3>
        <p className="form-tip">
          地层自上而下编号；同一探方内序号不许重号，底标高必须小于顶标高。
        </p>
        <div className="form-row">
          <Field label="探方">
            <SquareInput
              value={square}
              onChange={(v) => {
                setSquare(v);
                setSeq("");
              }}
              options={squares}
            />
          </Field>
          <Field label="地层序号">
            <input
              type="number"
              min={1}
              step={1}
              required
              value={seq}
              placeholder={String(suggestedSeq)}
              onChange={(e) => setSeq(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="顶标高(m)">
            <input
              id="stratum-top"
              type="number"
              step="0.001"
              required
              value={top}
              placeholder={suggestedTop !== undefined ? String(suggestedTop) : "如 10.000"}
              onChange={(e) => setTop(e.target.value)}
            />
          </Field>
          <Field label="底标高(m)">
            <input
              type="number"
              step="0.001"
              required
              value={bottom}
              placeholder="如 9.500"
              onChange={(e) => setBottom(e.target.value)}
            />
          </Field>
        </div>
        <Field label="土色土质 / 备注">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如 灰褐土、夹炭屑" />
        </Field>
        {last && (
          <p className="inline-tip">
            接续第 {last.seq} 层（底标高 {last.bottom}m）：建议序号 {suggestedSeq}，顶标高 {last.bottom}m
          </p>
        )}
        <button type="submit" className="primary-action">录入地层</button>
      </form>

      <section className="panel">
        <div className="panel-head">
          <h3>
            地层序列{square.trim() ? ` · ${square.trim()}` : ""}
          </h3>
          {rows.length > 0 && (
            <button className="ghost-btn" onClick={() => jumpToAudit(square.trim())}>
              核查本探方
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="empty">
            {square.trim()
              ? `探方 ${square.trim()} 还没有地层，先在左侧录入第 1 层。`
              : "输入或选择探方编号后显示地层序列。"}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>层</th>
                  <th>顶标高(m)</th>
                  <th>底标高(m)</th>
                  <th>厚度(m)</th>
                  <th>与上层衔接</th>
                  <th>备注</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <StratumRow
                    key={s.id}
                    stratum={s}
                    upperBottom={i > 0 ? rows[i - 1].bottom : null}
                    upperSeq={i > 0 ? rows[i - 1].seq : null}
                    api={api}
                    notify={notify}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StratumRow({
  stratum,
  upperBottom,
  upperSeq,
  api,
  notify,
}: {
  stratum: Stratum;
  upperBottom: number | null;
  upperSeq: number | null;
  api: LedgerApi;
  notify: (ok: boolean, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [top, setTop] = useState(String(stratum.top));
  const [bottom, setBottom] = useState(String(stratum.bottom));

  const join =
    upperBottom === null
      ? null
      : Math.abs(upperBottom - stratum.top) <= 0.005
      ? { ok: true, text: "接上" }
      : upperBottom > stratum.top
      ? { ok: false, text: `断档 ${+(upperBottom - stratum.top).toFixed(3)}m` }
      : { ok: false, text: `重叠 ${+(stratum.top - upperBottom).toFixed(3)}m` };

  const save = () => {
    const r = api.updateStratum(stratum.id, {
      top: top === "" ? undefined : Number(top),
      bottom: bottom === "" ? undefined : Number(bottom),
    });
    if (r.ok) {
      setEditing(false);
      notify(true, `第 ${stratum.seq} 层标高已更新`);
    } else {
      notify(false, r.error);
    }
  };

  const remove = () => {
    const r: Result<void> = api.deleteStratum(stratum.id);
    notify(r.ok, r.ok ? `第 ${stratum.seq} 层已删除` : r.error);
  };

  return (
    <tr>
      <td className="seq-cell">第{stratum.seq}层</td>
      {editing ? (
        <>
          <td>
            <input
              className="num-input"
              type="number"
              step="0.001"
              value={top}
              onChange={(e) => setTop(e.target.value)}
            />
          </td>
          <td>
            <input
              className="num-input"
              type="number"
              step="0.001"
              value={bottom}
              onChange={(e) => setBottom(e.target.value)}
            />
          </td>
        </>
      ) : (
        <>
          <td>{stratum.top}</td>
          <td>{stratum.bottom}</td>
        </>
      )}
      <td>{(stratum.top - stratum.bottom).toFixed(3)}</td>
      <td>
        {join === null ? (
          <span className="tag tag-neutral">表层</span>
        ) : join.ok ? (
          <span className="tag tag-ok">{join.text}</span>
        ) : (
          <span className="tag tag-err" title={upperSeq !== null ? `与第 ${upperSeq} 层之间` : ""}>
            {join.text}
          </span>
        )}
      </td>
      <td className="note-cell">{stratum.note ?? "—"}</td>
      <td className="row-actions">
        {editing ? (
          <>
            <button className="mini primary" onClick={save}>保存</button>
            <button className="mini" onClick={() => setEditing(false)}>取消</button>
          </>
        ) : (
          <>
            <button className="mini" onClick={() => setEditing(true)}>改标高</button>
            <button className="mini danger" onClick={remove}>删</button>
          </>
        )}
      </td>
    </tr>
  );
}

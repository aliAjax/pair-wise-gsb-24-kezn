import { useRef } from "react";
import type { LedgerState } from "../types";
import {
  featuresCSV,
  findsCSV,
  isFindPending,
  serializeState,
  strataCSV,
  summaryCSV,
} from "../domain";
import { downloadText, stamp } from "../download";
import type { LedgerApi } from "../useLedger";

interface Props {
  api: LedgerApi;
  state: LedgerState;
  notify: (ok: boolean, text: string) => void;
}

export function ExportTab({ api, state, notify }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingCount = state.finds.filter((f) => isFindPending(state, f)).length;

  const exportCSV = (kind: string, csv: string, name: string) => {
    downloadText(`发掘簿_${name}_${stamp()}.csv`, csv, "text/csv", true);
    notify(true, `已导出${kind} CSV`);
  };

  const exportJSON = () => {
    downloadText(`发掘簿存档_${stamp()}.json`, serializeState(state), "application/json");
    notify(true, "已导出完整存档（JSON）");
  };

  const importJSON = async (file: File) => {
    const text = await file.text();
    const r = api.importJSON(text);
    notify(r.ok, r.ok ? "存档已载入，可继续整理" : r.error);
  };

  return (
    <div className="export-layout">
      <section className="panel">
        <h3>导出台账（CSV，可直接用 Excel 打开）</h3>
        <div className="export-grid">
          <button className="export-card" onClick={() => exportCSV("地层", strataCSV(state), "地层台账")}>
            <strong>地层台账</strong>
            <span>探方 · 层序 · 顶底标高 · 厚度</span>
            <em>{state.strata.length} 条</em>
          </button>
          <button className="export-card" onClick={() => exportCSV("遗迹", featuresCSV(state), "遗迹台账")}>
            <strong>遗迹台账</strong>
            <span>编号 · 类型 · 层位 · 坐标 · 状态</span>
            <em>{state.features.length} 条</em>
          </button>
          <button className="export-card" onClick={() => exportCSV("出土物（仅已归层）", findsCSV(state, false), "出土物台账")}>
            <strong>出土物台账</strong>
            <span>仅含已归入地层、参与统计的物件</span>
            <em>{state.finds.length - pendingCount} 条</em>
          </button>
          <button className="export-card" onClick={() => exportCSV("出土物（含待归）", findsCSV(state, true), "出土物台账_含待归")}>
            <strong>出土物台账（含待归）</strong>
            <span>另含待归区 {pendingCount} 条，状态列单独标注</span>
            <em>{state.finds.length} 条</em>
          </button>
          <button className="export-card wide" onClick={() => exportCSV("分层汇总", summaryCSV(state), "分层汇总")}>
            <strong>分层汇总表</strong>
            <span>按探方逐层列遗迹单位与出土物件数，末行列待归区</span>
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>存档 / 换机继续整理</h3>
        <p className="form-tip">
          录入内容会自动保存在本浏览器；也可导出完整 JSON 存档备份或换机器导入，重开后接着整理。
        </p>
        <div className="save-actions">
          <button className="primary-action" onClick={() => { api.manualSave(); notify(true, "已手动保存到本机"); }}>
            立即保存
          </button>
          <button className="ghost-btn" onClick={exportJSON}>导出完整存档（JSON）</button>
          <button className="ghost-btn" onClick={() => fileRef.current?.click()}>
            导入存档
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importJSON(file);
              e.target.value = "";
            }}
          />
          <button
            className="ghost-btn danger-text"
            onClick={() => {
              if (window.confirm("确认清空本机全部发掘簿数据？此操作不可恢复，建议先导出存档。")) {
                api.wipe();
                notify(true, "本机数据已清空");
              }
            }}
          >
            清空本机数据
          </button>
        </div>
      </section>
    </div>
  );
}

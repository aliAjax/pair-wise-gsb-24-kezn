import { describe, expect, it } from "vitest";
import {
  addFeature,
  addFind,
  addStratum,
  assignFind,
  audit,
  auditSquare,
  autosaveState,
  createState,
  deleteFeature,
  deleteStratum,
  effectiveStratumSeq,
  featuresCSV,
  findsCSV,
  isFindPending,
  loadState,
  parseState,
  placeFeature,
  serializeState,
  squareStats,
  strataCSV,
  summaryCSV,
  unassignFind,
  updateStratum,
} from "./domain";

// parseState 需要一个极简 localStorage 占位（loadState 测试用，本文件主要走纯函数）
if (typeof globalThis.localStorage === "undefined") {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

function demoSquare() {
  const s = createState();
  // T0101：第1层 10.0~9.5，第2层 9.5~9.0
  addStratum(s, { square: "T0101", seq: 1, top: 10.0, bottom: 9.5 });
  addStratum(s, { square: "T0101", seq: 2, top: 9.5, bottom: 9.0 });
  return s;
}

describe("地层录入", () => {
  it("同探方同序号不许重号", () => {
    const s = demoSquare();
    const r = addStratum(s, { square: "T0101", seq: 2, top: 9.5, bottom: 9.0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("不许重号");
  });

  it("不同探方可使用相同序号", () => {
    const s = demoSquare();
    const r = addStratum(s, { square: "T0102", seq: 1, top: 8.0, bottom: 7.5 });
    expect(r.ok).toBe(true);
  });

  it("底标高不低于顶标高即层序倒挂，录入即拒", () => {
    const s = createState();
    const r = addStratum(s, { square: "T0101", seq: 1, top: 9.0, bottom: 9.0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("层序倒挂");
  });

  it("标高修改后产生倒挂，核查仍能报出", () => {
    const s = demoSquare();
    const target = s.strata[1];
    const r = updateStratum(s, target.id, { top: 9.6 }); // 9.6 顶 > 上层底 9.5
    expect(r.ok).toBe(true);
    const anomalies = auditSquare(s, "T0101");
    expect(anomalies.some((a) => a.kind === "overlap")).toBe(true);
  });
});

describe("地层衔接核查", () => {
  it("序号断档要指出探方和缺失地层", () => {
    const s = createState();
    addStratum(s, { square: "T0203", seq: 1, top: 10, bottom: 9.5 });
    addStratum(s, { square: "T0203", seq: 3, top: 9.5, bottom: 9.0 });
    const a = auditSquare(s, "T0203");
    const gap = a.find((x) => x.kind === "gap" && x.message.includes("序号断档"));
    expect(gap).toBeTruthy();
    expect(gap!.square).toBe("T0203");
    expect(gap!.message).toContain("缺第 2 层");
  });

  it("标高断档（上层底高于下层顶）报 gap 并给差值", () => {
    const s = createState();
    addStratum(s, { square: "T0203", seq: 1, top: 10, bottom: 9.5 });
    addStratum(s, { square: "T0203", seq: 2, top: 9.3, bottom: 9.0 });
    const a = auditSquare(s, "T0203");
    const gap = a.find((x) => x.message.includes("断档"));
    expect(gap?.message).toContain("0.2m");
  });

  it("标高重叠报 overlap，疑似层序倒挂", () => {
    const s = createState();
    addStratum(s, { square: "T0203", seq: 1, top: 10, bottom: 9.5 });
    addStratum(s, { square: "T0203", seq: 2, top: 9.6, bottom: 9.0 });
    const a = auditSquare(s, "T0203");
    expect(a.some((x) => x.kind === "overlap")).toBe(true);
  });

  it("5 毫米以内测量误差视为接上", () => {
    const s = createState();
    addStratum(s, { square: "T0203", seq: 1, top: 10, bottom: 9.5 });
    addStratum(s, { square: "T0203", seq: 2, top: 9.503, bottom: 9.0 });
    expect(auditSquare(s, "T0203")).toHaveLength(0);
  });
});

describe("遗迹单位", () => {
  it("未归层遗迹进入待归，核查告警", () => {
    const s = demoSquare();
    addFeature(s, {
      square: "T0101",
      code: "H12",
      kind: "灰坑",
      stratumSeq: null,
      coord: "E3N4",
    });
    const a = auditSquare(s, "T0101");
    expect(a.some((x) => x.kind === "feature_unplaced")).toBe(true);
  });

  it("归层后异常消失；同一坐标多个遗迹提示重复", () => {
    const s = demoSquare();
    const f1 = addFeature(s, {
      square: "T0101", code: "H12", kind: "灰坑", stratumSeq: 2, coord: "E3N4",
    });
    addFeature(s, {
      square: "T0101", code: "H13", kind: "灰坑", stratumSeq: 2, coord: "e3 n4",
    });
    expect(f1.ok).toBe(true);
    const a = auditSquare(s, "T0101");
    expect(a.some((x) => x.kind === "dup_coord")).toBe(true);
    placeFeature(s, (f1 as { value: { id: string } }).value.id, 2);
  });

  it("不能归入不存在的地层", () => {
    const s = demoSquare();
    const r = addFeature(s, {
      square: "T0101", code: "H99", kind: "灰坑", stratumSeq: 8, coord: "E1N1",
    });
    expect(r.ok).toBe(false);
  });
});

describe("待归区与统计", () => {
  it("未关联遗迹/地层的出土物先进待归区，不计入统计", () => {
    const s = demoSquare();
    addFind(s, {
      square: "T0101", name: "陶片", count: 12, coord: "E3N4",
      stratumSeq: null, featureId: null,
    });
    const stat = squareStats(s, "T0101");
    expect(stat.pendingFinds).toHaveLength(1);
    expect(stat.totalFindCount).toBe(0);
  });

  it("关联到已归层遗迹的出土物自动随遗迹入层统计", () => {
    const s = demoSquare();
    const f = addFeature(s, {
      square: "T0101", code: "H12", kind: "灰坑", stratumSeq: 2, coord: "E3N4",
    });
    addFind(s, {
      square: "T0101", name: "兽骨", count: 3, coord: "E3N4",
      stratumSeq: null, featureId: (f as { value: { id: string } }).value.id,
    });
    const stat = squareStats(s, "T0101");
    expect(stat.pendingFinds).toHaveLength(0);
    expect(stat.totalFindCount).toBe(3);
    expect(stat.strata[1].findCount).toBe(3);
  });

  it("归入某层后才进入统计，退回待归区后移出", () => {
    const s = demoSquare();
    const made = addFind(s, {
      square: "T0101", name: "石斧", count: 1, coord: "E2N2",
      stratumSeq: null, featureId: null,
    });
    const id = (made as { value: { id: string } }).value.id;
    expect(isFindPending(s, s.finds[0])).toBe(true);
    assignFind(s, id, { stratumSeq: 1 });
    expect(effectiveStratumSeq(s, s.finds[0])).toBe(1);
    expect(squareStats(s, "T0101").totalFindCount).toBe(1);
    unassignFind(s, id);
    expect(squareStats(s, "T0101").totalFindCount).toBe(0);
  });

  it("遗迹改层后，跟随遗迹的出土物一起换层", () => {
    const s = demoSquare();
    const f = addFeature(s, {
      square: "T0101", code: "H12", kind: "灰坑", stratumSeq: 1, coord: "E3N4",
    });
    const fid = (f as { value: { id: string } }).value.id;
    addFind(s, {
      square: "T0101", name: "陶片", count: 5, coord: "E3N4",
      stratumSeq: null, featureId: fid,
    });
    placeFeature(s, fid, 2);
    expect(effectiveStratumSeq(s, s.finds[0])).toBe(2);
  });

  it("显式归层的出土物不随遗迹走", () => {
    const s = demoSquare();
    const f = addFeature(s, {
      square: "T0101", code: "H12", kind: "灰坑", stratumSeq: 1, coord: "E3N4",
    });
    const fid = (f as { value: { id: string } }).value.id;
    addFind(s, {
      square: "T0101", name: "陶片", count: 5, coord: "E3N4",
      stratumSeq: 2, featureId: fid,
    });
    placeFeature(s, fid, 2);
    expect(effectiveStratumSeq(s, s.finds[0])).toBe(2);
  });
});

describe("引用完整性", () => {
  it("有遗迹/出土物引用的地层不允许删除", () => {
    const s = demoSquare();
    addFeature(s, {
      square: "T0101", code: "H12", kind: "灰坑", stratumSeq: 2, coord: "E3N4",
    });
    const r = deleteStratum(s, s.strata[1].id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("H12");
  });

  it("删除遗迹后，跟随它的待归出土物退回待归区", () => {
    const s = demoSquare();
    const f = addFeature(s, {
      square: "T0101", code: "H12", kind: "灰坑", stratumSeq: 2, coord: "E3N4",
    });
    const fid = (f as { value: { id: string } }).value.id;
    addFind(s, {
      square: "T0101", name: "陶片", count: 5, coord: "E3N4",
      stratumSeq: null, featureId: fid,
    });
    deleteFeature(s, fid);
    expect(s.finds[0].featureId).toBeNull();
    expect(isFindPending(s, s.finds[0])).toBe(true);
  });
});

describe("导出台账", () => {
  it("分层汇总 CSV 含待归区行；待归物默认不进出土物台账", () => {
    const s = demoSquare();
    addFind(s, {
      square: "T0101", name: "陶片", count: 12, coord: "E3N4",
      stratumSeq: null, featureId: null,
    });
    const rows = summaryCSV(s).split("\r\n");
    expect(rows.some((r) => r.includes("待归区"))).toBe(true);
    expect(findsCSV(s, false).split("\r\n")).toHaveLength(1); // 仅表头
    expect(findsCSV(s, true).split("\r\n")).toHaveLength(2);
  });

  it("地层/遗迹 CSV 带表头", () => {
    const s = demoSquare();
    expect(strataCSV(s).split("\r\n")[0]).toContain("探方");
    expect(featuresCSV(s).split("\r\n")).toHaveLength(1);
  });
});

describe("存档往返", () => {
  it("序列化后解析，数据原样恢复", () => {
    const s = demoSquare();
    const f = addFeature(s, {
      square: "T0101", code: "H12", kind: "灰坑", stratumSeq: 2, coord: "E3N4",
    });
    addFind(s, {
      square: "T0101", name: "陶片", count: 6, coord: "E3N4",
      stratumSeq: null, featureId: (f as { value: { id: string } }).value.id,
    });
    const text = serializeState(s);
    const parsed = parseState(JSON.parse(text));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.strata).toHaveLength(2);
      expect(parsed.value.features[0].code).toBe("H12");
      expect(parsed.value.finds[0].featureId).toBe(parsed.value.features[0].id);
      expect(squareStats(parsed.value, "T0101").totalFindCount).toBe(6);
    }
  });

  it("全探方核查无异常时 audit 返回空", () => {
    expect(audit(demoSquare())).toHaveLength(0);
  });
});

describe("本地存档", () => {
  it("自动保存后重开（loadState）能接着整理", () => {
    localStorage.clear();
    const s = createState();
    addStratum(s, { square: "T0909", seq: 1, top: 5, bottom: 4.5 });
    autosaveState(s);
    const reopened = loadState();
    expect(reopened).not.toBeNull();
    expect(reopened!.strata[0].square).toBe("T0909");
    expect(reopened!.savedAt).toBeGreaterThan(0);
  });
});

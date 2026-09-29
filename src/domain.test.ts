import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  addLayer,
  updateLayer,
  deleteLayer,
  addFeature,
  updateFeature,
  addFind,
  assignFind,
  unassignFind,
  validateTrench,
  validateAll,
  statsForTrench,
  buildLedgerCSV,
  toJSON,
  fromJSON,
  sampleState,
  type LedgerState,
} from "./domain.ts";

function must<T>(r: { ok: boolean; data?: T; error?: string }): T {
  assert.ok(r.ok, r.error ?? "expected ok result");
  return r.data!;
}

test("同探方同层序号不许重号", () => {
  let s = emptyState();
  s = must(addLayer(s, { trench: "t0203", seq: 1, top: 100, bottom: 99.5 }));
  const dup = addLayer(s, { trench: "T0203", seq: 1, top: 99, bottom: 98 });
  assert.equal(dup.ok, false);
  assert.match(dup.error!, /不许重号/);
});

test("层序倒挂（底板不低于顶板）被拦截", () => {
  const r = addLayer(emptyState(), { trench: "T1", seq: 1, top: 99, bottom: 99.2 });
  assert.equal(r.ok, false);
  assert.match(r.error!, /层序倒挂/);
});

test("相邻层标高接上：断档与重叠都要点名探方和地层", () => {
  // 断档：第2层顶 99.50 ≠ 第1层底 99.30
  let gap = must(addLayer(emptyState(), { trench: "T0203", seq: 1, top: 100, bottom: 99.5 }));
  gap = must(addLayer(gap, { trench: "T0203", seq: 2, top: 99.3, bottom: 99.0 }));
  const gapAnoms = validateTrench(gap, "T0203");
  const gapMsg = gapAnoms.find((a) => a.kind === "标高断档")!;
  assert.match(gapMsg.message, /T0203 第1层底板[\s\S]*第2层顶板[\s\S]*断档/);

  // 重叠：第2层顶 99.60 高于 第1层底 99.50
  let over = must(addLayer(emptyState(), { trench: "T0204", seq: 1, top: 100, bottom: 99.5 }));
  over = must(addLayer(over, { trench: "T0204", seq: 2, top: 99.6, bottom: 99.2 }));
  const overAnoms = validateTrench(over, "T0204");
  assert.ok(overAnoms.some((a) => a.kind === "标高重叠" && /T0204/.test(a.message)));

  // 严丝合缝：无断档/重叠
  let okS = must(addLayer(emptyState(), { trench: "T0205", seq: 1, top: 100, bottom: 99.5 }));
  okS = must(addLayer(okS, { trench: "T0205", seq: 2, top: 99.5, bottom: 99.1 }));
  assert.deepEqual(
    validateTrench(okS, "T0205").filter((a) => /标高/.test(a.kind)),
    []
  );
});

test("缺号（地层断档）指出具体探方与缺失层序", () => {
  let s = must(addLayer(emptyState(), { trench: "T0301", seq: 1, top: 99.8, bottom: 99.55 }));
  s = must(addLayer(s, { trench: "T0301", seq: 3, top: 99.55, bottom: 99.3 }));
  const miss = validateTrench(s, "T0301").find((a) => a.kind === "缺号")!;
  assert.equal(miss.seq, 2);
  assert.match(miss.message, /T0301 地层断档：第2层缺失/);
});

test("遗迹重复坐标被拦截（忽略空白与大小写）", () => {
  let s = must(addLayer(emptyState(), { trench: "T0203", seq: 2, top: 100, bottom: 99.5 }));
  s = must(addFeature(s, { trench: "T0203", seq: 2, code: "H12", kind: "灰坑", coord: "E3.0N4.0" }));
  const dup = addFeature(s, { trench: "T0203", seq: 2, code: "H13", kind: "柱洞", coord: "e3.0 n4.0" });
  assert.equal(dup.ok, false);
  assert.match(dup.error!, /重复坐标/);
});

test("遗迹单位号同探方不许重复", () => {
  let s = must(addLayer(emptyState(), { trench: "T0203", seq: 2, top: 100, bottom: 99.5 }));
  s = must(addFeature(s, { trench: "T0203", seq: 2, code: "H12", kind: "灰坑", coord: "E1N1" }));
  const dup = addFeature(s, { trench: "T0203", seq: 2, code: "h12", kind: "灰坑", coord: "E2N2" });
  assert.equal(dup.ok, false);
  assert.match(dup.error!, /单位号不许重复/);
});

test("遗迹不能归入不存在的地层", () => {
  const s = emptyState();
  const r = addFeature(s, { trench: "T0203", seq: 4, code: "H1", kind: "灰坑", coord: "E1N1" });
  assert.equal(r.ok, false);
  assert.match(r.error!, /尚未建立/);
});

test("待归区出土物不计入统计；归入地层后才计入", () => {
  let s = must(addLayer(emptyState(), { trench: "T0301", seq: 1, top: 99.8, bottom: 99.55 }));
  s = must(addFind(s, { trench: "T0301", seq: null, coord: "E2N6", count: 2, material: "石斧" }));
  let st = statsForTrench(s, "T0301");
  assert.equal(st.findCount, 0);
  assert.equal(st.pending, 1);

  const id = s.finds[0].id;
  s = must(assignFind(s, id, 1));
  st = statsForTrench(s, "T0301");
  assert.equal(st.findCount, 2);
  assert.equal(st.pending, 0);

  // 退回待归区
  s = must(unassignFind(s, id));
  st = statsForTrench(s, "T0301");
  assert.equal(st.findCount, 0);
  assert.equal(st.pending, 1);
});

test("归入不存在的地层会被拒绝", () => {
  let s = emptyState();
  s = must(addFind(s, { trench: "T1", seq: null, coord: "E1N1", count: 1, material: "陶片" }));
  const r = assignFind(s, s.finds[0].id, 9);
  assert.equal(r.ok, false);
  assert.match(r.error!, /尚未建立/);
});

test("出土物件数必须是正整数", () => {
  for (const count of [0, -1, 1.5, NaN]) {
    const r = addFind(emptyState(), { trench: "T1", seq: null, coord: "E1N1", count, material: "陶片" });
    assert.equal(r.ok, false, `count=${count} 应被拒绝`);
  }
});

test("挂遗迹时层位必须与遗迹所在层一致", () => {
  let s = must(addLayer(emptyState(), { trench: "T1", seq: 1, top: 100, bottom: 99.5 }));
  s = must(addLayer(s, { trench: "T1", seq: 2, top: 99.5, bottom: 99.0 }));
  s = must(addFeature(s, { trench: "T1", seq: 2, code: "H1", kind: "灰坑", coord: "E1N1" }));
  const wrong = addFind(s, { trench: "T1", seq: 1, featureId: s.features[0].id, coord: "E1N1", count: 1, material: "骨" });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error!, /不一致/);
});

test("删除地层：有遗迹被拦；出土物退回待归区", () => {
  let s = must(addLayer(emptyState(), { trench: "T1", seq: 1, top: 100, bottom: 99.5 }));
  s = must(addFeature(s, { trench: "T1", seq: 1, code: "H1", kind: "灰坑", coord: "E1N1" }));
  const blocked = deleteLayer(s, s.layers[0].id);
  assert.equal(blocked.ok, false);

  let s2 = must(addLayer(emptyState(), { trench: "T1", seq: 1, top: 100, bottom: 99.5 }));
  s2 = must(addFind(s2, { trench: "T1", seq: 1, coord: "E2N2", count: 3, material: "陶片" }));
  s2 = must(deleteLayer(s2, s2.layers[0].id));
  assert.equal(s2.finds[0].seq, null);
  assert.equal(s2.layers.length, 0);
});

test("改地层序号级联带动遗迹与出土物", () => {
  let s = must(addLayer(emptyState(), { trench: "T1", seq: 1, top: 100, bottom: 99.5 }));
  s = must(addFeature(s, { trench: "T1", seq: 1, code: "H1", kind: "灰坑", coord: "E1N1" }));
  s = must(addFind(s, { trench: "T1", seq: 1, coord: "E2N2", count: 1, material: "陶片" }));
  // 先补两层再把第1层改为第3层（中间缺号会被核查发现，但级联应成立）
  s = must(addLayer(s, { trench: "T1", seq: 2, top: 99.5, bottom: 99.2 }));
  s = must(addLayer(s, { trench: "T1", seq: 3, top: 99.2, bottom: 98.9 }));
  // 直接把 1→4 避免与现有层冲突
  const r = updateLayer(s, s.layers[0].id, { seq: 4, top: 98.9, bottom: 98.6 });
  assert.equal(r.ok, true);
  s = r.data!;
  assert.equal(s.features[0].seq, 4);
  assert.equal(s.finds[0].seq, 4);
});

test("遗迹改层后挂它的出土物随行", () => {
  let s = must(addLayer(emptyState(), { trench: "T1", seq: 1, top: 100, bottom: 99.5 }));
  s = must(addLayer(s, { trench: "T1", seq: 2, top: 99.5, bottom: 99.0 }));
  s = must(addFeature(s, { trench: "T1", seq: 1, code: "H1", kind: "灰坑", coord: "E1N1" }));
  s = must(addFind(s, { trench: "T1", seq: 1, featureId: s.features[0].id, coord: "E1N1", count: 2, material: "骨" }));
  s = must(updateFeature(s, s.features[0].id, { seq: 2 }));
  assert.equal(s.finds[0].seq, 2);
});

test("样例数据能点出 T0203 断档、T0204 重叠、T0301 缺号、T0203 重复坐标与待归提示", () => {
  const s = sampleState();
  const kinds = new Map(validateAll(s).map((a) => [`${a.trench}|${a.kind}`, a]));
  assert.ok(kinds.has("T0203|标高断档"));
  assert.ok(kinds.has("T0204|标高重叠"));
  assert.ok(kinds.has("T0301|缺号"));
  assert.ok(kinds.has("T0203|重复坐标"));
  assert.ok(kinds.get("T0203|待归")?.message.includes("2 批") === false);
  // 待归：T0203 一批、T0301 一批
  assert.match(kinds.get("T0203|待归")!.message, /1 批/);
  assert.match(kinds.get("T0301|待归")!.message, /1 批/);
});

test("样例统计：待归件数不计入；T0203 已归层 15 件", () => {
  const s = sampleState();
  assert.equal(statsForTrench(s, "T0203").findCount, 15);
  assert.equal(statsForTrench(s, "T0301").findCount, 0);
  assert.equal(statsForTrench(s, "T0301").pending, 1);
});

test("台账 CSV 含各数据段且异常被导出", () => {
  const csv = buildLedgerCSV(sampleState());
  for (const section of ["## 探方汇总", "## 地层", "## 遗迹单位", "## 出土物", "## 异常"]) {
    assert.ok(csv.includes(section), `缺少段落 ${section}`);
  }
  assert.ok(csv.includes("标高断档"));
  assert.ok(csv.includes("标高重叠"));
  assert.ok(csv.includes("T0203"));
  // 每行单元格数应与表头一致（异常段 6 列）
  const anomalyHeader = csv.split(/\r?\n/).find((l) => l.startsWith("## 异常"))!;
  assert.equal(anomalyHeader.split(",").length, 6);
});

test("JSON 备份可往返，坏文件被拒", () => {
  const s = sampleState();
  const restored = must(fromJSON(toJSON(s)));
  assert.equal(restored.layers.length, s.layers.length);
  assert.equal(restored.finds.length, s.finds.length);
  assert.equal(fromJSON("{not json").ok, false);
  assert.equal(fromJSON(JSON.stringify({ layers: [] })).ok, false);
});

test("空簿无异常，导出不报错", () => {
  const s: LedgerState = emptyState();
  assert.deepEqual(validateAll(s), []);
  assert.ok(buildLedgerCSV(s).length > 0);
});

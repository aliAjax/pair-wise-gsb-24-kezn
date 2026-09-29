// 续编发掘簿 —— 领域模型

/** 地层记录 */
export interface Stratum {
  id: string;
  /** 探方编号，如 T0203 */
  square: string;
  /** 地层序号（自上而下，第 1 层为最上层），同一探方内不许重号 */
  seq: number;
  /** 顶标高（米） */
  top: number;
  /** 底标高（米），正常情况下应小于顶标高 */
  bottom: number;
  /** 土色、土质等备注 */
  note?: string;
  createdAt: number;
}

/** 遗迹单位，如灰坑 H12、墓葬 M3、房址 F2 */
export interface Feature {
  id: string;
  square: string;
  /** 遗迹编号，如 H12 */
  code: string;
  /** 遗迹类型：灰坑 / 墓葬 / 房址 / 沟 / 柱洞 …… */
  kind: string;
  /** 所属地层序号；为空表示遗迹本身尚未归层 */
  stratumSeq: number | null;
  /** 坐标点，如 E3N4 */
  coord: string;
  note?: string;
  createdAt: number;
}

/** 出土物记录 */
export interface Find {
  id: string;
  square: string;
  /** 物件名称/简述，如 夹砂陶片、兽骨 */
  name: string;
  /** 出土件数 */
  count: number;
  /** 坐标点，如 E3N4 */
  coord: string;
  /** 直接归入的地层序号 */
  stratumSeq: number | null;
  /** 关联的遗迹单位 id */
  featureId: string | null;
  note?: string;
  createdAt: number;
}

export interface LedgerState {
  strata: Stratum[];
  features: Feature[];
  finds: Find[];
  /** 最近一次保存时间戳 */
  savedAt: number | null;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** 异常核查条目 */
export interface Anomaly {
  level: "error" | "warn" | "info";
  kind:
    | "dup_seq"
    | "inverted"
    | "gap"
    | "overlap"
    | "dup_coord"
    | "feature_unplaced"
    | "find_pending"
    | "dangling_ref";
  square: string;
  /** 涉及的地层序号（如有） */
  seqs?: number[];
  message: string;
}

/** 单地层统计 */
export interface StratumStat {
  stratum: Stratum;
  features: Feature[];
  finds: Find[];
  findCount: number;
}

export interface SquareStat {
  square: string;
  strata: StratumStat[];
  unplacedFeatures: Feature[];
  pendingFinds: Find[];
  totalFindCount: number;
}

import type { SnapshotPoint } from "./types"

/**
 * 时间序列降采样：按时间顺序分桶，每桶保留最小值与最大值，
 * 既能压缩点数又不会抹掉波峰波谷。
 */
export function downsample(points: SnapshotPoint[], maxPoints: number): SnapshotPoint[] {
  // 图表按数组顺序连线，输入必须严格按时间升序；
  // 这里防御性排序，避免任何乱序数据让 ECharts 折线来回折叠。
  const ordered = [...points].sort((a, b) => a.ts - b.ts)
  if (ordered.length <= maxPoints) return ordered
  const bucketCount = Math.max(1, Math.floor(maxPoints / 2))
  const size = Math.ceil(ordered.length / bucketCount)
  const out: SnapshotPoint[] = []
  for (let i = 0; i < ordered.length; i += size) {
    const chunk = ordered.slice(i, i + size)
    let min = chunk[0]
    let max = chunk[0]
    for (const p of chunk) {
      if (p.online < min.online) min = p
      if (p.online > max.online) max = p
    }
    // 每个桶保留 min/max 两个采样点，但必须按时间先后输出：
    // 先推 min 再推 max 时，min 的 ts 可能晚于 max，折线就会向过去折返。
    if (min === max) {
      out.push(min)
    } else if (min.ts <= max.ts) {
      out.push(min, max)
    } else {
      out.push(max, min)
    }
  }
  // 各桶交界处仍可能因桶内保留点不同而出现局部回退，最后统一排序兜底。
  return out.sort((a, b) => a.ts - b.ts)
}

/** 计算区间统计（基于未降采样的原始数据，只统计直播中的采样点） */
export function computeStats(points: SnapshotPoint[]): { current: number; peak: number; avg: number } {
  const live = points.filter((p) => p.liveStatus === 1)
  if (live.length === 0) return { current: 0, peak: 0, avg: 0 }
  let peak = 0
  let sum = 0
  for (const p of live) {
    if (p.online > peak) peak = p.online
    sum += p.online
  }
  return {
    current: live[live.length - 1].online,
    peak,
    avg: Math.round(sum / live.length),
  }
}

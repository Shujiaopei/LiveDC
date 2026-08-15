import { getRoomInfo } from "./bilibili"
import { getStreamer, insertSnapshot, updateStreamerState } from "./db"
import type { Streamer } from "./types"

/** 同一主播两次抓取的最小间隔，防止并发请求刷接口 */
const MIN_FETCH_GAP = Math.max(5_000, Number(process.env.MIN_FETCH_GAP_MS ?? 20_000) || 20_000)

/** 同时抓取的主播数上限：串行采集一个慢请求会拖住所有主播，容易整分钟地漏采 */
const FETCH_CONCURRENCY = Math.min(
  8,
  Math.max(1, Math.round(Number(process.env.FETCH_CONCURRENCY ?? 4)) || 4),
)

const lastFetchAt = new Map<number, number>()
// 同一主播只允许一个在途请求：轮询 tick 与页面请求并发触发时合并为一次抓取
const inflight = new Map<number, Promise<void>>()

// 全局并发信号量：refreshMany 可能被轮询与页面请求同时调用，
// 各自的 worker 数并不相加，真正的网络抓取仍受 FETCH_CONCURRENCY 限制。
let activeFetches = 0
const fetchWaiters: Array<() => void> = []

async function acquireFetchSlot(): Promise<void> {
  if (activeFetches < FETCH_CONCURRENCY) {
    activeFetches++
    return
  }
  await new Promise<void>((resolve) => {
    fetchWaiters.push(resolve)
  })
}

function releaseFetchSlot(): void {
  const next = fetchWaiters.shift()
  if (next) {
    next()
    return
  }
  activeFetches--
}

/** 刷新某个主播的在线人数；已在途或刚抓取过则复用/跳过 */
export function refreshStreamer(id: number): Promise<void> {
  const existing = inflight.get(id)
  if (existing) return existing
  const last = lastFetchAt.get(id) ?? 0
  if (Date.now() - last < MIN_FETCH_GAP) return Promise.resolve()
  lastFetchAt.set(id, Date.now())

  // 失败不外抛：轮询/补刷都是尽力而为，单个主播抓取失败不应触发未处理的 rejection
  const task = refreshNow(id).catch(() => {})
  inflight.set(id, task)
  void task.finally(() => {
    inflight.delete(id)
  })
  return task
}

/** 并发刷新一组主播（去重），单个失败不影响其余主播 */
export async function refreshMany(ids: number[], concurrency = FETCH_CONCURRENCY): Promise<void> {
  const list = [...new Set(ids)]
  if (list.length === 0) return
  const limit = Math.min(Math.max(1, Math.round(concurrency) || 1), list.length)
  let next = 0
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const id = list[next++]
      if (id === undefined) return
      await refreshStreamer(id).catch(() => {})
    }
  })
  await Promise.all(workers)
}

async function refreshNow(id: number): Promise<void> {
  const streamer = getStreamer(id)
  if (!streamer) return
  await acquireFetchSlot()
  try {
    const info = await getRoomInfo(streamer.roomId)
    // 未开播时按 0 记录，图表上如实反映停播时段
    const online = info.liveStatus === 1 ? info.online : 0
    updateStreamerState(id, {
      name: info.name || streamer.name,
      avatar: info.avatar ?? streamer.avatar,
      liveStatus: info.liveStatus,
      title: info.title,
      online,
    })
    // 采集时刻的开播状态随采样点入库，区间统计据此排除下播时段
    insertSnapshot(id, online, info.liveStatus, Date.now())
  } finally {
    releaseFetchSlot()
  }
}

export function isStale(streamer: Streamer, thresholdMs: number): boolean {
  return streamer.lastFetchedAt === null || Date.now() - streamer.lastFetchedAt > thresholdMs
}

/**
 * 刷新其中已过期的主播，最多等待 maxWaitMs 后返回。
 * 用于页面请求时顺手补一刷，让首次加载的数据尽量新。
 */
export async function refreshStale(
  streamerIds: number[],
  staleAfterMs = 60_000,
  maxWaitMs = 3000,
): Promise<void> {
  const stale = streamerIds.filter((id) => {
    const s = getStreamer(id)
    return s !== null && isStale(s, staleAfterMs)
  })
  if (stale.length === 0) return
  await Promise.race([
    refreshMany(stale),
    new Promise((resolve) => setTimeout(resolve, maxWaitMs)),
  ])
}

import { listStreamers, pruneSnapshots } from "./db"
import { refreshMany } from "./refresh"

let started = false
let lastPruneAt = 0

/**
 * 启动后台采集：定期抓取所有监控主播的在线人数。
 * 由 instrumentation 在服务端启动时调用。
 */
export function startPoller(): void {
  // 构建阶段（next build）也会执行 register，这里跳过
  if (started || process.env.NEXT_PHASE === "phase-production-build") return
  started = true

  const intervalMs = Math.max(15_000, Number(process.env.POLL_INTERVAL_MS ?? 60_000) || 60_000)
  const retentionDays = Math.max(1, Number(process.env.SNAPSHOT_RETENTION_DAYS ?? 7) || 7)

  const tick = async () => {
    try {
      const streamers = listStreamers()
      await refreshMany(streamers.map((s) => s.id))
      // 每小时清理一次过期采样点
      const now = Date.now()
      if (now - lastPruneAt > 3600_000) {
        lastPruneAt = now
        pruneSnapshots(now - retentionDays * 86400_000)
      }
    } catch {
      // 轮询失败不抛出，等待下一轮
    }
  }

  // 用递归 setTimeout 而不是 setInterval：
  // 上一轮结束后的 intervalMs 再开始下一轮，慢请求不会让任务队列越积越多，
  // 也不会因为固定间隔错过整分钟而整轮跳过。
  const loop = () => {
    void tick().finally(() => {
      const timer = setTimeout(loop, intervalMs)
      timer.unref?.()
    })
  }
  loop()
}

/** 数字/时间格式化，纯函数，服务端与客户端共用 */

/** 1,234 精确格式（千分位） */
export function formatCountFull(n: number): string {
  return Math.round(n).toLocaleString("zh-CN")
}

/** 12,345 → 1.2万 的紧凑格式，用于卡片大数字与统计 */
export function formatCountCompact(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return formatCountFull(n)
}

/** 时间刻度格式：24 小时内只显示时分，跨天带上日期 */
export function formatTick(ts: number, spanMs: number): string {
  const d = new Date(ts)
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  if (spanMs <= 24 * 3600_000) return hm
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`
}

/** 具体时刻：当天显示 HH:mm:ss，跨天显示 MM-DD HH:mm */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  if (sameDay) return `${hm}:${String(d.getSeconds()).padStart(2, "0")}`
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`
}

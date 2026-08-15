import { NextRequest, NextResponse } from "next/server"
import { getSnapshots, getStreamer } from "@/lib/db"
import { computeStats, downsample } from "@/lib/downsample"
import { refreshStale } from "@/lib/refresh"
import type { HistorySeries } from "@/lib/types"

export const dynamic = "force-dynamic"

function clampHours(v: number | null): number {
  if (!v || !Number.isFinite(v)) return 24
  return Math.min(168, Math.max(1, Math.round(v)))
}

/** 对比数据：多个主播同一时间区间的在线人数曲线 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const ids = [
    ...new Set(
      (sp.get("ids") ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].slice(0, 8)
  const hours = clampHours(Number(sp.get("hours")))

  if (ids.length === 0) return NextResponse.json({ series: [] })

  await refreshStale(ids, 60_000, 3000)

  const from = Date.now() - hours * 3600_000
  const series: HistorySeries[] = []
  for (const id of ids) {
    const s = getStreamer(id)
    if (!s) continue
    const points = getSnapshots(id, from, Date.now())
    series.push({
      streamerId: s.id,
      name: s.name,
      avatar: s.avatar,
      liveStatus: s.liveStatus,
      online: s.online,
      points: downsample(points, 800),
      stats: computeStats(points),
    })
  }
  return NextResponse.json({ series })
}

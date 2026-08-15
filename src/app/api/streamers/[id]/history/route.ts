import { NextRequest, NextResponse } from "next/server"
import { getSnapshots, getStreamer } from "@/lib/db"
import { computeStats, downsample } from "@/lib/downsample"
import { refreshStale } from "@/lib/refresh"

export const dynamic = "force-dynamic"

function clampHours(v: number | null): number {
  if (!v || !Number.isFinite(v)) return 24
  return Math.min(168, Math.max(1, Math.round(v)))
}

/** 单个主播的历史在线人数（小时区间，自动降采样） */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const streamerId = Number(id)
  const streamer = getStreamer(streamerId)
  if (!streamer) {
    return NextResponse.json({ error: "主播不存在" }, { status: 404 })
  }

  const hours = clampHours(Number(req.nextUrl.searchParams.get("hours")))
  await refreshStale([streamerId], 60_000, 2500)
  const from = Date.now() - hours * 3600_000
  const points = getSnapshots(streamerId, from, Date.now())
  return NextResponse.json({
    streamer,
    points: downsample(points, 800),
    stats: computeStats(points),
  })
}

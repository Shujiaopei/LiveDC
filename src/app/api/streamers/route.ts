import { NextRequest, NextResponse } from "next/server"
import { isAdmin } from "@/lib/auth"
import { getRoomInfo, parseRoomInput, resolveRoomId } from "@/lib/bilibili"
import { getRecentPoints, getStreamerByRoomId, insertStreamer, listStreamers } from "@/lib/db"
import { downsample } from "@/lib/downsample"
import { refreshStale, refreshStreamer } from "@/lib/refresh"
import type { StreamerWithSpark } from "@/lib/types"

export const dynamic = "force-dynamic"

/** 监控列表：所有主播 + 迷你趋势（最近 2 小时） */
export async function GET() {
  const streamers = listStreamers()
  // 顺手补刷过期数据（最多等 2.5 秒，剩余在后台继续）
  await refreshStale(
    streamers.map((s) => s.id),
    60_000,
    2500,
  )
  const rows: StreamerWithSpark[] = streamers.map((s) => ({
    ...s,
    spark: downsample(getRecentPoints(s.id, 2 * 3600_000), 60),
  }))
  // 开播的在前（按在线人数降序），未开播的在后（同样按人数降序）
  rows.sort((a, b) => {
    const la = a.liveStatus === 1 ? 1 : 0
    const lb = b.liveStatus === 1 ? 1 : 0
    if (la !== lb) return lb - la
    return b.online - a.online || a.id - b.id
  })
  return NextResponse.json({ streamers: rows })
}

/** 添加主播：支持直播间链接或房间号 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "无管理权限" }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as { input?: unknown } | null
  const input = typeof body?.input === "string" ? body.input.trim() : ""
  const roomIdOrShort = parseRoomInput(input)
  if (!roomIdOrShort) {
    return NextResponse.json({ error: "请输入有效的直播间链接或房间号" }, { status: 400 })
  }

  let resolved: { roomId: number; shortId: number | null }
  let info: { online: number; liveStatus: number; title: string; name: string; avatar: string | null }
  try {
    resolved = await resolveRoomId(roomIdOrShort)
    info = await getRoomInfo(resolved.roomId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询直播间失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (getStreamerByRoomId(resolved.roomId)) {
    return NextResponse.json({ error: "该主播已在监控列表中" }, { status: 409 })
  }

  const streamer = insertStreamer({
    roomId: resolved.roomId,
    shortId: resolved.shortId,
    name: info.name || "未知主播",
    avatar: info.avatar,
    liveStatus: info.liveStatus,
    title: info.title,
    online: info.liveStatus === 1 ? info.online : 0,
  })
  void refreshStreamer(streamer.id) // 立即记录第一个采样点
  return NextResponse.json({ streamer })
}

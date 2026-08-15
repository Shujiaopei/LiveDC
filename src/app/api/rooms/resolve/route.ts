import { NextRequest, NextResponse } from "next/server"
import { isAdmin } from "@/lib/auth"
import { getRoomInfo, parseRoomInput, resolveRoomId } from "@/lib/bilibili"
import { getStreamerByRoomId } from "@/lib/db"
import type { RoomPreview } from "@/lib/types"

export const dynamic = "force-dynamic"

/** 管理页添加前的解析预览：校验房间号并拉取主播信息 */
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

  let preview: RoomPreview
  try {
    const resolved = await resolveRoomId(roomIdOrShort)
    const info = await getRoomInfo(resolved.roomId)
    preview = {
      roomId: resolved.roomId,
      shortId: resolved.shortId,
      name: info.name || "未知主播",
      avatar: info.avatar,
      liveStatus: info.liveStatus,
      title: info.title,
      online: info.liveStatus === 1 ? info.online : 0,
      alreadyMonitored: getStreamerByRoomId(resolved.roomId) !== null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询直播间失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }
  return NextResponse.json({ preview })
}

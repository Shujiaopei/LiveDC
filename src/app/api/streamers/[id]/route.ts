import { NextRequest, NextResponse } from "next/server"
import { isAdmin } from "@/lib/auth"
import { deleteStreamer, getStreamer } from "@/lib/db"

export const dynamic = "force-dynamic"

/** 删除主播（连同其历史采样点） */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "无管理权限" }, { status: 401 })
  }
  const { id } = await ctx.params
  const streamerId = Number(id)
  if (!Number.isInteger(streamerId) || streamerId <= 0) {
    return NextResponse.json({ error: "无效的主播 ID" }, { status: 400 })
  }
  if (!getStreamer(streamerId)) {
    return NextResponse.json({ error: "主播不存在" }, { status: 404 })
  }
  deleteStreamer(streamerId)
  return NextResponse.json({ ok: true })
}

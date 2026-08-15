import { NextRequest, NextResponse } from "next/server"
import { ADMIN_COOKIE, adminEnabled, isAdmin, issueToken } from "@/lib/auth"

export const dynamic = "force-dynamic"

/** 当前认证状态 */
export async function GET(req: NextRequest) {
  return NextResponse.json({ enabled: adminEnabled(), authed: isAdmin(req) })
}

/** 登录 / 退出 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    action?: string
    password?: string
  } | null

  if (body?.action === "logout") {
    const res = NextResponse.json({ authed: false })
    res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
    return res
  }

  if (!adminEnabled()) return NextResponse.json({ authed: true })
  if (body?.password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 })
  }
  const res = NextResponse.json({ authed: true })
  res.cookies.set(ADMIN_COOKIE, issueToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
    secure: process.env.NODE_ENV === "production",
  })
  return res
}

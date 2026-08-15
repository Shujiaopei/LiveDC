import { createHmac, timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"

/**
 * 管理端轻量认证：设置 ADMIN_PASSWORD 环境变量后，
 * 管理页与增删接口需要密码登录（httpOnly cookie）。
 * 未设置时管理功能完全开放，适合本地使用。
 */

export const ADMIN_COOKIE = "livedc_admin"

export function adminEnabled(): boolean {
  return !!process.env.ADMIN_PASSWORD
}

function adminToken(): string {
  return createHmac("sha256", process.env.ADMIN_PASSWORD ?? "")
    .update("liver-dc-admin")
    .digest("hex")
}

function checkToken(value: string | undefined): boolean {
  if (!adminEnabled()) return true
  if (!value) return false
  const a = Buffer.from(adminToken())
  const b = Buffer.from(value)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** 请求是否具备管理权限 */
export function isAdmin(req: NextRequest): boolean {
  if (!adminEnabled()) return true
  return checkToken(req.cookies.get(ADMIN_COOKIE)?.value)
}

/** 生成登录 cookie 的 value */
export function issueToken(): string {
  return adminToken()
}

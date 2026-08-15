"use client"

import { useEffect, useState } from "react"

// 模块级缓存 + 去重：同页多个组件（顶栏/页面内容）共享一次请求结果
let cached: boolean | null = null
let inflight: Promise<boolean> | null = null

function fetchAdminEnabled(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached)
  if (!inflight) {
    inflight = fetch("/api/auth", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { enabled?: boolean } | null) => json?.enabled ?? false)
      .then((v) => {
        cached = v
        return v
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/**
 * 是否设置了 ADMIN_PASSWORD（管理需密码登录）。
 * 返回 null 表示尚未得知；设置后前端隐藏管理入口，管理员可直接访问 /admin 登录。
 */
export function useAdminEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    void fetchAdminEnabled().then((v) => {
      if (alive) setEnabled(v)
    })
    return () => {
      alive = false
    }
  }, [])

  return enabled
}

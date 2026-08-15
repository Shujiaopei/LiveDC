"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, LogOut, Search, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LiveBadge } from "@/components/live-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatClock, formatCountCompact } from "@/lib/format"
import type { RoomPreview, Streamer } from "@/lib/types"

interface AuthState {
  enabled: boolean
  authed: boolean
}

export function AdminClient() {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [streamers, setStreamers] = useState<Streamer[] | null>(null)
  const [input, setInput] = useState("")
  const [resolving, setResolving] = useState(false)
  const [preview, setPreview] = useState<RoomPreview | null>(null)
  const [adding, setAdding] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Streamer | null>(null)
  const [password, setPassword] = useState("")

  const loadStreamers = useCallback(async () => {
    try {
      const res = await fetch("/api/streamers", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { streamers: Streamer[] }
      setStreamers(json.streamers)
    } catch {
      // 轮询会重试
    }
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch("/api/auth", { cache: "no-store" })
        if (!alive) return
        const json = (await res.json()) as AuthState
        setAuth(json)
        if (json.authed) void loadStreamers()
      } catch {
        if (alive) setAuth({ enabled: false, authed: true })
      }
    })()
    return () => {
      alive = false
    }
  }, [loadStreamers])

  // 登录后开始轮询列表（首次加载由登录流程/初始认证触发）
  useEffect(() => {
    if (!auth?.authed) return
    const timer = setInterval(() => void loadStreamers(), 60_000)
    return () => clearInterval(timer)
  }, [auth?.authed, loadStreamers])

  const resolve = async () => {
    if (!input.trim()) {
      toast.warning("请输入直播间链接或房间号")
      return
    }
    setResolving(true)
    setPreview(null)
    try {
      const res = await fetch("/api/rooms/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      })
      const json = (await res.json()) as { preview?: RoomPreview; error?: string }
      if (!res.ok || !json.preview) throw new Error(json.error ?? "解析失败")
      setPreview(json.preview)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "解析失败")
    } finally {
      setResolving(false)
    }
  }

  const add = async () => {
    setAdding(true)
    try {
      const res = await fetch("/api/streamers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      })
      const json = (await res.json()) as { streamer?: Streamer; error?: string }
      if (!res.ok || !json.streamer) throw new Error(json.error ?? "添加失败")
      toast.success(`已添加「${json.streamer.name}」`)
      setInput("")
      setPreview(null)
      void loadStreamers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "添加失败")
    } finally {
      setAdding(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      const res = await fetch(`/api/streamers/${pendingDelete.id}`, { method: "DELETE" })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? "删除失败")
      toast.success(`已删除「${pendingDelete.name}」`)
      void loadStreamers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败")
    } finally {
      setPendingDelete(null)
    }
  }

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const json = (await res.json()) as { authed?: boolean; error?: string }
      if (!res.ok || !json.authed) throw new Error(json.error ?? "登录失败")
      setAuth({ enabled: true, authed: true })
      setPassword("")
      void loadStreamers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登录失败")
    }
  }

  const logout = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => {})
    setAuth({ enabled: true, authed: false })
    setStreamers(null)
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">主播管理</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            添加或移除要监控的直播间，数据每 60 秒采集一次
          </p>
        </div>
        {auth?.enabled && auth.authed && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={logout}>
            <LogOut className="size-3.5" data-icon="inline-start" />
            退出登录
          </Button>
        )}
      </div>

      {auth === null && <Skeleton className="h-40 rounded-xl" />}

      {auth !== null && !auth.authed && (
        <Card className="mx-auto max-w-sm">
          <CardHeader>
            <CardTitle>登录</CardTitle>
            <CardDescription>输入管理密码以管理主播列表</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={login} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-password">密码</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="管理密码"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full">
                登录
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {auth !== null && auth.authed && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>添加主播</CardTitle>
              <CardDescription>
                支持直播间链接或纯房间号
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    setPreview(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void resolve()
                  }}
                  placeholder="https://live.bilibili.com/6"
                />
                <Button variant="outline" onClick={resolve} disabled={resolving}>
                  {resolving && <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />}
                  {!resolving && <Search className="size-3.5" data-icon="inline-start" />}
                  解析
                </Button>
              </div>

              {preview && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <Avatar>
                    {preview.avatar && <AvatarImage src={preview.avatar} alt={preview.name} />}
                    <AvatarFallback>{preview.name.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{preview.name}</span>
                      <LiveBadge liveStatus={preview.liveStatus} />
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      房间号 {preview.shortId ?? preview.roomId}
                      {preview.liveStatus === 1 && ` · ${formatCountCompact(preview.online)} 人在线`}
                    </div>
                  </div>
                  {preview.alreadyMonitored ? (
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      已在监控列表中
                    </span>
                  ) : (
                    <Button size="sm" onClick={add} disabled={adding}>
                      {adding && <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />}
                      添加监控
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>监控列表</CardTitle>
              <CardDescription>
                {streamers === null ? "加载中…" : `共 ${streamers.length} 位主播`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {streamers === null && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              )}
              {streamers !== null && streamers.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  暂无监控主播，先在上方添加一位
                </p>
              )}
              {streamers !== null && streamers.length > 0 && (
                <ul className="divide-y">
                  {streamers.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-2.5">
                      <Avatar>
                        {s.avatar && <AvatarImage src={s.avatar} alt={s.name} />}
                        <AvatarFallback>{s.name.slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{s.name}</span>
                          <LiveBadge liveStatus={s.liveStatus} />
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          房间号 {s.shortId ?? s.roomId}
                          {s.liveStatus === 1 && ` · ${formatCountCompact(s.online)} 人在线`}
                          {" · "}
                          {s.lastFetchedAt ? `更新于 ${formatClock(s.lastFetchedAt)}` : "等待首次采集"}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`删除 ${s.name}`}
                        onClick={() => setPendingDelete(s)}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{pendingDelete?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              将同时删除该主播的全部历史数据，此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { ChartLine, PlusCircle, RefreshCw } from "lucide-react"
import { StreamerCard } from "@/components/streamer-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAdminEnabled } from "@/hooks/use-admin-enabled"
import type { StreamerWithSpark } from "@/lib/types"

export default function HomePage() {
  const [streamers, setStreamers] = useState<StreamerWithSpark[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const adminEnabled = useAdminEnabled()

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch("/api/streamers", { cache: "no-store" })
        if (!res.ok) throw new Error(`加载失败（HTTP ${res.status}）`)
        const json = (await res.json()) as { streamers: StreamerWithSpark[] }
        if (alive) {
          setStreamers(json.streamers)
          setError(null)
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "加载失败")
      }
    }
    void load()
    // 每 60 秒自动刷新在线人数
    const timer = setInterval(() => void load(), 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [reloadKey])

  const retry = useCallback(() => setReloadKey((k) => k + 1), [])

  const liveCount = streamers?.filter((s) => s.liveStatus === 1).length ?? 0

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">监控中的主播</h1>
          {streamers !== null && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              共 {streamers.length} 位主播 · {liveCount} 位直播中
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {adminEnabled === false && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin" />}>
              <PlusCircle className="size-3.5" data-icon="inline-start" />
              添加主播
            </Button>
          )}
          <Button size="sm" nativeButton={false} render={<Link href="/compare?ids=all" />}>
            <ChartLine className="size-3.5" data-icon="inline-start" />
            全部对比
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={retry}>
            <RefreshCw className="size-3.5" data-icon="inline-start" />
            重试
          </Button>
        </div>
      )}

      {!error && streamers === null && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      )}

      {!error && streamers !== null && streamers.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">还没有监控的主播</p>
          {adminEnabled === false && (
            <Button size="sm" nativeButton={false} render={<Link href="/admin" />}>
              <PlusCircle className="size-3.5" data-icon="inline-start" />
              去添加第一位主播
            </Button>
          )}
        </div>
      )}

      {!error && streamers !== null && streamers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {streamers.map((s) => (
            <StreamerCard key={s.id} streamer={s} />
          ))}
        </div>
      )}
    </div>
  )
}

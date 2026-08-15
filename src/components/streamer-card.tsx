"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ExternalLink } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { LiveBadge } from "@/components/live-badge"
import { Sparkline } from "@/components/sparkline"
import { formatClock, formatCountCompact } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { StreamerWithSpark } from "@/lib/types"

/** 涨跌闪烁时长（毫秒），股票式短暂着色后恢复 */
const FLASH_DURATION = 1500

export function StreamerCard({ streamer }: { streamer: StreamerWithSpark }) {
  const roomUrl = `https://live.bilibili.com/${streamer.shortId ?? streamer.roomId}`
  const [flash, setFlash] = useState<"up" | "down" | null>(null)
  const prevOnlineRef = useRef(streamer.online)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 人数变化时按股票习惯着色：涨红、跌绿，短暂闪烁后恢复
  useEffect(() => {
    const prev = prevOnlineRef.current
    if (streamer.online === prev) return
    prevOnlineRef.current = streamer.online
    setFlash(streamer.online > prev ? "up" : "down")
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setFlash(null), FLASH_DURATION)
  }, [streamer.online])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const flashColor =
    flash === "up" ? "text-(--delta-up)" : flash === "down" ? "text-(--delta-down)" : ""

  return (
    <Card className="relative transition-shadow hover:shadow-sm">
      {/* 整卡可点：跳转到单主播对比 */}
      <Link
        href={`/compare?ids=${streamer.id}`}
        className="absolute inset-0 z-0 rounded-xl"
        aria-label={`对比 ${streamer.name} 的在线人数`}
      />
      <CardContent className="pt-4">
        <div className="flex items-center gap-2.5">
          <Avatar>
            {streamer.avatar && <AvatarImage src={streamer.avatar} alt={streamer.name} />}
            <AvatarFallback>{streamer.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{streamer.name}</div>
            <LiveBadge liveStatus={streamer.liveStatus} className="mt-0.5" />
          </div>
          <a
            href={roomUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="在哔哩哔哩打开直播间"
            className="z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-4" />
          </a>
        </div>

        <div className="mt-3 flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-2xl font-semibold tabular-nums transition-colors duration-500",
              flashColor,
            )}
          >
            {formatCountCompact(streamer.online)}
          </span>
          <span className="text-xs text-muted-foreground">在线</span>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {streamer.title || "—"}
        </div>

        <Sparkline
          points={streamer.spark}
          className="mt-3 h-10 w-full text-muted-foreground"
        />

        <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {streamer.lastFetchedAt ? `更新于 ${formatClock(streamer.lastFetchedAt)}` : "等待首次采集"}
          </span>
          <Link
            href={`/compare?ids=${streamer.id}`}
            className="z-10 rounded-md px-1.5 py-0.5 font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            对比 →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

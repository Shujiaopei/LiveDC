"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { ChartLine, ChevronDown, PlusCircle, Settings2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LiveBadge } from "@/components/live-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { slotColor, type ThemeName } from "@/components/color-slots"
import {
  ViewerChart,
  type ChartMode,
  type ChartSeries,
  type LineMode,
  type ScaleMode,
} from "@/components/viewer-chart"
import { formatCountCompact, formatCountFull } from "@/lib/format"
import { useAdminEnabled } from "@/hooks/use-admin-enabled"
import { cn } from "@/lib/utils"
import type { HistorySeries, Streamer } from "@/lib/types"

const RANGES = [
  { value: 1, label: "1 小时" },
  { value: 6, label: "6 小时" },
  { value: 24, label: "24 小时" },
  { value: 72, label: "3 天" },
  { value: 168, label: "7 天" },
]

const MAX_SELECT = 8
const COLOR_STORE_KEY = "livedc-colors"

export function CompareClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const theme: ThemeName = resolvedTheme === "dark" ? "dark" : "light"
  const adminEnabled = useAdminEnabled()

  const [streamers, setStreamers] = useState<Streamer[] | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [rangeHours, setRangeHours] = useState(24)
  const [mode, setMode] = useState<ChartMode>("absolute")
  const [lineMode, setLineMode] = useState<LineMode>("smooth")
  const [scale, setScale] = useState<ScaleMode>("linear")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [data, setData] = useState<HistorySeries[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [colorMap, setColorMap] = useState<Record<number, number>>(() => {
    if (typeof window === "undefined") return {}
    try {
      return JSON.parse(localStorage.getItem(COLOR_STORE_KEY) ?? "{}") as Record<number, number>
    } catch {
      return {}
    }
  })
  const initializedRef = useRef(false)

  /**
   * 为尚未分配槽位的主播分配稳定颜色（颜色跟随主播，不随选择顺序变化）。
   * localStorage 中持久化的槽位可能与当前选择里其他主播撞车（如历史选择组合过），
   * 因此已有槽位先到先得，撞车的重新分配，保证当前选择内颜色不重复。
   */
  const assignSlots = (ids: number[]) => {
    setColorMap((prev) => {
      let changed = false
      const next = { ...prev }
      const used = new Set<number>()
      const owner = new Map<number, number>()
      for (const id of ids) {
        const slot = next[id]
        if (slot !== undefined && !used.has(slot)) {
          used.add(slot)
          owner.set(slot, id)
        }
      }
      for (const id of ids) {
        const slot = next[id]
        if (slot !== undefined && owner.get(slot) === id) continue
        for (let s = 0; s < 8; s++) {
          if (!used.has(s)) {
            next[id] = s
            used.add(s)
            owner.set(s, id)
            changed = true
            break
          }
        }
      }
      if (changed) localStorage.setItem(COLOR_STORE_KEY, JSON.stringify(next))
      return changed ? next : prev
    })
  }

  // 加载主播列表，并从 URL 恢复选择状态
  useEffect(() => {
    let alive = true
    const loadStreamers = async () => {
      try {
        const res = await fetch("/api/streamers", { cache: "no-store" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { streamers: Streamer[] }
        if (!alive) return
        setStreamers(json.streamers)
        if (!initializedRef.current) {
          initializedRef.current = true
          const idsParam = searchParams.get("ids") ?? ""
          const rangeParam = Number(searchParams.get("range"))
          if (RANGES.some((r) => r.value === rangeParam)) setRangeHours(rangeParam)
          const ids =
            idsParam === "all"
              ? json.streamers.map((s) => s.id)
              : idsParam.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0)
          const valid = ids
            .filter((id) => json.streamers.some((s) => s.id === id))
            .slice(0, MAX_SELECT)
          if (valid.length > 0) assignSlots(valid)
          setSelected(valid)
        }
      } catch {
        // 列表加载失败时保持空状态，轮询会重试
      }
    }
    void loadStreamers()
    const timer = setInterval(() => void loadStreamers(), 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedKey = selected.join(",")

  // 拉取所选主播的对比数据，60 秒轮询
  useEffect(() => {
    if (selected.length === 0) return
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`/api/compare?ids=${selectedKey}&hours=${rangeHours}`, {
          cache: "no-store",
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { series: HistorySeries[] }
        if (alive) {
          setData(json.series)
          setError(null)
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "加载失败")
      }
    }
    void load()
    const timer = setInterval(() => void load(), 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [selectedKey, selected.length, rangeHours])

  // 选择与范围回写 URL，方便分享/刷新保持状态
  useEffect(() => {
    if (!initializedRef.current) return
    const params = new URLSearchParams()
    if (selected.length > 0) params.set("ids", selected.join(","))
    params.set("range", String(rangeHours))
    router.replace(`/compare?${params.toString()}`, { scroll: false })
  }, [selected, rangeHours, router])

  const toggle = (id: number) => {
    if (selected.includes(id)) {
      setSelected(selected.filter((x) => x !== id))
      return
    }
    if (selected.length >= MAX_SELECT) {
      toast.warning(`最多同时对比 ${MAX_SELECT} 位主播`)
      return
    }
    assignSlots([...selected, id])
    setSelected([...selected, id])
  }

  const chartSeries: ChartSeries[] = useMemo(() => {
    if (!data) return []
    return data.map((s) => {
      const slot = colorMap[s.streamerId] ?? 0
      const color = slotColor(slot, theme)
      const peak = Math.max(1, s.stats.peak)
      if (mode === "percent") {
        return {
          name: s.name,
          color,
          live: s.liveStatus === 1,
          avatar: s.avatar,
          data: s.points.map((p) => [p.ts, +(p.online / peak * 100).toFixed(2)] as [number, number]),
          formatValue: (v: number) =>
            `${formatCountFull(Math.round((v * peak) / 100))} 人 · ${v.toFixed(1)}%`,
        }
      }
      return {
        name: s.name,
        color,
        live: s.liveStatus === 1,
        avatar: s.avatar,
        data: s.points.map((p) => [p.ts, p.online] as [number, number]),
        formatValue: (v: number) => `${formatCountFull(v)} 人`,
      }
    })
  }, [data, mode, colorMap, theme])

  const noStreamers = streamers !== null && streamers.length === 0

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
      {/* 筛选行：主播选择 + 时间范围 + 图表设置入口 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {streamers === null && <Skeleton className="h-8 w-48 rounded-full" />}
          {streamers?.map((s) => (
            <PickerChip
              key={s.id}
              streamer={s}
              selected={selected.includes(s.id)}
              color={slotColor(colorMap[s.id] ?? 0, theme)}
              onToggle={() => toggle(s.id)}
            />
          ))}
          {noStreamers && (
            <span className="text-sm text-muted-foreground">
              {adminEnabled === false ? (
                <>
                  还没有监控的主播，
                  <Link href="/admin" className="underline underline-offset-2 hover:text-foreground">
                    去添加
                  </Link>
                </>
              ) : (
                "还没有监控的主播"
              )}
            </span>
          )}
          {streamers !== null && streamers.length > 0 && (
            <span className="ml-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (streamers.length === 0) return
                  const ids = streamers.slice(0, MAX_SELECT).map((s) => s.id)
                  assignSlots(ids)
                  setSelected(ids)
                }}
                className="rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                全选
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                清空
              </button>
            </span>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[String(rangeHours)]}
            onValueChange={(v) => {
              const next = Number(v[0])
              if (Number.isInteger(next)) setRangeHours(next)
            }}
          >
            {RANGES.map((r) => (
              <ToggleGroupItem key={r.value} value={String(r.value)}>
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <PopoverTrigger
            className="inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-input bg-transparent px-2.5 text-[0.8rem] font-medium whitespace-nowrap text-muted-foreground transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Settings2 className="size-3.5" />
            图表设置
            <ChevronDown
              className={cn("size-3.5 transition-transform", settingsOpen && "rotate-180")}
            />
          </PopoverTrigger>
        </div>
      </div>
      {/* 图表设置浮窗：数值 / 曲线 / 数轴 */}
      <PopoverContent align="end" sideOffset={6}>
        <div className="flex flex-col gap-2.5">
          <ChartSetting label="数值">
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[mode]}
              onValueChange={(v) => {
                if (v[0] === "absolute" || v[0] === "percent") setMode(v[0])
                // 峰值 % 已按峰值归一化，对数数轴没有意义，切回线性
                if (v[0] === "percent") setScale("linear")
              }}
            >
              <ToggleGroupItem value="absolute">人数</ToggleGroupItem>
              <ToggleGroupItem value="percent">峰值 %</ToggleGroupItem>
            </ToggleGroup>
          </ChartSetting>
          <ChartSetting label="曲线">
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[lineMode]}
              onValueChange={(v) => {
                if (v[0] === "smooth" || v[0] === "straight") setLineMode(v[0])
              }}
            >
              <ToggleGroupItem value="smooth">平滑</ToggleGroupItem>
              <ToggleGroupItem value="straight">直线</ToggleGroupItem>
            </ToggleGroup>
          </ChartSetting>
          <ChartSetting label="数轴">
            <ToggleGroup
              variant="outline"
              size="sm"
              value={[scale]}
              onValueChange={(v) => {
                if (v[0] === "linear" || v[0] === "log") setScale(v[0])
              }}
            >
              <ToggleGroupItem value="linear">线性</ToggleGroupItem>
              <ToggleGroupItem value="log" disabled={mode === "percent"}>
                对数
              </ToggleGroupItem>
            </ToggleGroup>
          </ChartSetting>
        </div>
      </PopoverContent>
      </Popover>

      {/* 图表 */}
      <div className="rounded-xl border bg-card p-4">
        {selected.length === 0 ? (
          <div className="flex h-[440px] flex-col items-center justify-center gap-3 text-center">
            <ChartLine className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">选择上方主播开始对比在线人数</p>
          </div>
        ) : error ? (
          <div className="flex h-[440px] flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">加载失败：{error}</p>
            <button
              type="button"
              onClick={() => setSelected([...selected])}
              className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              重试
            </button>
          </div>
        ) : data === null ? (
          <Skeleton className="h-[440px] w-full rounded-lg" />
        ) : (
          <>
            <ViewerChart
              series={chartSeries}
              hours={rangeHours}
              mode={mode}
              lineMode={lineMode}
              scale={scale}
              className="h-[440px] w-full"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              滚轮或拖动滑块缩放时间轴 · 每 60 秒自动刷新
            </p>
          </>
        )}
      </div>

      {/* 区间统计 */}
      {selected.length > 0 && data !== null && data.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((s) => (
            <SeriesStatsCard
              key={s.streamerId}
              series={s}
              color={slotColor(colorMap[s.streamerId] ?? 0, theme)}
            />
          ))}
        </div>
      )}

      {noStreamers && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">先添加主播，才能开始对比</p>
          {adminEnabled === false && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
            >
              <PlusCircle className="size-3.5" />
              去管理页添加
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function PickerChip({
  streamer,
  selected,
  color,
  onToggle,
}: {
  streamer: Streamer
  selected: boolean
  color: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-sm transition-colors",
        selected
          ? "border-transparent bg-muted ring-2 ring-primary/60"
          : "border-border hover:bg-muted/60",
      )}
    >
      <Avatar size="sm">
        {streamer.avatar && <AvatarImage src={streamer.avatar} alt={streamer.name} />}
        <AvatarFallback>{streamer.name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      {selected && (
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      )}
      <span className="max-w-28 truncate">{streamer.name}</span>
      {streamer.liveStatus === 1 && (
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-(--status-good)" />
      )}
    </button>
  )
}

/** 设置浮窗中的一行：左侧小标签 + 右侧切换组 */
function ChartSetting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function SeriesStatsCard({ series, color }: { series: HistorySeries; color: string }) {
  const items = [
    { label: "当前在线", value: formatCountCompact(series.stats.current) },
    { label: "区间峰值", value: formatCountCompact(series.stats.peak) },
    { label: "平均在线", value: formatCountCompact(series.stats.avg) },
  ]
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate text-sm font-medium">{series.name}</span>
        <LiveBadge liveStatus={series.liveStatus} className="ml-auto" />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1 text-center">
        {items.map((item) => (
          <div key={item.label}>
            <div className="text-base font-semibold tabular-nums">{item.value}</div>
            <div className="text-[11px] text-muted-foreground">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import * as echarts from "echarts/core"
import { LineChart, ScatterChart } from "echarts/charts"
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import { useTheme } from "next-themes"
import { formatCountFull, formatTick } from "@/lib/format"
import { cn } from "@/lib/utils"

echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
])

export interface ChartSeries {
  name: string
  color: string
  /** [时间戳, 绘制值] */
  data: [number, number][]
  /** tooltip 中展示该值的格式化器（如百分比模式下的原始人数） */
  formatValue: (v: number) => string
  /** 是否直播中：曲线末尾显示脉冲点 */
  live?: boolean
  /** 主播头像：曲线起点与 tooltip 中展示 */
  avatar?: string | null
}

export type ChartMode = "absolute" | "percent"

export type LineMode = "smooth" | "straight"

/** 数轴刻度：线性（从 0 起）或对数（log10，展示数量级差异） */
export type ScaleMode = "linear" | "log"

/** 图表 chrome 色（dataviz 明暗两套） */
interface Chrome {
  surface: string
  ink: string
  secondary: string
  muted: string
  grid: string
  baseline: string
  border: string
  filler: string
}

const CHROME: Record<"light" | "dark", Chrome> = {
  light: {
    surface: "#fcfcfb",
    ink: "#0b0b0b",
    secondary: "#52514e",
    muted: "#898781",
    grid: "#e1e0d9",
    baseline: "#c3c2b7",
    border: "rgba(11,11,11,0.10)",
    filler: "rgba(11,11,11,0.06)",
  },
  dark: {
    surface: "#1a1a19",
    ink: "#ffffff",
    secondary: "#c3c2b7",
    muted: "#898781",
    grid: "#2c2c2a",
    baseline: "#383835",
    border: "rgba(255,255,255,0.10)",
    filler: "rgba(255,255,255,0.08)",
  },
}

/**
 * 在折线两端点之间线性插值，返回 hover 时刻该曲线上的值。
 * hover 时间落在该系列数据范围之外时返回 null（该时刻确实没有这条曲线）。
 */
function interpolateAt(data: [number, number][], time: number): number | null {
  if (data.length === 0) return null
  if (time < data[0][0] || time > data[data.length - 1][0]) return null
  let lo = 0
  let hi = data.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (data[mid][0] <= time) lo = mid
    else hi = mid
  }
  if (data[hi][0] === data[lo][0]) return data[lo][1]
  const k = (time - data[lo][0]) / (data[hi][0] - data[lo][0])
  return data[lo][1] + (data[hi][1] - data[lo][1]) * k
}

/** 数据按 ts 升序；判断该系列在当前 dataZoom 可视窗口内是否还有可见点 */
function hasPointInRange(data: [number, number][], from: number, to: number): boolean {
  if (data.length === 0 || to < from) return false
  if (data[0][0] > to || data[data.length - 1][0] < from) return false
  let lo = 0
  let hi = data.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (data[mid][0] < from) lo = mid + 1
    else hi = mid
  }
  return data[lo][0] <= to
}

function buildOption(
  series: ChartSeries[],
  hours: number,
  theme: "light" | "dark",
  mode: ChartMode,
  lineMode: LineMode,
  scale: ScaleMode,
  /** 仅当系列集合变化时重置缩放窗口，避免轮询刷新打断用户缩放 */
  resetZoom: boolean,
): echarts.EChartsCoreOption {
  const c = CHROME[theme]
  const spanMs = hours * 3600_000

  const firstTs = series.find((s) => s.data.length > 0)?.data[0][0]
  const startValue =
    resetZoom && firstTs !== undefined
      ? Math.max(firstTs, Date.now() - Math.min(spanMs, 6 * 3600_000))
      : undefined

  return {
    animation: false,
    backgroundColor: c.surface,
    legend: series.length >= 2
      ? {
          top: 4,
          left: 4,
          icon: "roundRect",
          itemWidth: 16,
          itemHeight: 3,
          itemGap: 16,
          textStyle: { color: c.secondary, fontSize: 12 },
        }
      : undefined,
    grid: {
      left: 4,
      right: 8,
      top: series.length >= 2 ? 36 : 24,
      bottom: 6,
      containLabel: true,
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: c.baseline } },
      axisTick: { show: false },
      axisLabel: {
        color: c.muted,
        fontSize: 11,
        hideOverlap: true,
        formatter: (value: number) => formatTick(value, spanMs),
      },
      splitLine: { show: false },
    },
    yAxis: {
      // 对数轴不设 min（非正数采样点由 echarts 过滤，曲线在断播处断开）
      type: scale === "log" ? "log" : "value",
      ...(scale === "log" ? { logBase: 10 } : { min: 0 }),
      axisLabel: {
        color: c.muted,
        fontSize: 11,
        formatter: (value: number) =>
          mode === "percent" ? `${value}%` : formatCountFull(value),
      },
      splitLine: { lineStyle: { color: c.grid, width: 1 } },
    },
    dataZoom: [
      // 鼠标滚轮/拖动缩放（inside），滑块（slider）拖选区间
      { type: "inside", filterMode: "filter" },
      {
        type: "slider",
        height: 22,
        bottom: 4,
        borderColor: "transparent",
        backgroundColor: "transparent",
        fillerColor: c.filler,
        dataBackground: {
          lineStyle: { color: c.grid, width: 1 },
          areaStyle: { color: "transparent" },
        },
        selectedDataBackground: {
          lineStyle: { color: c.baseline, width: 1 },
          areaStyle: { color: "transparent" },
        },
        handleStyle: { color: c.surface, borderColor: c.baseline, borderWidth: 1 },
        moveHandleStyle: { color: c.baseline },
        moveHandleSize: 4,
        textStyle: { color: c.muted, fontSize: 10 },
        ...(startValue !== undefined ? { startValue } : {}),
      },
    ],
    series: [
      ...series.map((s) => ({
        name: s.name,
        type: "line",
        data: s.data,
        // 折线本身不画点，悬停交点由 DOM 叠加层统一绘制，
        // 保证时间刻度错开的系列也能同时打点。
        symbol: "circle",
        symbolSize: 8,
        showSymbol: false,
        silent: true,
        smooth: lineMode === "smooth" ? 0.3 : false,
        // 颜色显式跟随槽位色，不依赖按索引分配的全局色板
        lineStyle: { color: s.color, width: 2, cap: "round", join: "round" },
        itemStyle: { color: s.color },
      })),
      // 直播中的主播：曲线末尾的实心点（扩散涟漪由 DOM 叠加层绘制，见 ViewerChart）
      ...series
        .filter((s) => s.live && s.data.length > 0)
        .map((s) => ({
          name: s.name, // 与折线同名，图例合并为一项
          type: "scatter",
          silent: true,
          z: 3,
          clip: false, // 点位于绘图区边缘（如数值为峰值）时不被裁剪
          symbol: "circle",
          symbolSize: 8,
          itemStyle: {
            color: s.color,
            // 白色描边：让实心点压在线条/背景上时轮廓清晰
            borderColor: "#ffffff",
            borderWidth: 2,
          },
          data: [s.data[s.data.length - 1]],
        })),
    ],
  }
}

/** 读取当前 dataZoom 缩放窗口（百分比），用于全量替换后恢复 */
function readZoomWindow(
  chart: ReturnType<typeof echarts.init>,
): { start: number; end: number } | null {
  // 首次渲染前 getOption() 返回 undefined
  const opt = chart.getOption() as
    | { dataZoom?: Array<{ start?: number; end?: number } | undefined> }
    | undefined
  const dz = opt?.dataZoom?.find((z) => z && typeof z.start === "number")
  return dz && typeof dz.start === "number" && typeof dz.end === "number"
    ? { start: dz.start, end: dz.end }
    : null
}

type ChartHandle = ReturnType<typeof echarts.init>

interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/** 读取 grid 绘图区的像素范围（含坐标轴标签后仍以实际绘图区为准） */
function getGridRect(
  chart: ChartHandle,
  fallback: { width: number; height: number },
): PixelRect {
  const chartModel = (
    chart as unknown as {
      getModel(): { getComponent(mainType: string, idx?: number): unknown }
    }
  ).getModel()
  const gridModel = chartModel.getComponent("grid", 0) as
    | { coordinateSystem?: { getRect?: () => PixelRect } }
    | undefined
  return gridModel?.coordinateSystem?.getRect?.() ?? {
    x: 0,
    y: 0,
    width: fallback.width,
    height: fallback.height,
  }
}

/** 由绘图区左右像素边界反推出当前可见的时间范围（dataZoom 之后） */
function getVisibleXRange(chart: ChartHandle, grid: PixelRect): [number, number] | null {
  const start = chart.convertFromPixel(
    { xAxisIndex: 0, yAxisIndex: 0 },
    [grid.x, grid.y],
  ) as number[]
  const end = chart.convertFromPixel(
    { xAxisIndex: 0, yAxisIndex: 0 },
    [grid.x + grid.width, grid.y],
  ) as number[]
  if (
    start.length < 1 ||
    end.length < 1 ||
    !Number.isFinite(start[0]) ||
    !Number.isFinite(end[0])
  ) {
    return null
  }
  return [Math.min(start[0], end[0]), Math.max(start[0], end[0])]
}

/** data 按 ts 升序；返回第一个 ts >= value 的下标 */
function lowerBoundTime(data: [number, number][], value: number): number {
  let lo = 0
  let hi = data.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (data[mid][0] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** DOM 叠加层：直播脉冲涟漪 + 曲线起点头像，位置随图表缩放平移更新 */
interface Pulse {
  key: string
  left: number
  top: number
  color: string
}

interface LineStart {
  key: string
  left: number
  top: number
  avatar: string
}

/** 自定义悬浮窗中的一行：按 hover 时刻在曲线上插值 */
interface HoverRow {
  key: string
  name: string
  color: string
  avatar: string | null
  valueText: string
  value: number
  hasData: boolean
  /** 该曲线在 hover 时刻的像素坐标（用于交点圆点） */
  left: number | null
  top: number | null
}

interface HoverState {
  x: number
  y: number
  time: number
  rectWidth: number
  rectHeight: number
  grid: { x: number; y: number; width: number; height: number }
  rows: HoverRow[]
}

export function ViewerChart({
  series,
  hours,
  mode,
  lineMode,
  scale,
  className,
}: {
  series: ChartSeries[]
  hours: number
  mode: ChartMode
  lineMode: LineMode
  scale: ScaleMode
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null)
  const seriesKeyRef = useRef<string>("")
  const seriesRef = useRef<ChartSeries[]>([])
  const hoverRafRef = useRef<number | null>(null)
  const pendingHoverRef = useRef<HoverState | null>(null)
  const [pulses, setPulses] = useState<Pulse[]>([])
  const [starts, setStarts] = useState<LineStart[]>([])
  const [hover, setHover] = useState<HoverState | null>(null)
  const { resolvedTheme } = useTheme()
  const theme: "light" | "dark" = resolvedTheme === "dark" ? "dark" : "light"

  // 悬浮事件以 rAF 合帧，避免 mousemove 高频触发 React 重渲染
  const commitHover = useCallback(() => {
    hoverRafRef.current = null
    setHover(pendingHoverRef.current)
  }, [])

  const scheduleHover = useCallback(
    (next: HoverState | null) => {
      pendingHoverRef.current = next
      if (next === null) {
        if (hoverRafRef.current !== null) {
          cancelAnimationFrame(hoverRafRef.current)
          hoverRafRef.current = null
        }
        setHover(null)
        return
      }
      if (hoverRafRef.current === null) {
        hoverRafRef.current = requestAnimationFrame(commitHover)
      }
    },
    [commitHover],
  )

  const clearHover = useCallback(() => scheduleHover(null), [scheduleHover])

  // 自定义 axis tooltip：ECharts 原生的 axis 吸附只收纳与吸附点同刻的系列，
  // 各系列采样时刻略有错开时，其他曲线会丢 tooltip 行和交点圆点。
  // 这里改为按鼠标所在时刻对每条曲线做插值，所有系列统一展示、统一打点。
  const handleZrMouseMove = useCallback(
    (event: { offsetX?: number; offsetY?: number }) => {
      const chart = chartRef.current
      const el = containerRef.current
      if (!chart || !el) return
      const x = event.offsetX ?? 0
      const y = event.offsetY ?? 0
      if (!chart.containPixel({ gridIndex: 0 }, [x, y])) {
        scheduleHover(null)
        return
      }
      const point = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [x, y]) as number[]
      const time = point?.[0]
      if (!Number.isFinite(time)) {
        scheduleHover(null)
        return
      }
      const rect = el.getBoundingClientRect()
      const grid = getGridRect(chart, rect)
      const visibleRange = getVisibleXRange(chart, grid)
      const rows: HoverRow[] = []
      const legendState = (
        chart.getOption() as {
          legend?: Array<{ selected?: Record<string, boolean> } | undefined>
        }
      ).legend?.[0]?.selected
      seriesRef.current.forEach((s, index) => {
        if (s.data.length === 0) return
        // 图例中已取消勾选的曲线不参与悬浮展示
        if (legendState && legendState[s.name] === false) return
        // 当前缩放窗口内没有数据点的曲线也不展示
        if (visibleRange && !hasPointInRange(s.data, visibleRange[0], visibleRange[1])) return
        const value = interpolateAt(s.data, time)
        let left: number | null = null
        let top: number | null = null
        if (value !== null && Number.isFinite(value)) {
          const px = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [time, value])
          if (px && Number.isFinite(px[0]) && Number.isFinite(px[1])) {
            left = px[0]
            top = px[1]
          }
        }
        rows.push({
          key: `hover-${index}`,
          name: s.name,
          color: s.color,
          avatar: s.avatar ?? null,
          valueText: value === null || !Number.isFinite(value) ? "无数据" : s.formatValue(value),
          value: value ?? 0,
          hasData: value !== null && Number.isFinite(value),
          left,
          top,
        })
      })
      // 有数据的在前，按绘制值降序；无数据（该时刻曲线范围外）的排到最后
      rows.sort((a, b) => Number(b.hasData) - Number(a.hasData) || b.value - a.value)
      scheduleHover({
        x,
        y,
        time,
        rectWidth: rect.width,
        rectHeight: rect.height,
        grid,
        rows,
      })
    },
    [scheduleHover],
  )

  // 把系列端点换算成像素坐标，驱动叠加层：
  // - 直播中的主播：最后一个点作为涟漪圆心
  // - 所有系列：第一个落入可视窗口的点放置头像
  const updateOverlays = useCallback(() => {
    const chart = chartRef.current
    const el = containerRef.current
    if (!chart || !el) return
    const rect = el.getBoundingClientRect()
    const grid = getGridRect(chart, rect)
    const visibleRange = getVisibleXRange(chart, grid)
    const nextPulses: Pulse[] = []
    const nextStarts: LineStart[] = []
    for (const s of seriesRef.current) {
      if (s.data.length === 0) continue
      // 曲线起点头像：只在当前 dataZoom 可见时间范围内找第一个可绘制的点，
      // 避免把窗口外的旧点换算成左边界像素后贴到纵轴上。
      let startIndex = 0
      if (visibleRange) {
        startIndex = lowerBoundTime(s.data, visibleRange[0])
        if (startIndex >= s.data.length || s.data[startIndex][0] > visibleRange[1]) continue
      }
      for (let i = startIndex; i < s.data.length; i++) {
        const p = s.data[i]
        if (visibleRange && p[0] > visibleRange[1]) break
        const px = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, p)
        // 对数轴下 0 值点不可绘制，继续找后面的点，而不是放弃该系列
        if (!px || !Number.isFinite(px[0]) || !Number.isFinite(px[1])) continue
        // 严格落在绘图区内才算“可见起点”，否则头像会贴着纵轴而不是曲线
        if (px[0] < grid.x) continue
        if (px[0] > grid.x + grid.width) break
        if (px[1] < grid.y || px[1] > grid.y + grid.height) continue
        if (s.avatar) {
          nextStarts.push({ key: s.name, left: px[0], top: px[1], avatar: s.avatar })
        }
        break
      }
      // 直播脉冲：最后一个点（同样限定在绘图区内）
      if (!s.live) continue
      const last = s.data[s.data.length - 1]
      const lastPx = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, last)
      if (!lastPx || !Number.isFinite(lastPx[0]) || !Number.isFinite(lastPx[1])) continue
      if (
        lastPx[0] < grid.x - 1 ||
        lastPx[0] > grid.x + grid.width + 1 ||
        lastPx[1] < grid.y - 1 ||
        lastPx[1] > grid.y + grid.height + 1
      ) {
        continue
      }
      nextPulses.push({ key: s.name, left: lastPx[0], top: lastPx[1], color: s.color })
    }
    setPulses(nextPulses)
    setStarts(nextStarts)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = echarts.init(el)
    chartRef.current = chart
    const observer = new ResizeObserver(() => {
      chart.resize()
      updateOverlays()
      clearHover()
    })
    observer.observe(el)
    // 缩放/平移时同步叠加层位置
    const onDataZoom = () => {
      updateOverlays()
      clearHover()
    }
    chart.on("datazoom", onDataZoom)
    chart.getZr().on("mousemove", handleZrMouseMove)
    chart.getZr().on("mouseout", clearHover)
    chart.on("globalout", clearHover)
    return () => {
      observer.disconnect()
      chart.off("datazoom", onDataZoom)
      chart.getZr().off("mousemove", handleZrMouseMove)
      chart.getZr().off("mouseout", clearHover)
      chart.off("globalout", clearHover)
      if (hoverRafRef.current !== null) {
        cancelAnimationFrame(hoverRafRef.current)
        hoverRafRef.current = null
      }
      chart.dispose()
      chartRef.current = null
    }
  }, [updateOverlays, handleZrMouseMove, clearHover])

  // 全量替换（notMerge）：合并模式不会移除已消失的系列，取消勾选后曲线会残留。
  // 替换前记录缩放窗口，替换后恢复，用户缩放不受轮询刷新影响。
  // 仅当系列集合（主播名）变化时才重置为默认窗口。
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    seriesRef.current = series
    clearHover()
    const seriesKey = series.map((s) => s.name).join("|")
    const resetZoom = seriesKey !== seriesKeyRef.current
    seriesKeyRef.current = seriesKey
    const zoom = resetZoom ? null : readZoomWindow(chart)
    chart.setOption(buildOption(series, hours, theme, mode, lineMode, scale, resetZoom), {
      notMerge: true,
    })
    if (zoom) {
      chart.setOption({
        dataZoom: [
          { type: "inside" },
          { type: "slider", start: zoom.start, end: zoom.end },
        ],
      })
    }
    updateOverlays()
  }, [series, hours, theme, mode, lineMode, scale, updateOverlays, clearHover])

  return (
    <div className={cn("relative", className ?? "h-[440px] w-full")}>
      <div ref={containerRef} className="h-full w-full" />
      {starts.map((s) => (
        // eslint-disable-next-line @next/next/no-img-element -- 远端 CDN 头像，无需 next/image 优化
        <img
          key={`start-${s.key}`}
          src={s.avatar}
          alt=""
          aria-hidden
          className="pointer-events-none absolute z-10 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white object-cover"
          style={{ left: s.left, top: s.top }}
        />
      ))}
      {pulses.map((p) => (
        <span
          key={p.key}
          aria-hidden
          className="pointer-events-none absolute z-10 size-7 rounded-full"
          style={{
            left: p.left,
            top: p.top,
            border: `1px solid ${p.color}`,
            animation: "livedc-pulse 2s ease-out infinite",
          }}
        />
      ))}
      {hover && (
        <>
          {/* 悬浮竖线：贯穿绘图区 */}
          <span
            aria-hidden
            className="pointer-events-none absolute z-[5] w-px bg-foreground/40"
            style={{ left: hover.x, top: hover.grid.y, height: hover.grid.height }}
          />
          {/* 每条曲线在同一 hover 时刻的交点 */}
          {hover.rows.map((row) =>
            row.hasData && row.left !== null && row.top !== null ? (
              <span
                key={`dot-${row.key}`}
                aria-hidden
                className="pointer-events-none absolute z-20 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                style={{ left: row.left, top: row.top, backgroundColor: row.color }}
              />
            ) : null,
          )}
          {/* 悬浮窗：所有系列都有数据行（不在时间范围内的显示“无数据”） */}
          <div
            className="pointer-events-none absolute z-30 w-64 rounded-lg border border-border bg-card/95 p-2 text-xs shadow-lg backdrop-blur-sm"
            style={{
              left: Math.min(
                Math.max(4, hover.x + 14),
                Math.max(4, hover.rectWidth - 260 - 4),
              ),
              top: Math.min(
                Math.max(4, hover.y + 16),
                Math.max(4, hover.rectHeight - 40 - hover.rows.length * 26),
              ),
            }}
          >
            <div className="mb-1 font-semibold text-foreground">
              {formatTick(hover.time, hours * 3600_000)}
            </div>
            {hover.rows.map((row) => (
              <div key={row.key} className="flex items-center whitespace-nowrap">
                {row.avatar && (
                  // eslint-disable-next-line @next/next/no-img-element -- 远端 CDN 头像，无需 next/image 优化
                  <img
                    src={row.avatar}
                    alt=""
                    aria-hidden
                    className="mr-1.5 inline-block size-3.5 rounded-full object-cover"
                  />
                )}
                <span
                  aria-hidden
                  className="mr-1.5 inline-block h-[3px] w-4 shrink-0"
                  style={{ backgroundColor: row.color }}
                />
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {row.valueText}
                </span>
                <span className="ml-1.5 truncate text-muted-foreground">{row.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

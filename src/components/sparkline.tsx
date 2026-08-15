import type { SnapshotPoint } from "@/lib/types"

/** 迷你趋势图：纯 SVG 折线 + 10% 面积填充，随容器宽度伸缩 */
export function Sparkline({
  points,
  className,
}: {
  points: SnapshotPoint[]
  className?: string
}) {
  if (points.length < 2) return null
  const w = 100
  const h = 32
  const pad = 2
  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    if (p.online < min) min = p.online
    if (p.online > max) max = p.online
  }
  const span = max - min || 1
  const step = (w - pad * 2) / (points.length - 1)
  const xy = points.map((p, i) => {
    const x = pad + i * step
    const y = pad + (h - pad * 2) * (1 - (p.online - min) / span)
    return [x, y] as const
  })
  const line = xy
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ")
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${h} L${xy[0][0].toFixed(1)},${h} Z`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <path d={area} fill="currentColor" opacity={0.1} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

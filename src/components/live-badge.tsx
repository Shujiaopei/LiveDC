import { cn } from "@/lib/utils"

/** 直播状态徽标：状态色 + 图标（圆点）+ 文字，不只用颜色表达 */
export function LiveBadge({
  liveStatus,
  className,
}: {
  liveStatus: number
  className?: string
}) {
  const isLive = liveStatus === 1
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        isLive ? "text-(--success-text)" : "text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isLive ? "bg-(--status-good) animate-pulse" : "bg-muted-foreground/50",
        )}
      />
      {isLive ? "直播中" : "未开播"}
    </span>
  )
}

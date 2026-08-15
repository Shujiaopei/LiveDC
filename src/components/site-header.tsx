"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import type { MouseEvent } from "react"
import { flushSync } from "react-dom"
import { Activity, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAdminEnabled } from "@/hooks/use-admin-enabled"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "主播列表" },
  { href: "/compare", label: "人数对比" },
  { href: "/admin", label: "管理" },
]

export function SiteHeader() {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const adminEnabled = useAdminEnabled()

  // 设置 ADMIN_PASSWORD 后对外隐藏管理入口；已进入 /admin 时保留，便于管理员导航
  const nav = NAV.filter(
    (item) => item.href !== "/admin" || adminEnabled === false || pathname === "/admin",
  )

  // 主题切换：新主题以圆从按钮位置向外放大铺满（View Transitions API）
  const toggleTheme = (e: MouseEvent<HTMLButtonElement>) => {
    const next = resolvedTheme === "dark" ? "light" : "dark"

    // 不支持 View Transitions 或用户偏好减少动效时，直接切换
    if (
      typeof document.startViewTransition !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setTheme(next)
      return
    }

    // 动画原点：点击坐标；键盘触发（无坐标）时退回按钮中心
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX || rect.left + rect.width / 2
    const y = e.clientY || rect.top + rect.height / 2
    // 半径取原点到最远视口角的距离，保证圆能铺满全屏
    const radius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y),
    )

    const rootStyle = document.documentElement.style
    rootStyle.setProperty("--livedc-theme-x", `${x}px`)
    rootStyle.setProperty("--livedc-theme-y", `${y}px`)
    rootStyle.setProperty("--livedc-theme-radius", `${radius}px`)

    // flushSync 让主题类在快照前同步落盘，否则新旧快照相同、动画不可见
    document.startViewTransition(() => {
      flushSync(() => setTheme(next))
    })
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="size-4" />
          </span>
          <span>LiveDC</span>
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
            B站直播间人数监控
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                pathname === item.href
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="切换主题"
            onClick={toggleTheme}
          >
            <Sun className="size-4 dark:hidden" />
            <Moon className="hidden size-4 dark:block" />
          </Button>
        </div>
      </div>
    </header>
  )
}

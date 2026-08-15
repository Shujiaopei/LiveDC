import Link from "next/link"

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-2 px-4 py-6 text-xs leading-relaxed text-muted-foreground">
        <p>
          免责声明：本站为个人学习与技术演示项目，所有直播数据均来自哔哩哔哩公开信息，仅供个人参考，不保证数据的准确性、完整性与实时性；相关数据与内容版权归哔哩哔哩及对应主播所有。
          <br />
          请勿将本站用于任何商业用途。
        </p>
        <p>
          <Link
            href="https://github.com/Shujiaopei/LiveDC"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            LiveDC
          </Link>
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          本站全部代码均由 DeepSeek 生成
        </p>
      </div>
    </footer>
  )
}

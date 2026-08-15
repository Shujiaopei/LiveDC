import type { Metadata } from "next"
import { Suspense } from "react"
import { CompareClient } from "@/components/compare-client"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "人数对比 · LiveDC",
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[440px] w-full rounded-xl" />
        </div>
      }
    >
      <CompareClient />
    </Suspense>
  )
}

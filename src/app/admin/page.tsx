import type { Metadata } from "next"
import { AdminClient } from "@/components/admin-client"

export const metadata: Metadata = {
  title: "管理 · LiveDC",
}

export default function AdminPage() {
  return <AdminClient />
}

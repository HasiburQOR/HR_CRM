import api from "@/lib/axios"
import type { ApiResponse, DashboardStats } from "@/types"

export const dashboardService = {
  async getStats(): Promise<DashboardStats> {
    const res = await api.get<ApiResponse<DashboardStats>>("/dashboard/summary")
    return res.data.data
  },
}

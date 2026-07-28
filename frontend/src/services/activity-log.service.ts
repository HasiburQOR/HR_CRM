import api from "@/lib/axios"
import type { ActivityLog } from "@/types"

export interface ActivityLogListResponse {
  data: ActivityLog[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export const activityLogService = {
  async getAll(params: {
    skip?: number
    limit?: number
    date_from?: string
    date_to?: string
  } = {}): Promise<ActivityLogListResponse> {
    const res = await api.get<ActivityLogListResponse>("/activity-logs", { params })
    return res.data as unknown as ActivityLogListResponse
  },

  async getById(id: string): Promise<ActivityLog> {
    const res = await api.get(`/activity-logs/${id}`)
    return (res.data as any).data
  },
}

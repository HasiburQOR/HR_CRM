import api from "@/lib/axios"
import type { ApiResponse, Setting } from "@/types"

export interface SettingListResponse {
  data: Setting[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export const settingsService = {
  async getAll(params: { skip?: number; limit?: number } = {}): Promise<SettingListResponse> {
    const res = await api.get<SettingListResponse>("/settings", { params })
    return res.data as unknown as SettingListResponse
  },

  async getByKey(key: string): Promise<Setting | null> {
    const res = await api.get<ApiResponse<Setting | null>>(`/settings/by-key/${key}`)
    return res.data.data
  },

  async getById(id: string): Promise<Setting> {
    const res = await api.get<ApiResponse<Setting>>(`/settings/${id}`)
    return res.data.data
  },

  async create(data: Partial<Setting>): Promise<Setting> {
    const res = await api.post<ApiResponse<Setting>>("/settings", data)
    return res.data.data
  },

  async update(id: string, data: Partial<Setting>): Promise<Setting> {
    const res = await api.put<ApiResponse<Setting>>(`/settings/${id}`, data)
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/settings/${id}`)
  },
}

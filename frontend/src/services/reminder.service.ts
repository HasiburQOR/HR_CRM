import api from "@/lib/axios"
import type { ApiResponse, Reminder } from "@/types"

export interface ReminderListResponse {
  data: Reminder[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export const reminderService = {
  async getAll(params: { skip?: number; limit?: number } = {}): Promise<ReminderListResponse> {
    const res = await api.get<ReminderListResponse>("/reminders", { params })
    return res.data as unknown as ReminderListResponse
  },

  async getById(id: string): Promise<Reminder | null> {
    const res = await api.get<ApiResponse<Reminder | null>>(`/reminders/${id}`)
    return res.data.data
  },

  async create(data: Partial<Reminder>): Promise<Reminder> {
    const res = await api.post<ApiResponse<Reminder>>("/reminders", data)
    return res.data.data
  },

  async update(id: string, data: Partial<Reminder>): Promise<Reminder | null> {
    const res = await api.put<ApiResponse<Reminder | null>>(`/reminders/${id}`, data)
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/reminders/${id}`)
  },

  async toggle(id: string): Promise<Reminder> {
    const res = await api.post<ApiResponse<Reminder>>(`/reminders/${id}/toggle`)
    return res.data.data
  },
}

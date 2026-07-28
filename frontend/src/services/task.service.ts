import api from "@/lib/axios"
import type { ApiResponse, Task } from "@/types"

export interface TaskListResponse {
  data: Task[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export const taskService = {
  async getAll(params: { skip?: number; limit?: number } = {}): Promise<TaskListResponse> {
    const res = await api.get<TaskListResponse>("/tasks", { params })
    return res.data as unknown as TaskListResponse
  },

  async getById(id: string): Promise<Task> {
    const res = await api.get<ApiResponse<Task>>(`/tasks/${id}`)
    return res.data.data
  },

  async create(data: Partial<Task>): Promise<Task> {
    const res = await api.post<ApiResponse<Task>>("/tasks", data)
    return res.data.data
  },

  async update(id: string, data: Partial<Task>): Promise<Task> {
    const res = await api.put<ApiResponse<Task>>(`/tasks/${id}`, data)
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/tasks/${id}`)
  },
}

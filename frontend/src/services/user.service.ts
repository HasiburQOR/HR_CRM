import api from "@/lib/axios"
import type { ApiResponse, User } from "@/types"

export interface UserListResponse {
  data: User[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export const userService = {
  async getAll(params: { skip?: number; limit?: number } = {}): Promise<UserListResponse> {
    const res = await api.get<UserListResponse>("/users", { params })
    return res.data as unknown as UserListResponse
  },

  async getById(id: string): Promise<User> {
    const res = await api.get<ApiResponse<User>>(`/users/${id}`)
    return res.data.data
  },

  async create(data: {
    username: string
    email: string
    password: string
    full_name?: string
    role_id?: string
    employee_id?: string
  }): Promise<User> {
    const res = await api.post<ApiResponse<User>>("/users", data, {
      params: data.employee_id ? { employee_id: data.employee_id } : undefined,
    })
    return res.data.data
  },

  async update(
    id: string,
    data: {
      username?: string
      email?: string
      password?: string
      full_name?: string
      is_active?: boolean
      is_superuser?: boolean
      role_id?: string
      employee_id?: string
    }
  ): Promise<User> {
    const res = await api.put<ApiResponse<User>>(`/users/${id}`, data, {
      params: data.employee_id ? { employee_id: data.employee_id } : undefined,
    })
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/users/${id}`)
  },
}

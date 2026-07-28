import api from "@/lib/axios"
import type { ApiResponse, Salary } from "@/types"

export interface SalaryListResponse {
  data: Salary[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export const salaryService = {
  async getAll(params: {
    skip?: number
    limit?: number
    month?: string
    year?: number
    employee_id?: string
  } = {}): Promise<SalaryListResponse> {
    const res = await api.get<SalaryListResponse>("/salaries", { params })
    return res.data as unknown as SalaryListResponse
  },

  async getById(id: string): Promise<Salary> {
    const res = await api.get<ApiResponse<Salary>>(`/salaries/${id}`)
    return res.data.data
  },

  async create(data: Partial<Salary>): Promise<Salary> {
    const res = await api.post<ApiResponse<Salary>>("/salaries", data)
    return res.data.data
  },

  async update(id: string, data: Partial<Salary>): Promise<Salary> {
    const res = await api.put<ApiResponse<Salary>>(`/salaries/${id}`, data)
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/salaries/${id}`)
  },

  async approve(id: string): Promise<Salary> {
    const res = await api.post<ApiResponse<Salary>>(`/salaries/${id}/approve`)
    return res.data.data
  },

  async pay(id: string): Promise<Salary> {
    const res = await api.post<ApiResponse<Salary>>(`/salaries/${id}/pay`)
    return res.data.data
  },
}

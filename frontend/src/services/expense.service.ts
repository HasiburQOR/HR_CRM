import api from "@/lib/axios"
import type { ApiResponse, Expense } from "@/types"

export interface ExpenseListResponse {
  data: Expense[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export const expenseService = {
  async getAll(params: {
    skip?: number
    limit?: number
    status?: string
    employee_id?: string
  } = {}): Promise<ExpenseListResponse> {
    const res = await api.get<ExpenseListResponse>("/expenses", { params })
    return res.data as unknown as ExpenseListResponse
  },

  async getPending(): Promise<Expense[]> {
    const res = await api.get<ApiResponse<Expense[]>>("/expenses/pending")
    return res.data.data
  },

  async getById(id: string): Promise<Expense> {
    const res = await api.get<ApiResponse<Expense>>(`/expenses/${id}`)
    return res.data.data
  },

  async create(data: Partial<Expense>): Promise<Expense> {
    const res = await api.post<ApiResponse<Expense>>("/expenses", data)
    return res.data.data
  },

  async update(id: string, data: Partial<Expense>): Promise<Expense> {
    const res = await api.put<ApiResponse<Expense>>(`/expenses/${id}`, data)
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/expenses/${id}`)
  },

  async approve(id: string, notes?: string): Promise<Expense> {
    const res = await api.post<ApiResponse<Expense>>(`/expenses/${id}/approve`, { notes })
    return res.data.data
  },

  async reject(id: string, notes?: string): Promise<Expense> {
    const res = await api.post<ApiResponse<Expense>>(`/expenses/${id}/reject`, { notes })
    return res.data.data
  },
}

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

  async downloadTemplate(): Promise<Blob> {
    const res = await api.get("/expenses/template", { responseType: "blob" })
    return res.data as unknown as Blob
  },

  async importExcel(file: File): Promise<{ imported_rows: number; title: string }> {
    const form = new FormData()
    form.append("file", file)
    const res = await api.post("/expenses/import-excel", form)
    return {
      imported_rows: (res.data as any).imported_rows ?? 0,
      title: (res.data as any).title ?? "Expense Ledger",
    }
  },

  async downloadExcel(params?: {
    category?: string
    employee_id?: string
    start_date?: string
    end_date?: string
  }): Promise<Blob> {
    const res = await api.get("/expenses/download-excel", { params, responseType: "blob" })
    return res.data as unknown as Blob
  },
}

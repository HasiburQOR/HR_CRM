import api from "@/lib/axios"
import type { ApiResponse, InventoryItem } from "@/types"

export interface InventoryListResponse {
  data: InventoryItem[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface InventoryStats {
  total_items: number
  total_units: number
  total_value: number
  assigned_count: number
  in_stock: number
  low_stock: number
  by_category: Array<{ category: string; count: number; value: number }>
  [key: string]: any
}

export interface InventoryListParams {
  skip?: number
  limit?: number
  search?: string
  category?: string
  item_type?: string
  status?: string
  employee_id?: string
  assigned?: boolean
  low_stock?: boolean
}

export const inventoryService = {
  async getAll(params: InventoryListParams = {}): Promise<InventoryListResponse> {
    const res = await api.get<InventoryListResponse>("/inventory", { params })
    return res.data as unknown as InventoryListResponse
  },

  async getStats(): Promise<InventoryStats> {
    const res = await api.get<ApiResponse<InventoryStats>>("/inventory/stats")
    return res.data.data
  },

  async getCategories(): Promise<string[]> {
    const res = await api.get<ApiResponse<string[]>>("/inventory/categories")
    return res.data.data
  },

  async getById(id: string): Promise<InventoryItem> {
    const res = await api.get<ApiResponse<InventoryItem>>(`/inventory/${id}`)
    return res.data.data
  },

  async create(data: Partial<InventoryItem>): Promise<InventoryItem> {
    const res = await api.post<ApiResponse<InventoryItem>>("/inventory", data)
    return res.data.data
  },

  async update(id: string, data: Partial<InventoryItem>): Promise<InventoryItem> {
    const res = await api.put<ApiResponse<InventoryItem>>(`/inventory/${id}`, data)
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/inventory/${id}`)
  },

  async assign(id: string, data: { employee_id: string; assignment_notes?: string }): Promise<InventoryItem> {
    const res = await api.post<ApiResponse<InventoryItem>>(`/inventory/${id}/assign`, data)
    return res.data.data
  },

  async unassign(id: string): Promise<InventoryItem> {
    const res = await api.post<ApiResponse<InventoryItem>>(`/inventory/${id}/unassign`)
    return res.data.data
  },

  async exportExcel(params: InventoryListParams = {}): Promise<Blob> {
    const res = await api.get("/inventory/export", { params, responseType: "blob" })
    return res.data
  },
}

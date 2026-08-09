import api from "@/lib/axios"
import type { ApiResponse, Requisition, RequisitionExpense } from "@/types"

export const requisitionService = {
  async getAll(): Promise<Requisition[]> {
    const res = await api.get<ApiResponse<Requisition[]>>("/requisitions")
    return res.data.data
  },

  async getById(id: string): Promise<Requisition> {
    const res = await api.get<ApiResponse<Requisition>>(`/requisitions/${id}`)
    return res.data.data
  },

  async create(title: string): Promise<Requisition> {
    const form = new FormData()
    form.append("title", title)
    const res = await api.post<ApiResponse<Requisition>>("/requisitions", form)
    return res.data.data
  },

  async close(id: string): Promise<Requisition> {
    const res = await api.put<ApiResponse<Requisition>>(`/requisitions/${id}/close`)
    return res.data.data
  },

  async reopen(id: string): Promise<Requisition> {
    const res = await api.put<ApiResponse<Requisition>>(`/requisitions/${id}/reopen`)
    return res.data.data
  },

  async update(id: string, title: string): Promise<Requisition> {
    const form = new FormData()
    form.append("title", title)
    const res = await api.put<ApiResponse<Requisition>>(`/requisitions/${id}`, form)
    return res.data.data
  },

  async approveExpense(reqId: string, expId: string): Promise<RequisitionExpense> {
    const res = await api.post<ApiResponse<RequisitionExpense>>(
      `/requisitions/${reqId}/expenses/${expId}/approve`
    )
    return res.data.data
  },

  async rejectExpense(reqId: string, expId: string): Promise<RequisitionExpense> {
    const res = await api.post<ApiResponse<RequisitionExpense>>(
      `/requisitions/${reqId}/expenses/${expId}/reject`
    )
    return res.data.data
  },

  async addExpense(
    reqId: string,
    data: { note?: string; amount: number; expense_date?: string; receipt?: File }
  ): Promise<RequisitionExpense> {
    const form = new FormData()
    if (data.note) form.append("note", data.note)
    form.append("amount", String(data.amount))
    if (data.expense_date) form.append("expense_date", data.expense_date)
    if (data.receipt) form.append("receipt", data.receipt)
    const res = await api.post<ApiResponse<RequisitionExpense>>(
      `/requisitions/${reqId}/expenses`,
      form
    )
    return res.data.data
  },

  async downloadSingle(id: string): Promise<Blob> {
    const res = await api.get(`/requisitions/${id}/download`, { responseType: "blob" })
    return res.data as unknown as Blob
  },

  async downloadBulk(ids: string[]): Promise<Blob> {
    const res = await api.post("/requisitions/download-bulk", { ids }, {
      responseType: "blob",
    })
    return res.data as unknown as Blob
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/requisitions/${id}`)
  },
}
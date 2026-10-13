import api from "@/lib/axios"
import type { ApiResponse, LeaveAttachment, LeaveRequest } from "@/types"

export interface LeaveListResponse {
  data: LeaveRequest[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export const leaveService = {
  async getAll(params: { skip?: number; limit?: number; status?: string } = {}): Promise<LeaveListResponse> {
    const res = await api.get<LeaveListResponse>("/leaves", { params })
    return res.data as unknown as LeaveListResponse
  },

  async getPending(): Promise<LeaveRequest[]> {
    const res = await api.get<ApiResponse<LeaveRequest[]>>("/leaves/pending")
    return res.data.data
  },

  async getById(id: string): Promise<LeaveRequest> {
    const res = await api.get<ApiResponse<LeaveRequest>>(`/leaves/${id}`)
    return res.data.data
  },

  async create(data: Partial<LeaveRequest>): Promise<LeaveRequest> {
    const res = await api.post<ApiResponse<LeaveRequest>>("/leaves", data)
    return res.data.data
  },

  async update(id: string, data: Partial<LeaveRequest>): Promise<LeaveRequest> {
    const res = await api.put<ApiResponse<LeaveRequest>>(`/leaves/${id}`, data)
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/leaves/${id}`)
  },

  async approve(id: string): Promise<LeaveRequest> {
    const res = await api.post<ApiResponse<LeaveRequest>>(`/leaves/${id}/approve`)
    return res.data.data
  },

  async reject(id: string): Promise<LeaveRequest> {
    const res = await api.post<ApiResponse<LeaveRequest>>(`/leaves/${id}/reject`)
    return res.data.data
  },

  async uploadAttachment(id: string, file: File): Promise<LeaveAttachment> {
    const fd = new FormData()
    fd.append("file", file)
    const res = await api.post<ApiResponse<LeaveAttachment>>(`/leaves/${id}/attachments`, fd, { timeout: 120000 })
    return res.data.data
  },

  // Documents need the auth header, so they are fetched as blobs rather than linked directly.
  async getAttachmentBlob(id: string, attachmentId: string): Promise<Blob> {
    const res = await api.get(`/leaves/${id}/attachments/${attachmentId}`, { responseType: "blob", timeout: 120000 })
    return res.data as Blob
  },

  async deleteAttachment(id: string, attachmentId: string): Promise<void> {
    await api.delete(`/leaves/${id}/attachments/${attachmentId}`)
  },
}

import api from "@/lib/axios"
import type { ApiResponse, Backup } from "@/types"

export interface BackupListResponse {
  data: Backup[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export const backupService = {
  async getAll(params: { skip?: number; limit?: number } = {}): Promise<BackupListResponse> {
    const res = await api.get<BackupListResponse>("/backups", { params })
    return res.data as unknown as BackupListResponse
  },

  async getById(id: string): Promise<Backup> {
    const res = await api.get<ApiResponse<Backup>>(`/backups/${id}`)
    return res.data.data
  },

  async create(): Promise<Backup> {
    const res = await api.post<ApiResponse<Backup>>("/backups")
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/backups/${id}`)
  },

  async restore(id: string): Promise<void> {
    await api.post(`/backups/${id}/restore`)
  },

  async download(id: string): Promise<void> {
    const res = await api.get(`/backups/${id}/download`, { responseType: "blob" })
    const disposition = res.headers["content-disposition"] || ""
    const nameMatch = disposition.match(/filename="?([^";]+)"?/)
    const filename = nameMatch ? nameMatch[1] : `backup_${id}.db`
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },

  async importAndRestore(file: File): Promise<Backup> {
    const formData = new FormData()
    formData.append("file", file)
    const res = await api.post<ApiResponse<Backup>>("/backups/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return res.data.data
  },
}

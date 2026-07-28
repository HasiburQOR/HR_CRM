import api from "@/lib/axios"
import type { ApiResponse, Attendance } from "@/types"

export interface AttendanceListResponse {
  data: Attendance[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface AttendanceCreateInput {
  employee_id: string
  date: string
  check_in?: string
  check_out?: string
  status?: string
  notes?: string
  lunch_taken?: boolean
  lunch_included?: boolean
}

export const attendanceService = {
  async getAll(params: {
    skip?: number
    limit?: number
    employee_id?: string
    date_from?: string
    date_to?: string
    status?: string
  } = {}): Promise<AttendanceListResponse> {
    const res = await api.get<AttendanceListResponse>("/attendances", { params })
    return res.data as unknown as AttendanceListResponse
  },

  async getById(id: string): Promise<Attendance> {
    const res = await api.get<ApiResponse<Attendance>>(`/attendances/${id}`)
    return res.data.data
  },

  async create(data: AttendanceCreateInput): Promise<Attendance> {
    const res = await api.post<ApiResponse<Attendance>>("/attendances", data)
    return res.data.data
  },

  async update(id: string, data: Partial<AttendanceCreateInput>): Promise<Attendance> {
    const res = await api.put<ApiResponse<Attendance>>(`/attendances/${id}`, data)
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/attendances/${id}`)
  },

  async approve(id: string): Promise<Attendance> {
    const res = await api.post<ApiResponse<Attendance>>(`/attendances/${id}/approve`)
    return res.data.data
  },

  async reject(id: string): Promise<Attendance> {
    const res = await api.post<ApiResponse<Attendance>>(`/attendances/${id}/reject`)
    return res.data.data
  },

  async checkIn(data: {
    employee_id: string
    date?: string
    check_in?: string
    lunch_included?: boolean
    notes?: string
  }): Promise<Attendance> {
    const res = await api.post<ApiResponse<Attendance>>("/attendances/actions/check-in", data)
    return res.data.data
  },

  async checkOut(data: {
    employee_id: string
    date?: string
    check_out?: string
    notes?: string
  }): Promise<Attendance> {
    const res = await api.post<ApiResponse<Attendance>>("/attendances/actions/check-out", data)
    return res.data.data
  },
}

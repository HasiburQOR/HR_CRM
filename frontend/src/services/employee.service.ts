import api from "@/lib/axios"
import type { ApiResponse, Employee, PaginationParams } from "@/types"

export interface EmployeeListResponse {
  data: Employee[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export const employeeService = {
  async getAll(params: PaginationParams & { search?: string } = {}): Promise<EmployeeListResponse> {
    const { skip = 0, limit = 100, search } = params
    const res = await api.get<EmployeeListResponse>("/employees", {
      params: { skip, limit, search },
    })
    if ("data" in res.data && Array.isArray((res.data as any).data)) {
      return res.data as unknown as EmployeeListResponse
    }
    return res.data as unknown as EmployeeListResponse
  },

  async getActive(): Promise<Employee[]> {
    const res = await api.get<ApiResponse<Employee[]>>("/employees/active")
    return res.data.data
  },

  async getById(id: string): Promise<Employee> {
    const res = await api.get<ApiResponse<Employee>>(`/employees/${id}`)
    return res.data.data
  },

  async nextEmployeeId(): Promise<string> {
    const res = await api.get<ApiResponse<{ employee_id: string }>>("/employees/next/employee_id")
    return res.data.data.employee_id
  },

  async create(data: Partial<Employee>): Promise<Employee> {
    const res = await api.post<ApiResponse<Employee>>("/employees", data)
    return res.data.data
  },

  async update(id: string, data: Partial<Employee>): Promise<Employee> {
    const res = await api.put<ApiResponse<Employee>>(`/employees/${id}`, data)
    return res.data.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/employees/${id}`)
  },
}

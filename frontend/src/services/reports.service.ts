import api from "@/lib/axios"

export type PeriodMode = "all" | "day" | "month" | "year" | "range"

export interface ReportFilterParams {
  period?: PeriodMode
  period_value?: string
  date?: string
  start_date?: string
  end_date?: string
  month?: string
  year?: number
  employee_id?: string
}

export const reportsService = {
  async downloadEmployees(params: ReportFilterParams = {}): Promise<Blob> {
    const res = await api.get("/reports/employees", { params, responseType: "blob" })
    return res.data
  },

  async downloadAttendance(params: ReportFilterParams = {}): Promise<Blob> {
    const res = await api.get("/reports/attendance", { params, responseType: "blob" })
    return res.data
  },

  async downloadSalary(params: ReportFilterParams = {}): Promise<Blob> {
    const res = await api.get("/reports/salary", { params, responseType: "blob" })
    return res.data
  },

  async downloadExpenses(params: ReportFilterParams = {}): Promise<Blob> {
    const res = await api.get("/reports/expenses", { params, responseType: "blob" })
    return res.data
  },

  async downloadRequisitions(params: ReportFilterParams = {}): Promise<Blob> {
    const res = await api.get("/reports/requisitions", { params, responseType: "blob" })
    return res.data
  },

  async downloadInventory(params: {
    category?: string
    item_type?: string
    status?: string
    employee_id?: string
    assigned?: boolean
    low_stock?: boolean
  } = {}): Promise<Blob> {
    const res = await api.get("/reports/inventory", { params, responseType: "blob" })
    return res.data
  },

  async downloadLunch(params: ReportFilterParams = {}): Promise<Blob> {
    const res = await api.get("/reports/lunch", { params, responseType: "blob" })
    return res.data
  },

  async downloadEmployeeIndividual(employeeId: string): Promise<Blob> {
    const res = await api.get(`/reports/employee/${employeeId}`, { responseType: "blob" })
    return res.data
  },
}

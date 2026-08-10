export interface User {
  id: string
  username: string
  email?: string | null
  full_name?: string | null
  role?: string | null
  role_id?: string | null
  role_name?: string | null
  employee_id?: string | null
  employee_name?: string | null
  employee?: any
  is_active?: boolean
  is_superuser?: boolean
  created_at?: string | null
  updated_at?: string | null
  [key: string]: any
}

export interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  login: (credentials: { username?: string; email?: string; employee_id?: string; password: string }) => Promise<void>
  logout: () => void
  loading: boolean
}

export interface Role {
  id: string
  name: string
  permissions?: string | Record<string, any> | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: any
}

export interface Employee {
  id: string
  user_id?: string | null
  employee_id: string
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  email?: string | null
  phone?: string | null
  nid?: string | null
  designation?: string | null
  job_title?: string | null
  department?: string | null
  date_of_joining?: string | null
  hire_date?: string | null
  date_of_birth?: string | null
  address?: string | null
  salary?: number
  status?: string | null
  user?: any
  created_at?: string | null
  updated_at?: string | null
  deleted_at?: string | null
  [key: string]: any
}

export interface Attendance {
  id: string
  employee_id: string
  employee_name?: string
  date?: string
  check_in?: string | null
  check_out?: string | null
  status?: string
  lunch_taken?: boolean
  notes?: string | null
  approved_by?: string | null
  rejected_by?: string | null
  lunch_break_start?: string | null
  lunch_break_end?: string | null
  auto_lunch_counted?: boolean
  hours_worked?: number | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: any
}

export interface Salary {
  id: string
  employee_id: string
  employee_name?: string
  month?: string
  year?: number
  gross_salary?: number
  basic_salary?: number
  allowances?: number
  deductions?: number
  working_days?: number
  days_attended?: number
  per_day_rate?: number
  net_salary?: number
  payment_date?: string | null
  status?: string
  notes?: string | null
  approved_by?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: any
}

export interface LeaveRequest {
  id: string
  employee_id: string
  employee_name?: string
  leave_type?: string
  start_date?: string
  end_date?: string
  reason?: string | null
  status?: string
  approved_by?: string | null
  rejection_reason?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: any
}

export interface Task {
  id: string
  title: string
  description?: string | null
  assigned_to?: string | null
  assigned_to_name?: string | null
  assigned_to_employee_id?: string | null
  assigned_by?: string | null
  assigned_by_name?: string | null
  due_date?: string | null
  priority?: string
  status?: string
  deleted_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: any
}

export interface Reminder {
  id: string
  user_id?: string | null
  title: string
  description?: string | null
  note?: string | null
  message?: string | null
  reminder_date?: string | null
  reminder_time?: string | null
  reminder_datetime?: string | null
  is_completed?: boolean
  is_sent?: boolean
  status?: string
  created_at?: string | null
  updated_at?: string | null
  [key: string]: any
}

export interface Backup {
  id: string
  filename?: string
  file_name?: string
  filepath?: string | null
  size?: number
  file_size?: number
  created_by?: string | null
  created_at?: string | null
  status?: string | null
  [key: string]: any
}

export interface ActivityLog {
  id: string
  username?: string
  user_name?: string
  full_name?: string
  account_id?: string
  user_id?: string | null
  employee_name?: string
  employee_id?: string
  action?: string
  resource_type?: string
  entity_type?: string
  entity_id?: string | null
  resource_id?: string | null
  details?: string | Record<string, any> | any
  ip_address?: string
  timestamp?: string | null
  created_at?: string | null
  [key: string]: any
}

export interface Setting {
  id: string
  key: string
  value: string
  description?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: any
}

export interface Expense {
  id: string
  employee_id?: string | null
  employee_name?: string
  product_name?: string | null
  category?: string
  amount?: number
  description?: string | null
  expense_date?: string | null
  date?: string | null
  receipt_url?: string | null
  status?: string
  approved_by?: string | null
  rejected_by?: string | null
  approval_notes?: string | null
  created_at?: string | null
  updated_at?: string | null
  deleted_at?: string | null
  [key: string]: any
}

export interface RequisitionExpense {
  id: string
  requisition_id: string
  expense_date?: string | null
  notes?: string | null
  amount: number
  receipt_url?: string | null
  vendor?: string | null
  department?: string | null
  qty?: string | null
  status?: string
  approved_by?: string | null
  rejected_by?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: any
}

export interface Requisition {
  id: string
  title: string
  status: string
  created_at?: string | null
  closed_at?: string | null
  duration_days?: number | null
  address?: string | null
  period?: string | null
  ledger_date?: string | null
  expenses?: RequisitionExpense[]
  [key: string]: any
}

export interface InventoryItem {
  id: string
  item_code: string
  name: string
  category: string
  sub_category?: string | null
  description?: string | null
  item_type: "equipment" | "supplies" | "furniture" | "devices" | "consumable" | "access_card" | "key" | "other" | string
  condition?: string | null
  location?: string | null
  unit_of_measure?: string | null
  quantity: number
  minimum_stock?: number
  unit_cost?: number
  total_cost?: number
  serial_number?: string | null
  model_number?: string | null
  manufacturer?: string | null
  purchase_date?: string | null
  warranty_end_date?: string | null
  employee_id?: string | null
  employee_name?: string | null
  employee_empid?: string | null
  employee_department?: string | null
  assigned_at?: string | null
  assignment_notes?: string | null
  status: string
  created_by?: string | null
  is_low_stock?: boolean
  created_at?: string | null
  updated_at?: string | null
  [key: string]: any
}

export interface DashboardStats {
  total_employees?: number
  active_employees?: number
  present_today?: number
  attendance_today?: number
  lunch_count_today?: number
  pending_leaves?: number
  pending_tasks?: number
  total_users?: number
  pending_expenses?: number
  active_reminders?: number
  monthly_payroll?: number
  inventory_total_items?: number
  inventory_assigned?: number
  inventory_low_stock?: number
  inventory_value?: number
  department_distribution?: Array<{ department: string; count: number; [key: string]: any }>
  attendance_trend?: Array<{ date: string; present: number; absent: number; late: number; [key: string]: any }>
  recent_activities?: Array<{ id: string; action: string; resource: string; username: string; created_at: string; [key: string]: any }>
  pending_reminders_list?: Array<{ id: string; title: string; note?: string; reminder_date?: string; status?: string; created_by_name?: string; created_at?: string; [key: string]: any }>
  [key: string]: any
}

export interface ApiResponse<T = any> {
  success?: boolean
  message?: string
  data: T
  total?: number
  page?: number
  per_page?: number
  perPage?: number
  total_pages?: number
  totalPages?: number
  skip?: number
  limit?: number
}

export interface PaginationParams {
  page?: number
  per_page?: number
  skip?: number
  limit?: number
}

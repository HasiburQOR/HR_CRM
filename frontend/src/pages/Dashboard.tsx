import { useEffect, useState } from "react"
import { Users, CalendarClock, Wallet, CalendarCheck, Check, X, CheckCircle, Banknote, ListTodo, Receipt, CalendarDays, Package, AlertTriangle, UserPlus, UtensilsCrossed, Bell } from "lucide-react"
import { dashboardService } from "@/services/dashboard.service"
import { leaveService } from "@/services/leave.service"
import { expenseService } from "@/services/expense.service"
import { salaryService } from "@/services/salary.service"
import type { DashboardStats } from "@/types"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, formatDate } from "@/lib/utils"

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  className = "",
}: {
  title: string
  value: string | number
  icon: any
  loading: boolean
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const { toast } = useToast()
  const isEmployee = user?.role === "employee"

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      setLoading(true)
      const s = await dashboardService.getStats()
      setStats(s)
    } catch (e: any) {
      toast({
        title: "Failed to load dashboard",
        description: e?.message || "Unknown error",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function refreshOnce() {
    try {
      const s = await dashboardService.getStats()
      setStats(s)
    } catch {}
  }

  async function approveLeave(id: string) {
    try {
      setRefreshing(`leave-${id}`)
      await leaveService.approve(id)
      toast({ title: "Leave approved", variant: "success" })
      await refreshOnce()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" })
    } finally {
      setRefreshing(null)
    }
  }

  async function rejectLeave(id: string) {
    try {
      setRefreshing(`leave-${id}`)
      await leaveService.reject(id)
      toast({ title: "Leave rejected", variant: "destructive" })
      await refreshOnce()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" })
    } finally {
      setRefreshing(null)
    }
  }

  async function approveExpense(id: string) {
    try {
      setRefreshing(`exp-${id}`)
      await expenseService.approve(id)
      toast({ title: "Expense approved", variant: "success" })
      await refreshOnce()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" })
    } finally {
      setRefreshing(null)
    }
  }

  async function rejectExpense(id: string) {
    try {
      setRefreshing(`exp-${id}`)
      await expenseService.reject(id)
      toast({ title: "Expense rejected", variant: "destructive" })
      await refreshOnce()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" })
    } finally {
      setRefreshing(null)
    }
  }

  async function approveSalary(id: string) {
    try {
      setRefreshing(`sal-${id}`)
      await salaryService.approve(id)
      toast({ title: "Salary approved", variant: "success" })
      await refreshOnce()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" })
    } finally {
      setRefreshing(null)
    }
  }

  const leaves: any[] = stats?.pending_leaves_list || []
  const expenses: any[] = stats?.pending_expenses_list || []
  const salaries: any[] = stats?.pending_salaries_list || []
  const tasks: any[] = stats?.pending_tasks_list || []
  const reminders: any[] = stats?.pending_reminders_list || []
  const totalPending = leaves.length + expenses.length + salaries.length + tasks.length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Overview of HR CRM activities and pending requests</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {!isEmployee && (
          <StatCard title="Total Employees" value={stats?.total_employees ?? 0} icon={Users} loading={loading} />
        )}
        <StatCard
          title="Attendance Today"
          value={stats?.attendance_today ?? 0}
          icon={CalendarClock}
          loading={loading}
        />
        <StatCard
          title="Pending Leaves"
          value={stats?.pending_leaves ?? 0}
          icon={CalendarCheck}
          loading={loading}
        />
        {!isEmployee && (
          <StatCard
            title="Monthly Payroll"
            value={formatCurrency(stats?.monthly_payroll ?? 0)}
            icon={Wallet}
            loading={loading}
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {!isEmployee && (
          <StatCard
            title="Total Users"
            value={stats?.total_users ?? 0}
            icon={Users}
            loading={loading}
            className="bg-emerald-50"
          />
        )}
        <StatCard
          title="Pending Tasks"
          value={stats?.pending_tasks ?? 0}
          icon={ListTodo}
          loading={loading}
          className="bg-amber-50"
        />
        {!isEmployee && (
          <>
            <StatCard
              title="Pending Expenses"
              value={stats?.pending_expenses ?? 0}
              icon={Receipt}
              loading={loading}
              className="bg-rose-50"
            />
            <StatCard
              title="Active Reminders"
              value={stats?.active_reminders ?? 0}
              icon={CalendarDays}
              loading={loading}
              className="bg-sky-50"
            />
          </>
        )}
      </div>

      {!isEmployee && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Inventory Items"
            value={stats?.inventory_total_items ?? 0}
            icon={Package}
            loading={loading}
            className="bg-violet-50"
          />
          <StatCard
            title="Inventory Assigned"
            value={stats?.inventory_assigned ?? 0}
            icon={UserPlus}
            loading={loading}
            className="bg-indigo-50"
          />
          <StatCard
            title="Inventory Low Stock"
            value={stats?.inventory_low_stock ?? 0}
            icon={AlertTriangle}
            loading={loading}
            className="bg-amber-50/80"
          />
          <StatCard
            title="Inventory Value"
            value={formatCurrency(stats?.inventory_value ?? 0)}
            icon={Banknote}
            loading={loading}
            className="bg-emerald-50"
          />
          <StatCard
            title="Will Have Lunch Tomorrow"
            value={stats?.lunch_count_today ?? 0}
            icon={UtensilsCrossed}
            loading={loading}
            className="bg-orange-50"
          />
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Pending Requests ({totalPending})</CardTitle>
              <p className="text-sm text-muted-foreground pt-1">Approve or reject items directly from the dashboard</p>
            </div>
            <Badge variant="outline" className="text-xs">
              Pending {totalPending}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs defaultValue="leaves" className="w-full">
            <TabsList className="mb-4 grid grid-cols-5 w-full md:w-auto md:inline-grid md:grid-cols-5">
              <TabsTrigger value="leaves" className="gap-1.5">
                <CalendarCheck className="h-3.5 w-3.5" /> Leaves ({leaves.length})
              </TabsTrigger>
              <TabsTrigger value="expenses" className="gap-1.5">
                <Receipt className="h-3.5 w-3.5" /> Expenses ({expenses.length})
              </TabsTrigger>
              <TabsTrigger value="salaries" className="gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> Salaries ({salaries.length})
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-1.5">
                <ListTodo className="h-3.5 w-3.5" /> Tasks ({tasks.length})
              </TabsTrigger>
              <TabsTrigger value="reminders" className="gap-1.5">
                <Bell className="h-3.5 w-3.5" /> Reminders ({reminders.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="leaves">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead className="max-w-xs truncate">Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : leaves.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No pending leave requests</TableCell></TableRow>
                  ) : leaves.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{r.employee_name || r.employee_empid || r.employee_id?.slice(0, 8) || "—"}</span>
                          {r.employee_name && r.employee_empid && (
                            <span className="text-xs text-muted-foreground font-normal">
                              ID: {r.employee_empid}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">
                        <Badge variant="outline">{r.leave_type || "—"}</Badge>
                      </TableCell>
                      <TableCell>{r.start_date ? formatDate(r.start_date) : "—"}</TableCell>
                      <TableCell>{r.end_date ? formatDate(r.end_date) : "—"}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">{r.reason || "—"}</TableCell>
                      <TableCell className="text-right">
                        {!isEmployee && (
                          <div className="inline-flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={refreshing === `leave-${r.id}`}
                              onClick={() => approveLeave(r.id)}
                            >
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={refreshing === `leave-${r.id}`}
                              onClick={() => rejectLeave(r.id)}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="expenses">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : expenses.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No pending expenses</TableCell></TableRow>
                  ) : expenses.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{r.employee_name || r.employee_empid || r.employee_id?.slice(0, 8) || "—"}</span>
                          {r.employee_name && r.employee_empid && (
                            <span className="text-xs text-muted-foreground font-normal">
                              ID: {r.employee_empid}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize"><Badge variant="outline">{r.category || "other"}</Badge></TableCell>
                      <TableCell>{r.expense_date ? formatDate(r.expense_date) : "—"}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">{r.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono font-medium">{formatCurrency(Number(r.amount) || 0)}</TableCell>
                      <TableCell className="text-right">
                        {!isEmployee && (
                          <div className="inline-flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" disabled={refreshing === `exp-${r.id}`} onClick={() => approveExpense(r.id)}>
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button size="sm" variant="ghost" disabled={refreshing === `exp-${r.id}`} onClick={() => rejectExpense(r.id)}>
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="salaries">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : salaries.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No pending salary records</TableCell></TableRow>
                  ) : salaries.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{r.employee_name || r.employee_empid || r.employee_id?.slice(0, 8) || "—"}</span>
                          {r.employee_name && r.employee_empid && (
                            <span className="text-xs text-muted-foreground font-normal">
                              ID: {r.employee_empid}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{r.month} {r.year}</TableCell>
                      <TableCell className="text-right font-mono font-bold">{formatCurrency(Number(r.net_salary) || 0)}</TableCell>
                      <TableCell><Badge variant="warning" className="capitalize">{r.status || "pending"}</Badge></TableCell>
                      <TableCell className="text-right">
                        {!isEmployee && (
                          <div className="inline-flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" disabled={refreshing === `sal-${r.id}`} onClick={() => approveSalary(r.id)} title="Approve salary">
                              <CheckCircle className="h-4 w-4 text-emerald-600" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="tasks">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Assigned By</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : tasks.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No pending tasks</TableCell></TableRow>
                  ) : tasks.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium max-w-sm truncate">{r.title}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{r.assigned_to_name || r.assigned_to_employee_id || r.assigned_to?.slice(0, 8) || "—"}</span>
                          {r.assigned_to_name && r.assigned_to_employee_id && (
                            <span className="text-xs text-muted-foreground font-normal">
                              ID: {r.assigned_to_employee_id}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-muted-foreground">{r.assigned_by_name || r.assigned_by?.slice(0, 8) || "—"}</span>
                          {r.assigned_by_name && r.assigned_by_employee_id && (
                            <span className="text-xs text-muted-foreground font-normal">
                              ID: {r.assigned_by_employee_id}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.priority === "high" ? "destructive" : r.priority === "medium" ? "warning" : "secondary"} className="capitalize">
                          {r.priority || "normal"}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.due_date ? formatDate(r.due_date) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="reminders">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : reminders.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No pending reminders</TableCell></TableRow>
                  ) : reminders.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.title}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.note || r.description || "—"}</TableCell>
                      <TableCell>{r.reminder_date ? formatDate(r.reminder_date) : "—"}</TableCell>
                      <TableCell>{r.created_by_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="warning">{r.status === "ongoing" ? "Ongoing" : r.status || "Pending"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

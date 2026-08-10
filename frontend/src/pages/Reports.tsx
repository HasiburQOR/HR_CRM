import { useEffect, useMemo, useState } from "react"
import {
  FileSpreadsheet,
  Users,
  CalendarClock,
  Wallet,
  Receipt,
  Download,
  X,
  Settings2,
  FileText,
  UserRound,
  Package,
  UtensilsCrossed,
  ClipboardList,
} from "lucide-react"
import { reportsService, type PeriodMode, type ReportFilterParams } from "@/services/reports.service"
import { employeeService } from "@/services/employee.service"
import type { Employee } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmployeeSelect } from "@/components/EmployeeSelect"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { useToast } from "@/components/ui/useToast"

type ReportKey = "employees" | "attendance" | "salary" | "expenses" | "requisitions" | "inventory" | "lunch"

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

interface DialogState {
  open: boolean
  reportKey: ReportKey | null
  period: PeriodMode
  day: string
  month: string
  year: string
  start_date: string
  end_date: string
  employee_id: string
}

const defaultDialog = (): DialogState => ({
  open: false,
  reportKey: null,
  period: "all",
  day: "",
  month: "",
  year: String(new Date().getFullYear()),
  start_date: "",
  end_date: "",
  employee_id: "",
})

const MONTHS = [
  { value: "jan", label: "January" },
  { value: "feb", label: "February" },
  { value: "mar", label: "March" },
  { value: "apr", label: "April" },
  { value: "may", label: "May" },
  { value: "jun", label: "June" },
  { value: "jul", label: "July" },
  { value: "aug", label: "August" },
  { value: "sep", label: "September" },
  { value: "oct", label: "October" },
  { value: "nov", label: "November" },
  { value: "dec", label: "December" },
]

function ReportCard({
  title,
  description,
  icon: Icon,
  iconBg,
  onConfigure,
  onQuickDownload,
}: {
  title: string
  description: string
  icon: any
  iconBg: string
  onConfigure: () => void
  onQuickDownload: () => Promise<void>
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${iconBg}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button className="w-full gap-2" onClick={onConfigure}>
          <Settings2 className="h-4 w-4" /> Configure &amp; Download
        </Button>
        <Button className="w-full gap-2" variant="secondary" onClick={onQuickDownload}>
          <Download className="h-4 w-4" /> Quick Download (All)
        </Button>
      </CardContent>
    </Card>
  )
}

export default function Reports() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [empLoading, setEmpLoading] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(defaultDialog())
  const [running, setRunning] = useState(false)

  useEffect(() => {
    loadEmployees()
  }, [])

  async function loadEmployees() {
    try {
      setEmpLoading(true)
      const list = await employeeService.getAll({ limit: 500 })
      const rows = Array.isArray(list) ? list : (list as any).data || []
      setEmployees(rows)
    } catch (e: any) {
      toast({ title: "Failed to load employees", description: e?.message, variant: "destructive" })
    } finally {
      setEmpLoading(false)
    }
  }

  function openConfigure(reportKey: ReportKey) {
    setDialog({ ...defaultDialog(), open: true, reportKey })
  }

  function buildParams(d: DialogState): ReportFilterParams {
    const params: ReportFilterParams = {}
    if (d.employee_id) params.employee_id = d.employee_id
    switch (d.period) {
      case "day":
        params.period = "day"
        if (d.day) {
          params.period_value = d.day
          params.date = d.day
        }
        break
      case "month":
        params.period = "month"
        if (d.month) {
          params.period_value = d.month
          params.month = d.month
        }
        if (d.year) params.year = Number(d.year)
        break
      case "year":
        params.period = "year"
        if (d.year) {
          params.period_value = d.year
          params.year = Number(d.year)
        }
        break
      case "range":
        params.period = "range"
        if (d.start_date) params.start_date = d.start_date
        if (d.end_date) params.end_date = d.end_date
        break
      default:
        break
    }
    return params
  }

  async function doQuickDownload(key: ReportKey) {
    if (running) return
    try {
      setRunning(true)
      const blob = await invoke(key, {})
      downloadBlob(blob, `${key}-report-${Date.now()}.xlsx`)
      toast({ title: "Downloading", variant: "success" })
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message || "Unknown error", variant: "destructive" })
    } finally {
      setRunning(false)
    }
  }

  async function invoke(key: ReportKey, params: ReportFilterParams): Promise<Blob> {
    switch (key) {
      case "employees":
        return reportsService.downloadEmployees(params)
      case "attendance":
        return reportsService.downloadAttendance(params)
      case "salary":
        return reportsService.downloadSalary(params)
      case "expenses":
        return reportsService.downloadExpenses(params)
      case "requisitions":
        return reportsService.downloadRequisitions({
          period: params.period,
          period_value: params.period_value,
          date: params.date,
          start_date: params.start_date,
          end_date: params.end_date,
        })
      case "inventory":
        return reportsService.downloadInventory({
          employee_id: params.employee_id ? params.employee_id : undefined,
        })
      case "lunch":
        return reportsService.downloadLunch(params)
    }
  }

  async function submitDialog() {
    if (!dialog.reportKey || running) return
    try {
      setRunning(true)
      const params = buildParams(dialog)
      const blob = await invoke(dialog.reportKey, params)
      const tag =
        dialog.period === "all"
          ? "all"
          : dialog.period === "day" && dialog.day
          ? dialog.day
          : dialog.period === "month"
          ? `${dialog.year || "any"}-${dialog.month || "any"}`
          : dialog.period === "year"
          ? dialog.year || "any"
          : `${dialog.start_date || "s"}_${dialog.end_date || "e"}`
      downloadBlob(blob, `${dialog.reportKey}-report-${tag}-${Date.now()}.xlsx`)
      toast({ title: "Downloading", variant: "success" })
      setDialog((d) => ({ ...d, open: false }))
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message || "Unknown error", variant: "destructive" })
    } finally {
      setRunning(false)
    }
  }

  const titleFor = useMemo(() => {
    const map: Record<ReportKey, string> = {
      employees: "Employees Report",
      attendance: "Attendance Report",
      salary: "Salary / Payroll Report",
      expenses: "Expenses Report",
      requisitions: "Requisitions Report",
      inventory: "Inventory Report",
      lunch: "Lunch Report",
    }
    return map
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
        <p className="text-muted-foreground">
          Configure filters by Day, Month, Year, or range, then export to Excel.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ReportCard
          title="Employees Report"
          description="All employee records (NID, DOB, Salary)"
          icon={Users}
          iconBg="bg-sky-600"
          onConfigure={() => openConfigure("employees")}
          onQuickDownload={() => doQuickDownload("employees")}
        />
        <ReportCard
          title="Attendance Report"
          description="Attendance records, filterable by period"
          icon={CalendarClock}
          iconBg="bg-emerald-600"
          onConfigure={() => openConfigure("attendance")}
          onQuickDownload={() => doQuickDownload("attendance")}
        />
        <ReportCard
          title="Salary / Payroll Report"
          description="Payroll and salary details"
          icon={Wallet}
          iconBg="bg-amber-600"
          onConfigure={() => openConfigure("salary")}
          onQuickDownload={() => doQuickDownload("salary")}
        />
        <ReportCard
          title="Expenses Report"
          description="Expense reimbursements"
          icon={Receipt}
          iconBg="bg-rose-600"
          onConfigure={() => openConfigure("expenses")}
          onQuickDownload={() => doQuickDownload("expenses")}
        />
        <ReportCard
          title="Requisitions Report"
          description="Requisition ledger entries, filterable by period"
          icon={ClipboardList}
          iconBg="bg-indigo-600"
          onConfigure={() => openConfigure("requisitions")}
          onQuickDownload={() => doQuickDownload("requisitions")}
        />
        <ReportCard
          title="Inventory Report"
          description="Equipment & supplies with assignments"
          icon={Package}
          iconBg="bg-violet-600"
          onConfigure={() => openConfigure("inventory")}
          onQuickDownload={() => doQuickDownload("inventory")}
        />
        <ReportCard
          title="Lunch Report"
          description="Daily lunch count for employees"
          icon={UtensilsCrossed}
          iconBg="bg-orange-600"
          onConfigure={() => openConfigure("lunch")}
          onQuickDownload={() => doQuickDownload("lunch")}
        />
      </div>

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog(defaultDialog())}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Configure {dialog.reportKey ? titleFor[dialog.reportKey] : "Report"}
            </DialogTitle>
            <DialogDescription>
              Choose a period filter (Day / Month / Year / Range) and optionally an employee.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Period Filter</Label>
              <Tabs
                value={dialog.period}
                onValueChange={(v) => setDialog((d) => ({ ...d, period: v as PeriodMode }))}
              >
                <TabsList className="grid grid-cols-5">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="day">Day</TabsTrigger>
                  <TabsTrigger value="month">Month</TabsTrigger>
                  <TabsTrigger value="year">Year</TabsTrigger>
                  <TabsTrigger value="range">Range</TabsTrigger>
                </TabsList>
                <TabsContent value="all" className="pt-3 text-sm text-muted-foreground">
                  No date filtering — download all records.
                </TabsContent>
                <TabsContent value="day" className="pt-3 space-y-2">
                  <Label htmlFor="r_day">Date</Label>
                  <Input
                    id="r_day"
                    type="date"
                    value={dialog.day}
                    onChange={(e) => setDialog((d) => ({ ...d, day: e.target.value }))}
                  />
                </TabsContent>
                <TabsContent value="month" className="pt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="r_month">Month</Label>
                    <Select
                      value={dialog.month}
                      onValueChange={(v) => setDialog((d) => ({ ...d, month: v }))}
                    >
                      <SelectTrigger id="r_month">
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="r_year_m">Year</Label>
                    <Input
                      id="r_year_m"
                      type="number"
                      placeholder="2025"
                      value={dialog.year}
                      onChange={(e) => setDialog((d) => ({ ...d, year: e.target.value }))}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="year" className="pt-3 space-y-2">
                  <Label htmlFor="r_year_y">Year</Label>
                  <Input
                    id="r_year_y"
                    type="number"
                    placeholder="2025"
                    value={dialog.year}
                    onChange={(e) => setDialog((d) => ({ ...d, year: e.target.value }))}
                  />
                </TabsContent>
                <TabsContent value="range" className="pt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="r_start">Start Date</Label>
                    <Input
                      id="r_start"
                      type="date"
                      value={dialog.start_date}
                      onChange={(e) => setDialog((d) => ({ ...d, start_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="r_end">End Date</Label>
                    <Input
                      id="r_end"
                      type="date"
                      value={dialog.end_date}
                      onChange={(e) => setDialog((d) => ({ ...d, end_date: e.target.value }))}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {dialog.reportKey !== "requisitions" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="r_emp">Employee (optional)</Label>
                  {dialog.employee_id ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() => setDialog((d) => ({ ...d, employee_id: "" }))}
                    >
                      <UserRound className="h-3 w-3 mr-1" /> Reset to all
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-xs font-normal">
                      All employees
                    </Badge>
                  )}
                </div>
                <EmployeeSelect
                  value={dialog.employee_id}
                  onValueChange={(id) => setDialog((d) => ({ ...d, employee_id: id }))}
                  employees={employees}
                  includeInactive
                  placeholder={empLoading ? "Loading employees…" : "Search to filter by ID or name (leave empty = all)"}
                />
              </div>
            )}

            {dialog.reportKey === "requisitions" && (
              <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2">
                <FileText className="h-4 w-4 mt-0.5 text-slate-500" />
                Requisition line items aren't tied to a single employee, so this report isn't filterable by employee —
                use the period filter above to narrow results.
              </div>
            )}

            {dialog.reportKey === "employees" && (
              <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2">
                <FileText className="h-4 w-4 mt-0.5 text-slate-500" />
                For a single-employee multi-sheet workbook (Profile + Attendance + Salary + Leave + Expenses),
                open the Employees page and click the report icon next to an employee row.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialog(defaultDialog())}
              className="gap-2"
            >
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button onClick={submitDialog} disabled={running} className="gap-2">
              <Download className="h-4 w-4" /> {running ? "Preparing…" : "Download Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="mt-4 border-dashed">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <CardTitle>About Reports</CardTitle>
              <CardDescription>
                Reports are generated server-side in Excel (.xlsx) format. Currency values are in BDT (৳).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}

import { useEffect, useState, useRef } from "react"
import {
  Plus,
  Check,
  X,
  Receipt,
  Download,
  Upload,
  FileSpreadsheet,
  Eye,
  Settings2,
  ChevronLeft,
  ChevronRight,
  UserRound,
  Trash2,
  Loader2,
} from "lucide-react"
import { expenseService } from "@/services/expense.service"
import type { Expense, Employee } from "@/types"
import { EmployeeSelect } from "@/components/EmployeeSelect"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/useToast"
import { formatCurrency, formatDate } from "@/lib/utils"

const statusVariant = (s: string) => {
  const map: Record<string, any> = {
    approved: "success",
    pending: "warning",
    rejected: "destructive",
    reimbursed: "info",
  }
  return map[s] || "default"
}

const CATEGORIES: { value: string; label: string; group?: string }[] = [
  { value: "daily_office_needs", label: "Daily Office Needs", group: "Office" },
  { value: "office_supplies", label: "Office Supplies", group: "Office" },
  { value: "stationery", label: "Stationery", group: "Office" },
  { value: "utilities", label: "Utilities (Electricity, Internet)", group: "Office" },
  { value: "communication", label: "Communication (Mobile, Internet)", group: "Office" },
  { value: "office", label: "Other Office Expense", group: "Office" },

  { value: "travel", label: "Travel / Tickets", group: "Travel" },
  { value: "transport", label: "Local Transport", group: "Travel" },
  { value: "fuel", label: "Fuel / Vehicle", group: "Travel" },
  { value: "accommodation", label: "Accommodation / Hotel", group: "Travel" },

  { value: "meals", label: "Meals / Food", group: "People" },
  { value: "entertainment", label: "Entertainment / Client", group: "People" },
  { value: "training", label: "Training / Courses", group: "People" },
  { value: "medical", label: "Medical / Health", group: "People" },

  { value: "miscellaneous", label: "Miscellaneous", group: "Other" },
  { value: "other", label: "Other (specify below)", group: "Other" },
]

const GROUPS_ORDER = ["Office", "Travel", "People", "Other"]

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

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

type PeriodMode = "all" | "day" | "month" | "year" | "range"

interface ViewFilters {
  period: PeriodMode
  day: string
  month: string
  year: string
  start_date: string
  end_date: string
  employee_id: string
  category: string
}

const defaultViewFilters = (): ViewFilters => ({
  period: "all",
  day: "",
  month: "",
  year: String(new Date().getFullYear()),
  start_date: "",
  end_date: "",
  employee_id: "",
  category: "",
})

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function computeDateRange(f: ViewFilters): { start_date?: string; end_date?: string } {
  switch (f.period) {
    case "day":
      return f.day ? { start_date: f.day, end_date: f.day } : {}
    case "month": {
      if (!f.month) return {}
      const monthIndex = MONTHS.findIndex((m) => m.value === f.month)
      if (monthIndex < 0) return {}
      const year = Number(f.year) || new Date().getFullYear()
      return {
        start_date: toISODate(new Date(year, monthIndex, 1)),
        end_date: toISODate(new Date(year, monthIndex + 1, 0)),
      }
    }
    case "year":
      return f.year ? { start_date: `${f.year}-01-01`, end_date: `${f.year}-12-31` } : {}
    case "range":
      return {
        start_date: f.start_date || undefined,
        end_date: f.end_date || undefined,
      }
    default:
      return {}
  }
}

function describeFilters(f: ViewFilters, employeeName: string): string[] {
  const parts: string[] = []
  if (f.period === "day" && f.day) parts.push(`Date: ${f.day}`)
  if (f.period === "month" && f.month) {
    const label = MONTHS.find((m) => m.value === f.month)?.label || f.month
    parts.push(`${label} ${f.year}`)
  }
  if (f.period === "year" && f.year) parts.push(`Year: ${f.year}`)
  if (f.period === "range" && (f.start_date || f.end_date)) {
    parts.push(`${f.start_date || "…"} → ${f.end_date || "…"}`)
  }
  if (f.category) {
    parts.push(`Category: ${CATEGORIES.find((c) => c.value === f.category)?.label || f.category}`)
  }
  if (f.employee_id) {
    parts.push(`Employee: ${employeeName || f.employee_id.slice(0, 8)}`)
  }
  return parts
}

export default function Expenses() {
  const [rows, setRows] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<Partial<Expense>>({})
  const { toast } = useToast()

  // Excel import
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  // Server-side pagination
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Dataset-wide stats (independent of the current page)
  const [stats, setStats] = useState({ count: 0, totalAmount: 0, pendingAmount: 0, pendingCount: 0, approvedAmount: 0 })

  // "View" — custom filter dialog (Day / Month / Year / Range + Employee/Category), mirrors Reports
  const [viewOpen, setViewOpen] = useState(false)
  const [viewFilters, setViewFilters] = useState<ViewFilters>(defaultViewFilters())
  const [activeFilters, setActiveFilters] = useState<ViewFilters | null>(null)
  const [viewEmployeeName, setViewEmployeeName] = useState("")
  const [activeEmployeeName, setActiveEmployeeName] = useState("")

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState<Expense | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function buildQueryParams(targetPage: number, targetPerPage: number, filters: ViewFilters | null) {
    const params: Record<string, any> = { page: targetPage, per_page: targetPerPage }
    if (filters) {
      if (filters.employee_id) params.employee_id = filters.employee_id
      if (filters.category) params.category = filters.category
      const range = computeDateRange(filters)
      if (range.start_date) params.start_date = range.start_date
      if (range.end_date) params.end_date = range.end_date
    }
    return params
  }

  useEffect(() => {
    load(1, perPage, null)
    loadStats(null)
  }, [])

  async function load(targetPage = page, targetPerPage = perPage, filters = activeFilters) {
    try {
      setLoading(true)
      const res = await expenseService.getAll(buildQueryParams(targetPage, targetPerPage, filters))
      if (Array.isArray(res)) {
        setRows(res)
      } else {
        setRows(res.data || [])
        setTotal(res.total || 0)
        setTotalPages(res.total_pages || 1)
        setPage(res.page || targetPage)
      }
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function loadStats(filters = activeFilters) {
    try {
      const res = await expenseService.getAll(buildQueryParams(1, 500, filters))
      const all = Array.isArray(res) ? res : res.data || []
      const totalCount = Array.isArray(res) ? all.length : res.total || all.length
      setStats({
        count: totalCount,
        totalAmount: all.reduce((s, r) => s + (Number(r.amount) || 0), 0),
        pendingAmount: all.filter((r) => r.status === "pending").reduce((s, r) => s + (Number(r.amount) || 0), 0),
        pendingCount: all.filter((r) => r.status === "pending").length,
        approvedAmount: all
          .filter((r) => r.status === "approved" || r.status === "reimbursed")
          .reduce((s, r) => s + (Number(r.amount) || 0), 0),
      })
    } catch (e: any) {
      // Stats are supplementary — don't block the page on failure.
    }
  }

  function refresh(targetPage = page, filters = activeFilters) {
    load(targetPage, perPage, filters)
    loadStats(filters)
  }

  function applyViewFilters() {
    setActiveFilters(viewFilters)
    setActiveEmployeeName(viewEmployeeName)
    setPage(1)
    load(1, perPage, viewFilters)
    loadStats(viewFilters)
    setViewOpen(false)
  }

  function clearViewFilters() {
    const cleared = defaultViewFilters()
    setViewFilters(cleared)
    setViewEmployeeName("")
    setActiveFilters(null)
    setActiveEmployeeName("")
    setPage(1)
    load(1, perPage, null)
    loadStats(null)
  }

  function changePage(next: number) {
    if (next < 1 || next > totalPages) return
    load(next, perPage, activeFilters)
  }

  function changePerPage(n: number) {
    setPerPage(n)
    load(1, n, activeFilters)
  }

  function openCreate() {
    setForm({})
    setDialogOpen(true)
  }

  async function submitForm() {
    try {
      if (!form.expense_date) {
        toast({ title: "Expense date required", variant: "destructive" })
        return
      }
      if (!form.category) {
        toast({ title: "Category required", variant: "destructive" })
        return
      }
      if (form.category === "other" && !form.custom_category && !form.description) {
        toast({
          title: "Please describe the 'Other' category",
          description: "Use the Description box or type a custom category name.",
          variant: "destructive",
        })
        return
      }
      await expenseService.create({
        ...form,
        amount: Number(form.amount),
      })
      toast({ title: "Created", variant: "success" })
      setDialogOpen(false)
      refresh()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function approve(id: string) {
    try {
      await expenseService.approve(id)
      toast({ title: "Approved", variant: "success" })
      refresh()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function reject(id: string) {
    try {
      await expenseService.reject(id)
      toast({ title: "Rejected", variant: "destructive" })
      refresh()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return
    const id = deleteConfirm.id
    setDeletingId(id)
    try {
      await expenseService.delete(id)
      toast({ title: "Expense deleted" })
      refresh()
    } catch (e: any) {
      toast({ title: "Failed to delete expense", description: e?.message, variant: "destructive" })
    } finally {
      setDeletingId(null)
      setDeleteConfirm(null)
    }
  }

  async function handleDownloadTemplate() {
    try {
      const blob = await expenseService.downloadTemplate()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "expense_template.xlsx"
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast({ title: "Template downloaded", description: "BIN OMOR TRADERS — Expense List" })
    } catch (e: any) {
      toast({ title: "Failed to download template", description: e?.message, variant: "destructive" })
    }
  }

  async function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setImporting(true)
    try {
      const { imported_rows, title } = await expenseService.importExcel(f)
      toast({
        title: "Expenses imported",
        description: `${imported_rows} row(s) imported from "${title}"`,
      })
      setPage(1)
      refresh(1)
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err?.response?.data?.detail || err?.message || "Could not parse the file",
        variant: "destructive",
      })
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ""
    }
  }

  async function handleDownloadExcel() {
    try {
      const range = activeFilters ? computeDateRange(activeFilters) : {}
      const blob = await expenseService.downloadExcel({
        category: activeFilters?.category || undefined,
        employee_id: activeFilters?.employee_id || undefined,
        start_date: range.start_date,
        end_date: range.end_date,
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Expense_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast({ title: "Expense ledger downloaded" })
    } catch (e: any) {
      toast({ title: "Failed to download", description: e?.message, variant: "destructive" })
    }
  }

  const activeFilterChips = activeFilters ? describeFilters(activeFilters, activeEmployeeName) : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Expenses</h2>
          <p className="text-muted-foreground">
            Daily office needs, travel, meals, and more — with an "Other" catch-all category.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleDownloadTemplate} title="Download a blank BIN OMOR TRADERS Excel template">
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button
            variant="outline"
            onClick={() => importRef.current?.click()}
            disabled={importing}
            title="Import expenses from a BIN OMOR TRADERS Excel ledger"
          >
            {importing ? (
              <Upload className="mr-2 h-4 w-4 animate-pulse" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            {importing ? "Importing..." : "Import Excel"}
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={handleImportExcel}
          />
          <Button variant="outline" onClick={handleDownloadExcel} title="Download all expenses as a BIN OMOR TRADERS Excel ledger">
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setViewFilters(activeFilters || defaultViewFilters())
              setViewOpen(true)
            }}
            title="View expenses filtered by Day / Month / Year / Range"
          >
            <Eye className="mr-2 h-4 w-4" /> View
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> New Expense
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>New Expense</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label>Item Name</Label>
                <Input
                  value={form.product_name || ""}
                  onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                  placeholder="e.g. Laptop, Office Chair, etc."
                />
              </div>
              <div className="space-y-2">
                <Label>Employee (optional)</Label>
                <EmployeeSelect
                  value={form.employee_id ?? undefined}
                  onValueChange={(id) => setForm({ ...form, employee_id: id })}
                  placeholder="Search employee by ID or name..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={form.category || undefined}
                    onValueChange={(v) => setForm({ ...form, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {GROUPS_ORDER.map((g) => {
                        const items = CATEGORIES.filter((c) => c.group === g)
                        if (!items.length) return null
                        return (
                          <div key={g}>
                            <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                              {g}
                            </div>
                            {items.map((c) => (
                              <SelectItem key={c.value} value={c.value} className="capitalize">
                                {c.label}
                              </SelectItem>
                            ))}
                          </div>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (BDT)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.amount ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value === "" ? undefined : Number(e.target.value) })
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>

              {form.category === "other" && (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                  <Label htmlFor="ex_custom" className="text-amber-800">
                    Custom category name
                  </Label>
                  <Input
                    id="ex_custom"
                    value={(form as any).custom_category || ""}
                    onChange={(e) =>
                      setForm({ ...form, custom_category: e.target.value } as any)
                    }
                    placeholder="e.g. Newspaper subscription, A4 papers..."
                  />
                  <p className="text-[11px] text-amber-700">
                    Tip: Use this field for the unknown / catch-all items. Description below can hold extra details.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.expense_date ? String(form.expense_date).slice(0, 10) : ""}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description / Details</Label>
                <Textarea
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What was purchased, purpose, vendor..."
                />
              </div>
              <div className="space-y-2">
                <Label>Receipt # / Reference (optional)</Label>
                <Input
                  value={form.receipt_url || ""}
                  onChange={(e) => setForm({ ...form, receipt_url: e.target.value })}
                  placeholder="Receipt number or link"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={submitForm}>Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Dialog open={viewOpen} onOpenChange={(o) => !o && setViewOpen(false)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              View Expenses
            </DialogTitle>
            <DialogDescription>
              Choose a period filter (Day / Month / Year / Range), and optionally a category or employee.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Period Filter</Label>
              <Tabs
                value={viewFilters.period}
                onValueChange={(v) => setViewFilters((d) => ({ ...d, period: v as PeriodMode }))}
              >
                <TabsList className="grid grid-cols-5">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="day">Day</TabsTrigger>
                  <TabsTrigger value="month">Month</TabsTrigger>
                  <TabsTrigger value="year">Year</TabsTrigger>
                  <TabsTrigger value="range">Range</TabsTrigger>
                </TabsList>
                <TabsContent value="all" className="pt-3 text-sm text-muted-foreground">
                  No date filtering — view all records.
                </TabsContent>
                <TabsContent value="day" className="pt-3 space-y-2">
                  <Label htmlFor="v_day">Date</Label>
                  <Input
                    id="v_day"
                    type="date"
                    value={viewFilters.day}
                    onChange={(e) => setViewFilters((d) => ({ ...d, day: e.target.value }))}
                  />
                </TabsContent>
                <TabsContent value="month" className="pt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="v_month">Month</Label>
                    <Select
                      value={viewFilters.month}
                      onValueChange={(v) => setViewFilters((d) => ({ ...d, month: v }))}
                    >
                      <SelectTrigger id="v_month">
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
                    <Label htmlFor="v_year_m">Year</Label>
                    <Input
                      id="v_year_m"
                      type="number"
                      placeholder="2025"
                      value={viewFilters.year}
                      onChange={(e) => setViewFilters((d) => ({ ...d, year: e.target.value }))}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="year" className="pt-3 space-y-2">
                  <Label htmlFor="v_year_y">Year</Label>
                  <Input
                    id="v_year_y"
                    type="number"
                    placeholder="2025"
                    value={viewFilters.year}
                    onChange={(e) => setViewFilters((d) => ({ ...d, year: e.target.value }))}
                  />
                </TabsContent>
                <TabsContent value="range" className="pt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="v_start">Start Date</Label>
                    <Input
                      id="v_start"
                      type="date"
                      value={viewFilters.start_date}
                      onChange={(e) => setViewFilters((d) => ({ ...d, start_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="v_end">End Date</Label>
                    <Input
                      id="v_end"
                      type="date"
                      value={viewFilters.end_date}
                      onChange={(e) => setViewFilters((d) => ({ ...d, end_date: e.target.value }))}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label>Category (optional)</Label>
              <Select
                value={viewFilters.category || undefined}
                onValueChange={(v) => setViewFilters((d) => ({ ...d, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS_ORDER.map((g) => {
                    const items = CATEGORIES.filter((c) => c.group === g)
                    if (!items.length) return null
                    return (
                      <div key={g}>
                        <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                          {g}
                        </div>
                        {items.map((c) => (
                          <SelectItem key={c.value} value={c.value} className="capitalize">
                            {c.label}
                          </SelectItem>
                        ))}
                      </div>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="v_emp">Employee (optional)</Label>
                {viewFilters.employee_id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setViewFilters((d) => ({ ...d, employee_id: "" }))
                      setViewEmployeeName("")
                    }}
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
                value={viewFilters.employee_id}
                onValueChange={(id, emp) => {
                  setViewFilters((d) => ({ ...d, employee_id: id }))
                  setViewEmployeeName(emp ? `${emp.first_name} ${emp.last_name}` : "")
                }}
                includeInactive
                placeholder="Search to filter by ID or name (leave empty = all)"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button variant="ghost" onClick={clearViewFilters}>
              <X className="mr-2 h-4 w-4" /> Clear Filters
            </Button>
            <Button onClick={applyViewFilters}>
              <Eye className="mr-2 h-4 w-4" /> Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Total Expenses</CardTitle>
              <CardDescription>{stats.count} records{activeFilters ? " (filtered)" : ""}</CardDescription>
            </div>
            <Receipt className="h-5 w-5 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</div>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Pending Approval</CardTitle>
              <CardDescription>{stats.pendingCount} items</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{formatCurrency(stats.pendingAmount)}</div>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Approved / Paid</CardTitle>
              <CardDescription>Already reimbursed</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{formatCurrency(stats.approvedAmount)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">All Expenses ({total})</CardTitle>
            {activeFilterChips.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {activeFilterChips.map((c) => (
                  <Badge key={c} variant="secondary" className="font-normal">
                    {c}
                  </Badge>
                ))}
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearViewFilters}>
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item Name</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No expenses yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const catDisplay: string =
                    (r as any).category_display ||
                    (r.category === "other"
                      ? (r as any).custom_category || "Other"
                      : CATEGORIES.find((c) => c.value === r.category)?.label || r.category || "")
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.expense_date || r.date ? formatDate(r.expense_date || r.date!) : "—"}
                      </TableCell>
                      <TableCell>{(r as any).product_name || "—"}</TableCell>
                      <TableCell>{(r as any).employee_name || r.employee_id?.slice(0, 8) || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className="w-fit capitalize">
                            {r.category || "other"}
                          </Badge>
                          {r.category === "other" && (r as any).custom_category && (
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {(r as any).custom_category}
                            </span>
                          )}
                          {r.category !== "other" && catDisplay && catDisplay !== r.category && (
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {catDisplay}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-sm truncate">{r.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(Number(r.amount) || 0)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status || "pending")} className="capitalize">
                          {r.status || "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1 justify-end">
                          {r.status === "pending" && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => approve(r.id)}>
                                <Check className="h-4 w-4 text-emerald-600" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => reject(r.id)}>
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteConfirm(r)}
                            title="Delete Expense"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
        <div className="flex items-center justify-between flex-wrap gap-3 border-t px-6 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <Select value={String(perPage)} onValueChange={(v) => changePerPage(Number(v))}>
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              {total === 0
                ? "No results"
                : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => changePage(page - 1)}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => changePage(page + 1)}
              disabled={page >= totalPages || loading}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Expense?</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete
              <span className="font-semibold"> "{deleteConfirm?.product_name || deleteConfirm?.description || "this expense"}"</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletingId !== null}
            >
              {deletingId !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useEffect, useState } from "react"
import { Plus, Check, X, Receipt } from "lucide-react"
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

export default function Expenses() {
  const [rows, setRows] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<Partial<Expense>>({})
  const { toast } = useToast()

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setLoading(true)
      const res = await expenseService.getAll()
      setRows(Array.isArray(res) ? res : res.data || [])
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
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
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function approve(id: string) {
    try {
      await expenseService.approve(id)
      toast({ title: "Approved", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function reject(id: string) {
    try {
      await expenseService.reject(id)
      toast({ title: "Rejected", variant: "destructive" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  const totalPending = rows
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + (Number(r.amount) || 0), 0)

  const totalApproved = rows
    .filter((r) => r.status === "approved" || r.status === "reimbursed")
    .reduce((s, r) => s + (Number(r.amount) || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Expenses</h2>
          <p className="text-muted-foreground">
            Daily office needs, travel, meals, and more — with an "Other" catch-all category.
          </p>
        </div>
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
                <Label>Product Name</Label>
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Total Expenses</CardTitle>
              <CardDescription>{rows.length} records</CardDescription>
            </div>
            <Receipt className="h-5 w-5 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Pending Approval</CardTitle>
              <CardDescription>{rows.filter((r) => r.status === "pending").length} items</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{formatCurrency(totalPending)}</div>
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
            <div className="text-2xl font-bold text-emerald-700">{formatCurrency(totalApproved)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">All Expenses ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product Name</TableHead>
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
                        {r.status === "pending" && (
                          <div className="inline-flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => approve(r.id)}>
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => reject(r.id)}>
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

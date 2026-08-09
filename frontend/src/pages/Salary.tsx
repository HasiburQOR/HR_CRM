import { useEffect, useState, useMemo } from "react"
import { Plus, CheckCircle, Banknote, Pencil, Trash2 } from "lucide-react"
import { salaryService } from "@/services/salary.service"
import type { Salary } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/useToast"
import { formatCurrency } from "@/lib/utils"
import { EmployeeSelect } from "@/components/EmployeeSelect"

const statusVariant = (s: string) => {
  const map: Record<string, any> = {
    paid: "success",
    approved: "info",
    pending: "warning",
    rejected: "destructive",
  }
  return map[s] || "default"
}

export default function Salary() {
  const [rows, setRows] = useState<Salary[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Salary>>({})
  const { toast } = useToast()

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setLoading(true)
      const res = await salaryService.getAll()
      setRows(Array.isArray(res) ? res : res.data || [])
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setEditingId(null)
    setForm({})
    setDialogOpen(true)
  }

  function openEdit(r: Salary) {
    setEditingId(r.id)
    setForm({ ...r })
    setDialogOpen(true)
  }

  // Auto-calculations from gross salary
  const grossSalary = Number(form.gross_salary || 0)
  const basicSalary = useMemo(() => Math.round(grossSalary * 0.6), [grossSalary])
  const allowances = useMemo(() => Math.round(grossSalary * 0.4), [grossSalary])
  const deductions = Number(form.deductions || 0)
  const netSalary = grossSalary - deductions

  function handleGrossChange(value: string) {
    const gross = Number(value) || 0
    setForm({
      ...form,
      gross_salary: gross,
      basic_salary: Math.round(gross * 0.6),
      allowances: Math.round(gross * 0.4),
    })
  }

  function handleDeductionsChange(value: string) {
    setForm({ ...form, deductions: value === "" ? undefined : Number(value) || 0 })
  }

  async function submitForm() {
    try {
      const gross = Number(form.gross_salary || 0)
      const basic = Math.round(gross * 0.6)
      const allow = Math.round(gross * 0.4)
      const deduct = Number(form.deductions || 0)
      const net = gross - deduct
      if (editingId) {
        await salaryService.update(editingId, {
          ...form,
          gross_salary: gross,
          basic_salary: basic,
          allowances: allow,
          deductions: deduct,
          net_salary: net,
        })
        toast({ title: "Updated", variant: "success" })
      } else {
        await salaryService.create({
          ...form,
          gross_salary: gross,
          basic_salary: basic,
          allowances: allow,
          deductions: deduct,
          net_salary: net,
        })
        toast({ title: "Created", variant: "success" })
      }
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function doDelete(id: string) {
    try {
      await salaryService.delete(id)
      toast({ title: "Deleted", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    } finally {
      setDeleteId(null)
    }
  }

  async function approve(id: string) {
    try {
      await salaryService.approve(id)
      toast({ title: "Approved", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function pay(id: string) {
    try {
      await salaryService.pay(id)
      toast({ title: "Marked paid", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Salary Management</h2>
          <p className="text-muted-foreground">Payroll, approvals, and payments</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Salary Record</Button>
      </div>

      {/* Salary Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Edit Salary Record" : "New Salary Record"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4 max-h-[70vh] overflow-auto">
              <div className="space-y-2">
                <Label>Employee</Label>
                <EmployeeSelect
                  value={form.employee_id}
                  onValueChange={(id) => setForm({ ...form, employee_id: id })}
                  placeholder="Search employee by ID or name..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select value={form.month} onValueChange={(v) => setForm({ ...form, month: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m) => (
                        <SelectItem key={m} value={m.toLowerCase().slice(0, 3)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Input type="number" value={form.year || ""} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
                </div>
              </div>

              {/* Gross Salary Input */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Gross Salary (BDT)</Label>
                <Input
                  type="number"
                  placeholder="Enter gross salary"
                  value={form.gross_salary ?? ""}
                  onChange={(e) => handleGrossChange(e.target.value)}
                  className="text-lg font-semibold"
                />
                <p className="text-xs text-muted-foreground">Basic (60%) and Allowances (40%) are auto-calculated from gross salary</p>
              </div>

              {/* Auto-calculated breakdown */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Basic Salary (60%)</Label>
                  <Input
                    type="number"
                    value={basicSalary || ""}
                    readOnly
                    className="bg-muted cursor-not-allowed font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Allowances (40%)</Label>
                  <Input
                    type="number"
                    value={allowances || ""}
                    readOnly
                    className="bg-muted cursor-not-allowed font-mono text-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Deductions</Label>
                  <Input
                    type="number"
                    value={form.deductions || ""}
                    onChange={(e) => handleDeductionsChange(e.target.value)}
                    className="font-mono text-rose-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Net Salary</Label>
                  <Input
                    type="number"
                    value={netSalary || ""}
                    readOnly
                    className="bg-muted cursor-not-allowed font-mono font-bold text-blue-600"
                  />
                </div>
              </div>

              {/* Summary box */}
              {grossSalary > 0 && (
                <div className="border rounded-lg p-3 text-sm space-y-1 bg-muted/50">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross Salary</span>
                    <span className="font-mono font-semibold">{formatCurrency(grossSalary)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">  Basic (60%)</span>
                    <span className="font-mono">{formatCurrency(basicSalary)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">  Allowances (40%)</span>
                    <span className="font-mono text-emerald-600">+{formatCurrency(allowances)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">  Deductions</span>
                    <span className="font-mono text-rose-600">-{formatCurrency(deductions)}</span>
                  </div>
                  <div className="border-t mt-1 pt-1 flex justify-between font-bold">
                    <span>Net Salary</span>
                    <span className="font-mono text-blue-600">{formatCurrency(netSalary)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={submitForm}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Records ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Basic (60%)</TableHead>
                <TableHead className="text-right">Allowances (40%)</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No records yet</TableCell></TableRow>
              ) : rows.map((r) => {
                const gross = (r as any).gross_salary || (r.basic_salary || 0) + (r.allowances || 0)
                return (
                  <TableRow key={r.id}>
                    <TableCell>{(r as any).employee_name || r.employee_id?.slice(0, 8)}</TableCell>
                    <TableCell className="capitalize">{r.month} {r.year}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{formatCurrency(gross)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(r.basic_salary || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">+{formatCurrency(r.allowances || 0)}</TableCell>
                    <TableCell className="text-right font-mono text-rose-600">-{formatCurrency(r.deductions || 0)}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{formatCurrency(r.net_salary || 0)}</TableCell>
                    <TableCell><Badge variant={statusVariant(r.status || "pending")} className="capitalize">{r.status || "pending"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {r.status === "pending" && (
                          <Button size="sm" variant="ghost" onClick={() => approve(r.id)} title="Approve">
                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                          </Button>
                        )}
                        {r.status === "approved" && (
                          <Button size="sm" variant="ghost" onClick={() => pay(r.id)} title="Mark Paid">
                            <Banknote className="h-4 w-4 text-sky-600" />
                          </Button>
                        )}
                        <AlertDialog open={deleteId === r.id} onOpenChange={(o) => !o && setDeleteId(null)}>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)} title="Delete">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete salary record?</AlertDialogTitle>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => doDelete(r.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
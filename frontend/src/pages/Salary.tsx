import { useEffect, useState } from "react"
import { Plus, CheckCircle, Banknote } from "lucide-react"
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
    setForm({})
    setDialogOpen(true)
  }

  async function submitForm() {
    try {
      const basic = Number(form.basic_salary || 0)
      const allowances = Number(form.allowances || 0)
      const deductions = Number(form.deductions || 0)
      const net = basic + allowances - deductions
      await salaryService.create({ ...form, basic_salary: basic, allowances, deductions, net_salary: net })
      toast({ title: "Created", variant: "success" })
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Salary Record</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Salary Record</DialogTitle></DialogHeader>
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
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Basic</Label>
                  <Input type="number" value={form.basic_salary ?? ""} onChange={(e) => setForm({ ...form, basic_salary: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Allowances</Label>
                  <Input type="number" value={form.allowances ?? ""} onChange={(e) => setForm({ ...form, allowances: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Deductions</Label>
                  <Input type="number" value={form.deductions ?? ""} onChange={(e) => setForm({ ...form, deductions: Number(e.target.value) })} />
                </div>
              </div>
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
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Records ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Allowances</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No records yet</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{(r as any).employee_name || r.employee_id?.slice(0, 8)}</TableCell>
                  <TableCell className="capitalize">{r.month} {r.year}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.basic_salary || 0)}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-600">+{formatCurrency(r.allowances || 0)}</TableCell>
                  <TableCell className="text-right font-mono text-rose-600">-{formatCurrency(r.deductions || 0)}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{formatCurrency(r.net_salary || 0)}</TableCell>
                  <TableCell><Badge variant={statusVariant(r.status || "pending")} className="capitalize">{r.status || "pending"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1 justify-end">
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

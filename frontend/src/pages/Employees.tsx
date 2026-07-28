import { useEffect, useState } from "react"
import { UserPlus, Pencil, Trash2, Download, FileText } from "lucide-react"
import { employeeService } from "@/services/employee.service"
import { reportsService } from "@/services/reports.service"
import type { Employee } from "@/types"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/useToast"
import { formatDate, formatCurrency } from "@/lib/utils"

const statusVariant = (s: string) => {
  const map: Record<string, any> = {
    active: "success",
    inactive: "secondary",
    on_leave: "warning",
    suspended: "destructive",
  }
  return map[s] || "default"
}

type EmployeeFormState = Partial<Employee>

export default function Employees() {
  const [rows, setRows] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EmployeeFormState>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setLoading(true)
      const res = await employeeService.getAll()
      setRows(Array.isArray(res) ? res : res.data || [])
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function openCreate() {
    setEditingId(null)
    try {
      const nextId = await employeeService.nextEmployeeId()
      setForm({ employee_id: nextId })
    } catch {
      setForm({})
    }
    setDialogOpen(true)
  }

  function openEdit(e: Employee) {
    setEditingId(e.id)
    setForm(e)
    setDialogOpen(true)
  }

  async function submitForm() {
    try {
      const payload: any = { ...form }
      if (!payload.first_name || !payload.last_name || !payload.email) {
        toast({ title: "Missing required fields", description: "First name, last name, and email are required", variant: "destructive" })
        return
      }
      if (payload.hire_date && !payload.date_of_joining) payload.date_of_joining = payload.hire_date
      if (payload.birthday && !payload.date_of_birth) payload.date_of_birth = payload.birthday
      if (payload.national_id && !payload.nid) payload.nid = payload.national_id

      if (editingId) {
        await employeeService.update(editingId, payload)
        toast({ title: "Updated", variant: "success" })
      } else {
        await employeeService.create(payload)
        toast({ title: "Created", variant: "success" })
      }
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" })
    }
  }

  async function doDelete(id: string) {
    try {
      await employeeService.delete(id)
      toast({ title: "Deleted", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    } finally {
      setDeleteId(null)
    }
  }

  async function downloadIndividualReport(emp: Employee) {
    try {
      const blob = await reportsService.downloadEmployeeIndividual(emp.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `employee-${emp.employee_id || emp.id}-report.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: "Downloading", variant: "success" })
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Employees</h2>
          <p className="text-muted-foreground">Manage employee records (National ID, DOB, auto-generated ID)</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <UserPlus className="mr-2 h-4 w-4" /> Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Employee" : "Add Employee"}</DialogTitle>
              <DialogDescription>
                Employee ID is auto-generated. National ID and Birthday are optional but recommended.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 pr-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="f_eid">Employee ID</Label>
                  <Input id="f_eid" value={form.employee_id || ""} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} placeholder="EMP001" className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f_nid">National ID (NID)</Label>
                  <Input id="f_nid" value={form.nid || form.national_id || ""} onChange={(e) => setForm({ ...form, nid: e.target.value, national_id: e.target.value })} placeholder="National ID number" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="f_fname">First Name *</Label>
                  <Input id="f_fname" value={form.first_name || ""} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f_lname">Last Name *</Label>
                  <Input id="f_lname" value={form.last_name || ""} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="f_email">Email *</Label>
                  <Input id="f_email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f_phone">Phone</Label>
                  <Input id="f_phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="f_birth">Date of Birth</Label>
                  <Input id="f_birth" type="date" value={form.date_of_birth ? String(form.date_of_birth).slice(0, 10) : form.birthday ? String(form.birthday).slice(0, 10) : ""} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value, birthday: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f_hire">Hire Date (Joining)</Label>
                  <Input id="f_hire" type="date" value={form.hire_date ? String(form.hire_date).slice(0, 10) : form.date_of_joining ? String(form.date_of_joining).slice(0, 10) : ""} onChange={(e) => setForm({ ...form, hire_date: e.target.value, date_of_joining: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="f_dept">Department</Label>
                  <Input id="f_dept" value={form.department || ""} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. HR, IT, Finance" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f_jtitle">Job Title / Designation</Label>
                  <Input id="f_jtitle" value={form.job_title || form.designation || ""} onChange={(e) => setForm({ ...form, job_title: e.target.value, designation: e.target.value })} placeholder="e.g. Software Engineer" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="f_salary">Basic Salary (BDT)</Label>
                  <Input id="f_salary" type="number" value={form.salary ?? ""} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f_status">Status</Label>
                  <Select value={form.status || "active"} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger id="f_status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="on_leave">On Leave</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="f_addr">Address</Label>
                <Input id="f_addr" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={submitForm}>{editingId ? "Update" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">All Employees ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>NID</TableHead>
                <TableHead>Birthday</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Hire Date</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No employees yet</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.employee_id}</TableCell>
                  <TableCell>{r.full_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.nid || r.national_id || "—"}</TableCell>
                  <TableCell>{r.date_of_birth || r.birthday ? formatDate(r.date_of_birth || r.birthday!) : "—"}</TableCell>
                  <TableCell>{r.department || "—"}</TableCell>
                  <TableCell>{r.job_title || r.designation || "—"}</TableCell>
                  <TableCell>{r.hire_date || r.date_of_joining ? formatDate(r.hire_date || r.date_of_joining!) : "—"}</TableCell>
                  <TableCell className="font-mono">{formatCurrency(r.salary || 0)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(r.status || "active")} className="capitalize">{r.status || "active"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => downloadIndividualReport(r)} title="Download individual report">
                        <FileText className="h-4 w-4 text-indigo-600" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog open={deleteId === r.id} onOpenChange={(o) => !o && setDeleteId(null)}>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)} title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete employee?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

import { useEffect, useMemo, useState } from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { taskService } from "@/services/task.service"
import { employeeService } from "@/services/employee.service"
import type { Task, Employee } from "@/types"
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
import { Textarea } from "@/components/ui/textarea"
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
import { useToast } from "@/components/ui/useToast"
import { formatDate } from "@/lib/utils"
import { EmployeeSelect } from "@/components/EmployeeSelect"

const statusVariant = (s: string) => {
  const map: Record<string, any> = {
    completed: "success",
    in_progress: "info",
    pending: "warning",
    cancelled: "destructive",
  }
  return map[s] || "default"
}

const PRIORITIES = ["low", "medium", "high", "urgent"]
const STATUSES = ["pending", "in_progress", "completed", "cancelled"]

export default function Tasks() {
  const [rows, setRows] = useState<Task[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Task>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    load()
    loadEmployees()
  }, [])

  async function load() {
    try {
      setLoading(true)
      const res = await taskService.getAll()
      setRows(Array.isArray(res) ? res : res.data || [])
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function loadEmployees() {
    try {
      const res = await employeeService.getAll({ limit: 500 })
      setEmployees(Array.isArray(res) ? res : (res as any).data || [])
    } catch {}
  }

  const assignedToEmployeeId = useMemo<string | undefined>(() => {
    const uid = form.assigned_to
    if (!uid) return undefined
    const match = employees.find((e) => e.user_id === uid)
    return match ? match.id : undefined
  }, [form.assigned_to, employees])

  function openCreate() {
    setEditingId(null)
    setForm({})
    setDialogOpen(true)
  }

  function openEdit(t: Task) {
    setEditingId(t.id)
    setForm(t)
    setDialogOpen(true)
  }

  function handleAssignedEmployeeChange(employeeId: string, employee?: Employee) {
    if (!employeeId || !employee) {
      setForm({ ...form, assigned_to: null as any })
      return
    }
    setForm({
      ...form,
      assigned_to: employee.user_id || employeeId,
    })
  }

  async function submitForm() {
    try {
      if (editingId) {
        await taskService.update(editingId, form)
        toast({ title: "Updated", variant: "success" })
      } else {
        await taskService.create(form)
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
      await taskService.delete(id)
      toast({ title: "Deleted", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          <p className="text-muted-foreground">Assign and manage employee tasks</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Task</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Edit Task" : "New Task"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Assigned To (Employee)</Label>
                <EmployeeSelect
                  value={assignedToEmployeeId}
                  onValueChange={handleAssignedEmployeeChange}
                  employees={employees}
                  placeholder="Search by Employee ID, Name, Email..."
                  includeInactive
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Click the field to search by Employee ID, Name, NID, or Email. Employee must have a linked user account.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={form.priority || "medium"} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status || "pending"} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date ? String(form.due_date).slice(0, 10) : ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
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
        <CardHeader className="pb-2"><CardTitle className="text-lg">All Tasks ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No tasks yet</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div>{r.title}</div>
                    {r.description && <div className="text-xs text-muted-foreground truncate max-w-sm">{r.description}</div>}
                  </TableCell>
                  <TableCell>{(r as any).assigned_to_name || r.assigned_to?.slice(0, 8)}</TableCell>
                  <TableCell className="capitalize"><Badge variant={r.priority === "urgent" || r.priority === "high" ? "destructive" : "outline"}>{r.priority}</Badge></TableCell>
                  <TableCell>{r.due_date ? formatDate(r.due_date) : "—"}</TableCell>
                  <TableCell><Badge variant={statusVariant(r.status || "pending")} className="capitalize">{(r.status || "pending").replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog open={deleteId === r.id} onOpenChange={(o) => !o && setDeleteId(null)}>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete task?</AlertDialogTitle></AlertDialogHeader>
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

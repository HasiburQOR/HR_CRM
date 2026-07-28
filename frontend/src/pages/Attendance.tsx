import { useEffect, useState } from "react"
import {
  Plus,
  Check,
  X,
  LogIn,
  LogOut,
  Clock,
  UtensilsCrossed,
  Edit3,
  UserCircle,
} from "lucide-react"
import { attendanceService } from "@/services/attendance.service"
import type { Attendance, Employee } from "@/types"
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
  DialogDescription,
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
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/useToast"
import { useAuth } from "@/contexts/AuthContext"
import { formatDate } from "@/lib/utils"

const statusVariant = (s: string) => {
  const map: Record<string, any> = {
    present: "success",
    approved: "success",
    pending: "warning",
    absent: "destructive",
    rejected: "destructive",
  }
  return map[s] || "default"
}

type ActionMode = "in" | "out" | "record"

function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export default function Attendance() {
  const { user } = useAuth()
  const isEmployee = user?.role === "employee"
  const [rows, setRows] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const [actionOpen, setActionOpen] = useState<ActionMode | null>(null)
  const [form, setForm] = useState<{
    employee_id: string
    date: string
    check_in: string
    check_out: string
    lunch_included: boolean
    status: string
    notes: string
  }>({
    employee_id: isEmployee ? (user?.employee_id || "") : "",
    date: todayISO(),
    check_in: nowHHMM(),
    check_out: nowHHMM(),
    lunch_included: false,
    status: "present",
    notes: "",
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (isEmployee && user?.employee_id) {
      setForm((f) => ({ ...f, employee_id: user.employee_id || "" }))
    }
  }, [isEmployee, user?.employee_id])

  async function load() {
    try {
      setLoading(true)
      const params: any = { limit: 200 }
      const res = await attendanceService.getAll(params)
      setRows(Array.isArray(res) ? res : res.data || [])
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  function openAction(mode: ActionMode) {
    setForm((f) => ({
      ...f,
      date: todayISO(),
      check_in: nowHHMM(),
      check_out: nowHHMM(),
      employee_id: isEmployee && user?.employee_id ? user.employee_id || "" : "",
      lunch_included: false,
      status: "present",
      notes: "",
    }))
    setActionOpen(mode)
  }

  async function submitIn() {
    if (!form.employee_id) {
      toast({ title: "Employee required", variant: "destructive" })
      return
    }
    try {
      setBusy(true)
      await attendanceService.checkIn({
        employee_id: form.employee_id,
        date: form.date,
        check_in: form.check_in,
        lunch_included: form.lunch_included,
        notes: form.notes || undefined,
      })
      toast({ title: "Checked in", variant: "success" })
      setActionOpen(null)
      load()
    } catch (e: any) {
      toast({ title: "Check in failed", description: e?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  async function submitOut() {
    if (!form.employee_id) {
      toast({ title: "Employee required", variant: "destructive" })
      return
    }
    try {
      setBusy(true)
      await attendanceService.checkOut({
        employee_id: form.employee_id,
        date: form.date,
        check_out: form.check_out,
        notes: form.notes || undefined,
      })
      toast({ title: "Checked out", variant: "success" })
      setActionOpen(null)
      load()
    } catch (e: any) {
      toast({ title: "Check out failed", description: e?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  async function submitRecord() {
    if (!form.employee_id || !form.date) {
      toast({ title: "Employee and date required", variant: "destructive" })
      return
    }
    try {
      setBusy(true)
      await attendanceService.create({
        employee_id: form.employee_id,
        date: form.date,
        check_in: form.check_in || undefined,
        check_out: form.check_out || undefined,
        status: form.status,
        lunch_included: form.lunch_included,
        notes: form.notes || undefined,
      })
      toast({ title: "Recorded", variant: "success" })
      setActionOpen(null)
      load()
    } catch (e: any) {
      toast({ title: "Record failed", description: e?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  async function approve(id: string) {
    try {
      await attendanceService.approve(id)
      toast({ title: "Approved", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function reject(id: string) {
    try {
      await attendanceService.reject(id)
      toast({ title: "Rejected", variant: "destructive" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  const todayCount = rows.filter((r) => r.date === todayISO()).length
  const checkedIn = rows.filter((r) => r.date === todayISO() && r.check_in).length
  const checkedOut = rows.filter((r) => r.date === todayISO() && r.check_out).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Attendance</h2>
        <p className="text-muted-foreground">Check employees in at start of day, out at end of day</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Today</CardTitle>
              <CardDescription>{todayISO()}</CardDescription>
            </div>
            <Clock className="h-5 w-5 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div>
                <div className="text-2xl font-bold">{todayCount}</div>
                <div className="text-xs text-muted-foreground">Records</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-700">{checkedIn}</div>
                <div className="text-xs text-muted-foreground">Checked In</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-700">{checkedOut}</div>
                <div className="text-xs text-muted-foreground">Checked Out</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Start of Day</CardTitle>
              <CardDescription>Record employee arrival</CardDescription>
            </div>
            <div className="w-9 h-9 rounded-md bg-emerald-600 flex items-center justify-center">
              <LogIn className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => openAction("in")}>
              <LogIn className="mr-2 h-4 w-4" /> Check In
            </Button>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">End of Day</CardTitle>
              <CardDescription>Record employee departure</CardDescription>
            </div>
            <div className="w-9 h-9 rounded-md bg-amber-600 flex items-center justify-center">
              <LogOut className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="default" onClick={() => openAction("out")}>
              <LogOut className="mr-2 h-4 w-4" /> Check Out
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Tip: Use <span className="font-medium">Check In</span> then <span className="font-medium">Check Out</span>.
          Use "Full Record" to create a manual entry with both times.
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => openAction("record")}>
            <Edit3 className="mr-2 h-4 w-4" /> Full Record
          </Button>
          <Button variant="outline" onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Records ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Lunch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
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
                    No records yet — Check In an employee to start.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.date!)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{(r as any).employee_name || r.employee_id?.slice(0, 8)}</div>
                      {(r as any).employee_code && (
                        <div className="font-mono text-[11px] text-muted-foreground">{(r as any).employee_code}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{r.check_in || "—"}</TableCell>
                    <TableCell className="font-mono">{r.check_out || "—"}</TableCell>
                    <TableCell>
                      {r.lunch_taken || r.lunch_included || r.auto_lunch_counted ? (
                        <Badge variant="outline" className="gap-1 flex items-center">
                          <UtensilsCrossed className="h-3 w-3" /> Lunch
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status || "pending")} className="capitalize">
                        {r.status || "pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground text-xs">
                      {r.notes || "—"}
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Check In Dialog */}
      <Dialog open={actionOpen === "in"} onOpenChange={(o) => !o && setActionOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-emerald-600 flex items-center justify-center">
                <LogIn className="h-4 w-4 text-white" />
              </div>
              Check In
            </DialogTitle>
            <DialogDescription>
              Record the start of the work day. Time defaults to now.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              {isEmployee ? (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                  <UserCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{user?.full_name || user?.username}</span>
                  {user?.employee_id && (
                    <Badge variant="outline" className="font-mono text-[10px]">{user.employee_id}</Badge>
                  )}
                </div>
              ) : (
                <EmployeeSelect
                  value={form.employee_id}
                  onValueChange={(id) => setForm({ ...form, employee_id: id })}
                  placeholder="Search employee by ID or name..."
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Check In Time</Label>
                <Input type="time" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between rounded-lg border p-3 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-orange-100 flex items-center justify-center">
                  <UtensilsCrossed className="h-4 w-4 text-orange-700" />
                </div>
                <div>
                  <div className="font-medium text-sm">Will have lunch today?</div>
                  <div className="text-xs text-muted-foreground">Marks attendance lunch as provided / counted</div>
                </div>
              </div>
              <Switch
                checked={form.lunch_included}
                onCheckedChange={(v) => setForm({ ...form, lunch_included: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. late 10 min due to traffic"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionOpen(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitIn} disabled={busy || !form.employee_id}>
              {busy ? "Processing…" : "Confirm Check In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check Out Dialog */}
      <Dialog open={actionOpen === "out"} onOpenChange={(o) => !o && setActionOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-amber-600 flex items-center justify-center">
                <LogOut className="h-4 w-4 text-white" />
              </div>
              Check Out
            </DialogTitle>
            <DialogDescription>
              Record end of the work day. Employee must have checked in first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              {isEmployee ? (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                  <UserCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{user?.full_name || user?.username}</span>
                  {user?.employee_id && (
                    <Badge variant="outline" className="font-mono text-[10px]">{user.employee_id}</Badge>
                  )}
                </div>
              ) : (
                <EmployeeSelect
                  value={form.employee_id}
                  onValueChange={(id) => setForm({ ...form, employee_id: id })}
                  placeholder="Search employee by ID or name..."
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Check Out Time</Label>
                <Input type="time" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. stayed back 30 min for deployment"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionOpen(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitOut} disabled={busy || !form.employee_id}>
              {busy ? "Processing…" : "Confirm Check Out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Record Dialog */}
      <Dialog open={actionOpen === "record"} onOpenChange={(o) => !o && setActionOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-4 w-4" /> Manual Attendance Record
            </DialogTitle>
            <DialogDescription>
              Enter both check-in and check-out for a date (useful for back-filling records).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              {isEmployee ? (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                  <UserCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{user?.full_name || user?.username}</span>
                  {user?.employee_id && (
                    <Badge variant="outline" className="font-mono text-[10px]">{user.employee_id}</Badge>
                  )}
                </div>
              ) : (
                <EmployeeSelect
                  value={form.employee_id}
                  onValueChange={(id) => setForm({ ...form, employee_id: id })}
                  placeholder="Search employee by ID or name..."
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check In</Label>
                <Input type="time" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Check Out</Label>
                <Input type="time" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 bg-slate-50">
              <div className="flex items-center gap-3">
                <UtensilsCrossed className="h-4 w-4 text-orange-700" />
                <div className="text-sm">Lunch provided / counted</div>
              </div>
              <Switch
                checked={form.lunch_included}
                onCheckedChange={(v) => setForm({ ...form, lunch_included: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionOpen(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitRecord} disabled={busy || !form.employee_id}>
              {busy ? "Saving…" : "Save Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

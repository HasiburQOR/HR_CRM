import { useEffect, useMemo, useState } from "react"
import {
  Plus,
  Package,
  Download,
  Edit2,
  Trash2,
  UserPlus,
  UserMinus,
  AlertTriangle,
  Search,
  Filter,
} from "lucide-react"
import { inventoryService, type InventoryListParams } from "@/services/inventory.service"
import type { InventoryItem } from "@/types"
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
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/useToast"
import { formatCurrency, formatDate } from "@/lib/utils"

const ITEM_TYPES = [
  { value: "equipment", label: "Equipment" },
  { value: "supplies", label: "Office Supplies" },
  { value: "furniture", label: "Furniture" },
  { value: "devices", label: "Devices (Laptop/Phone)" },
  { value: "consumable", label: "Consumable" },
  { value: "access_card", label: "Access Card" },
  { value: "key", label: "Key / Fob" },
  { value: "other", label: "Other" },
]

const STATUS_VARIANT: Record<string, any> = {
  in_stock: "success",
  assigned: "secondary",
  low_stock: "warning",
  out_of_stock: "destructive",
  damaged: "outline",
  retired: "outline",
  reserved: "outline",
}

const CONDITION_OPTIONS = ["New", "Like New", "Good", "Fair", "Damaged", "Needs Repair"]

const DEFAULT_CATEGORIES = [
  "IT Equipment",
  "Office Furniture",
  "Stationery",
  "Kitchen Supplies",
  "Cleaning Supplies",
  "Safety Equipment",
  "Access Control",
  "Other",
]

export default function Inventory() {
  const [rows, setRows] = useState<InventoryItem[]>([])
  const [stats, setStats] = useState<any>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<InventoryItem | null>(null)
  const [form, setForm] = useState<Partial<InventoryItem>>({})
  const [assignForm, setAssignForm] = useState<{ employee_id: string; assignment_notes: string }>({
    employee_id: "",
    assignment_notes: "",
  })
  const [filters, setFilters] = useState<InventoryListParams>({
    search: "",
    category: "",
    item_type: "",
    status: "",
    assigned: undefined,
    low_stock: false,
  })
  const { toast } = useToast()

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    load()
  }, [filters])

  async function loadAll() {
    await Promise.all([load(), loadStats(), loadCategories()])
  }

  async function load() {
    try {
      setLoading(true)
      const params: InventoryListParams = { ...filters, limit: 200 }
      if (params.category === "all") params.category = ""
      if (params.item_type === "all") params.item_type = ""
      if (params.status === "all") params.status = ""
      const res = await inventoryService.getAll(params)
      setRows(Array.isArray(res) ? res : res.data || [])
    } catch (e: any) {
      toast({ title: "Failed to load inventory", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function loadStats() {
    try {
      setStatsLoading(true)
      const s = await inventoryService.getStats()
      setStats(s)
    } catch (e) {
    } finally {
      setStatsLoading(false)
    }
  }

  async function loadCategories() {
    try {
      const list = await inventoryService.getCategories()
      setCategories(list && list.length ? list : DEFAULT_CATEGORIES)
    } catch (e) {
      setCategories(DEFAULT_CATEGORIES)
    }
  }

  function openCreate() {
    setEditingId(null)
    setForm({ quantity: 1, minimum_stock: 0, unit_cost: 0, status: "in_stock", item_type: "equipment" })
    setDialogOpen(true)
  }

  function openEdit(it: InventoryItem) {
    setEditingId(it.id)
    setForm({ ...it })
    setDialogOpen(true)
  }

  async function submitForm() {
    try {
      if (!form.item_code) {
        toast({ title: "Item Code required", variant: "destructive" })
        return
      }
      if (!form.name) {
        toast({ title: "Item Name required", variant: "destructive" })
        return
      }
      if (!form.category) {
        toast({ title: "Category required", variant: "destructive" })
        return
      }
      const payload: any = { ...form }
      if (payload.unit_cost !== undefined) payload.unit_cost = Number(payload.unit_cost) || 0
      if (payload.quantity !== undefined) payload.quantity = Number(payload.quantity) || 0
      if (payload.minimum_stock !== undefined) payload.minimum_stock = Number(payload.minimum_stock) || 0
      if (payload.category === "custom" && payload.custom_category) {
        payload.category = payload.custom_category
      }
      if (editingId) {
        await inventoryService.update(editingId, payload)
        toast({ title: "Updated", variant: "success" })
      } else {
        await inventoryService.create(payload)
        toast({ title: "Created", variant: "success" })
      }
      setDialogOpen(false)
      loadAll()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  function openAssign(it: InventoryItem) {
    setAssignTarget(it)
    setAssignForm({ employee_id: it.employee_id || "", assignment_notes: it.assignment_notes || "" })
    setAssignOpen(true)
  }

  async function submitAssign() {
    try {
      if (!assignTarget) return
      if (!assignForm.employee_id) {
        toast({ title: "Select an employee", variant: "destructive" })
        return
      }
      await inventoryService.assign(assignTarget.id, {
        employee_id: assignForm.employee_id,
        assignment_notes: assignForm.assignment_notes || undefined,
      })
      toast({ title: "Assigned", variant: "success" })
      setAssignOpen(false)
      loadAll()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" })
    }
  }

  async function doUnassign(it: InventoryItem) {
    try {
      await inventoryService.unassign(it.id)
      toast({ title: "Unassigned", variant: "success" })
      loadAll()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" })
    }
  }

  async function doDelete(it: InventoryItem) {
    if (!confirm(`Delete item "${it.name}" (${it.item_code})? This cannot be undone.`)) return
    try {
      await inventoryService.delete(it.id)
      toast({ title: "Deleted", variant: "success" })
      loadAll()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" })
    }
  }

  async function doExport() {
    try {
      const params: InventoryListParams = { ...filters }
      if (params.category === "all") params.category = ""
      if (params.item_type === "all") params.item_type = ""
      if (params.status === "all") params.status = ""
      const blob = await inventoryService.exportExcel(params)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `inventory-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: "Exported", variant: "success" })
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" })
    }
  }

  const totalValue = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.quantity || 0) * Number(r.unit_cost || 0)), 0),
    [rows]
  )
  const assignedCount = rows.filter((r) => r.employee_id).length
  const lowStockCount = rows.filter((r) => r.is_low_stock || (Number(r.minimum_stock || 0) > 0 && Number(r.quantity || 0) <= Number(r.minimum_stock || 0))).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground">
            Track office equipment assigned to employees and general office supplies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={doExport} className="gap-2">
            <Download className="h-4 w-4" /> Export Excel
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" /> New Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Inventory Item" : "New Inventory Item"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Item Code *</Label>
                    <Input
                      value={form.item_code || ""}
                      onChange={(e) => setForm({ ...form, item_code: e.target.value })}
                      placeholder="e.g. LAP-001, PEN-RED"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Item Name *</Label>
                    <Input
                      value={form.name || ""}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Dell Latitude 5420"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select
                      value={form.category || undefined}
                      onValueChange={(v) => setForm({ ...form, category: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                        <SelectItem value="custom">+ Add custom category...</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.category === "custom" && (
                      <Input
                        className="mt-2"
                        placeholder="Enter new category name"
                        value={(form as any).custom_category || ""}
                        onChange={(e) => setForm({ ...form, custom_category: e.target.value } as any)}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Item Type</Label>
                    <Select
                      value={form.item_type || undefined}
                      onValueChange={(v) => setForm({ ...form, item_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.quantity ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, quantity: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Minimum Stock Alert</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.minimum_stock ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, minimum_stock: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit Cost (BDT)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.unit_cost ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, unit_cost: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Condition</Label>
                    <Select
                      value={form.condition || undefined}
                      onValueChange={(v) => setForm({ ...form, condition: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITION_OPTIONS.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={form.status || undefined}
                      onValueChange={(v) => setForm({ ...form, status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_stock">In Stock</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="low_stock">Low Stock</SelectItem>
                        <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                        <SelectItem value="damaged">Damaged</SelectItem>
                        <SelectItem value="reserved">Reserved</SelectItem>
                        <SelectItem value="retired">Retired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Serial Number</Label>
                    <Input
                      value={form.serial_number || ""}
                      onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Model Number</Label>
                    <Input
                      value={form.model_number || ""}
                      onChange={(e) => setForm({ ...form, model_number: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Manufacturer / Brand</Label>
                    <Input
                      value={form.manufacturer || ""}
                      onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Location / Storage</Label>
                    <Input
                      value={form.location || ""}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="e.g. Storage Room B, Desk 12"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Purchase Date</Label>
                    <Input
                      type="date"
                      value={form.purchase_date ? String(form.purchase_date).slice(0, 10) : ""}
                      onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Warranty End Date</Label>
                    <Input
                      type="date"
                      value={form.warranty_end_date ? String(form.warranty_end_date).slice(0, 10) : ""}
                      onChange={(e) => setForm({ ...form, warranty_end_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description / Notes</Label>
                  <Textarea
                    value={form.description || ""}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Additional details, specs, purchase vendor, etc."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={submitForm}>{editingId ? "Save Changes" : "Create Item"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {assignTarget?.employee_id ? "Reassign Item" : "Assign Item to Employee"}
                </DialogTitle>
                {assignTarget && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{assignTarget.name}</span>
                    {" "}— Code: {assignTarget.item_code}
                  </div>
                )}
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Employee *</Label>
                  <EmployeeSelect
                    value={assignForm.employee_id}
                    onValueChange={(id) => setAssignForm({ ...assignForm, employee_id: id })}
                    placeholder="Search employee by ID or name..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Assignment Notes (optional)</Label>
                  <Textarea
                    value={assignForm.assignment_notes}
                    onChange={(e) => setAssignForm({ ...assignForm, assignment_notes: e.target.value })}
                    placeholder="Condition when handed over, accessories included, expected return date..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
                <Button onClick={submitAssign} className="gap-2">
                  <UserPlus className="h-4 w-4" /> Confirm Assign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Total Items</CardTitle>
              <CardDescription>Unique SKUs</CardDescription>
            </div>
            <Package className="h-5 w-5 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "—" : (stats?.total_items ?? rows.length)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Total Value</CardTitle>
              <CardDescription>Inventory cost</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">
              {statsLoading ? "—" : formatCurrency(stats?.total_value ?? totalValue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Assigned to Employees</CardTitle>
              <CardDescription>In use</CardDescription>
            </div>
            <UserPlus className="h-5 w-5 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-700">
              {statsLoading ? "—" : (stats?.assigned_count ?? assignedCount)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Low Stock</CardTitle>
              <CardDescription>Needs reorder</CardDescription>
            </div>
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">
              {statsLoading ? "—" : (stats?.low_stock ?? lowStockCount)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Code, name, serial, model..."
                  value={filters.search || ""}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select
                value={filters.category || "all"}
                onValueChange={(v) => setFilters({ ...filters, category: v === "all" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={filters.item_type || "all"}
                onValueChange={(v) => setFilters({ ...filters, item_type: v === "all" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {ITEM_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={filters.status || "all"}
                onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="low_stock">Low Stock</SelectItem>
                  <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex items-end gap-3 lg:col-span-1 justify-between lg:justify-around">
              <div className="flex items-center gap-2">
                <Switch
                  checked={filters.assigned === true}
                  onCheckedChange={(c) => setFilters({ ...filters, assigned: c ? true : undefined })}
                  id="f_assigned"
                />
                <Label htmlFor="f_assigned" className="text-xs whitespace-nowrap">Assigned only</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!filters.low_stock}
                  onCheckedChange={(c) => setFilters({ ...filters, low_stock: c })}
                  id="f_low"
                />
                <Label htmlFor="f_low" className="text-xs whitespace-nowrap">Low stock</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">All Items ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category / Type</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Serial / Model</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    Loading inventory...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No inventory items. Click "New Item" to add one.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const low = r.is_low_stock || (Number(r.minimum_stock || 0) > 0 && Number(r.quantity || 0) <= Number(r.minimum_stock || 0))
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.item_code}</TableCell>
                      <TableCell className="font-medium min-w-[180px]">
                        <div className="flex flex-col">
                          <span>{r.name}</span>
                          {r.description && (
                            <span className="text-xs text-muted-foreground font-normal truncate max-w-[280px]">
                              {r.description}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className="w-fit">{r.category}</Badge>
                          <span className="text-[11px] text-muted-foreground capitalize">
                            {ITEM_TYPES.find((t) => t.value === r.item_type)?.label || r.item_type || ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center">
                          <span className={`font-semibold ${low ? "text-amber-700" : ""}`}>
                            {r.quantity}
                          </span>
                          {low && (
                            <span className="text-[10px] text-amber-700 flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" /> Low ({r.minimum_stock})
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{r.condition || "—"}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col">
                          {r.serial_number && <span className="font-mono">S/N: {r.serial_number}</span>}
                          {r.model_number && <span className="font-mono text-muted-foreground">M/N: {r.model_number}</span>}
                          {!r.serial_number && !r.model_number && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        {r.employee_id ? (
                          <div className="flex flex-col">
                            <span className="font-medium">{r.employee_name || "Assigned"}</span>
                            <span className="text-xs text-muted-foreground">
                              ID: {r.employee_empid || r.employee_id?.slice(0, 8)}
                            </span>
                            {r.assigned_at && (
                              <span className="text-[10px] text-muted-foreground">
                                Since {formatDate(r.assigned_at)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">— In stock —</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status || "in_stock"] || "default"} className="capitalize whitespace-nowrap">
                          {(r.status || "in_stock").replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(Number(r.quantity || 0) * Number(r.unit_cost || 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Edit">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {r.employee_id ? (
                            <Button size="sm" variant="ghost" onClick={() => doUnassign(r)} title="Unassign">
                              <UserMinus className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => openAssign(r)} title="Assign">
                              <UserPlus className="h-4 w-4 text-indigo-600" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => doDelete(r)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
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
      </Card>
    </div>
  )
}

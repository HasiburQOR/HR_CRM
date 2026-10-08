import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
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
  FileSpreadsheet,
  Upload,
  Loader2,
  Building2,
} from "lucide-react"
import { inventoryService, type InventoryListParams } from "@/services/inventory.service"
import type { InventoryItem, InventoryAssignment } from "@/types"
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

const DEFAULT_DEPARTMENTS = ["Sales", "Marketing", "Contracting", "Reporting", "Admin"]

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
  const [departments, setDepartments] = useState<string[]>(DEFAULT_DEPARTMENTS)
  const [assignForm, setAssignForm] = useState<{
    assign_to: "employee" | "department"
    employee_id: string
    department: string
    custom_department: string
    quantity: number
    condition: string
    assignment_notes: string
  }>({
    assign_to: "employee",
    employee_id: "",
    department: "",
    custom_department: "",
    quantity: 1,
    condition: "",
    assignment_notes: "",
  })
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnTarget, setReturnTarget] = useState<InventoryAssignment | null>(null)
  const [returnForm, setReturnForm] = useState<{ return_condition: string; notes: string }>({
    return_condition: "",
    notes: "",
  })
  const [filters, setFilters] = useState<InventoryListParams>({
    search: "",
    category: "",
    item_type: "",
    status: "",
    department: "",
    assigned: undefined,
    low_stock: false,
  })
  const { toast } = useToast()

  // Excel import
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    load()
  }, [filters])

  async function loadAll() {
    await Promise.all([load(), loadStats(), loadCategories(), loadDepartments()])
  }

  async function loadDepartments() {
    try {
      const list = await inventoryService.getDepartments()
      setDepartments(list && list.length ? list : DEFAULT_DEPARTMENTS)
    } catch (e) {
      setDepartments(DEFAULT_DEPARTMENTS)
    }
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

  const codeGenToken = useRef(0)

  function handleCategoryChange(v: string) {
    const next = { ...form, category: v }
    setForm(next)
    autoGenerateItemCode(next)
  }

  function handleCustomCategoryChange(e: ChangeEvent<HTMLInputElement>) {
    const next = { ...form, custom_category: e.target.value } as any
    setForm(next)
    autoGenerateItemCode(next)
  }

  function handleTypeChange(v: string) {
    const next = { ...form, item_type: v }
    setForm(next)
    autoGenerateItemCode(next)
  }

  async function autoGenerateItemCode(next: Partial<InventoryItem>) {
    if (editingId) return
    const category = (next.category ?? form.category) || ""
    const itemType = (next.item_type ?? form.item_type) || ""
    const customCategory = ((next as any).custom_category ?? (form as any).custom_category) || ""
    const effectiveCategory = (category === "custom" ? customCategory : category).trim()
    if (!effectiveCategory || !itemType) return
    const token = ++codeGenToken.current
    try {
      const code = await inventoryService.getNextCode(effectiveCategory, itemType)
      if (token === codeGenToken.current) {
        setForm((prev) => ({ ...prev, item_code: code }))
      }
    } catch {
      // ignore — the user can still type an item code manually
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
    setAssignForm({
      assign_to: "employee",
      employee_id: "",
      department: "",
      custom_department: "",
      quantity: 1,
      condition: it.condition || "",
      assignment_notes: "",
    })
    setAssignOpen(true)
  }

  async function submitAssign() {
    try {
      if (!assignTarget) return
      const toDepartment = assignForm.assign_to === "department"
      const department = (
        assignForm.department === "custom" ? assignForm.custom_department : assignForm.department
      ).trim()
      if (toDepartment && !department) {
        toast({ title: "Select a department", variant: "destructive" })
        return
      }
      if (!toDepartment && !assignForm.employee_id) {
        toast({ title: "Select an employee", variant: "destructive" })
        return
      }
      const qty = Number(assignForm.quantity) || 1
      if (qty < 1 || qty > (assignTarget.quantity || 0)) {
        toast({
          title: "Invalid quantity",
          description: `Only ${assignTarget.quantity || 0} unit(s) in stock`,
          variant: "destructive",
        })
        return
      }
      await inventoryService.assign(assignTarget.id, {
        ...(toDepartment ? { department } : { employee_id: assignForm.employee_id }),
        quantity: qty,
        condition: assignForm.condition || undefined,
        assignment_notes: assignForm.assignment_notes || undefined,
      })
      toast({
        title: "Assigned",
        description: toDepartment
          ? `${qty} unit(s) handed over to ${department} — stock updated.`
          : `${qty} unit(s) handed over — stock updated.`,
        variant: "success",
      })
      setAssignOpen(false)
      loadAll()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" })
    }
  }

  function openReturn(a: InventoryAssignment) {
    setReturnTarget(a)
    setReturnForm({ return_condition: a.condition || "", notes: "" })
    setReturnOpen(true)
  }

  async function submitReturn() {
    try {
      if (!returnTarget) return
      if (!returnForm.return_condition) {
        toast({ title: "Select the condition on return", variant: "destructive" })
        return
      }
      await inventoryService.returnAssignment(returnTarget.id, {
        return_condition: returnForm.return_condition,
        notes: returnForm.notes || undefined,
      })
      toast({ title: "Returned to stock", description: "Quantity added back to stock.", variant: "success" })
      setReturnOpen(false)
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

  async function downloadTemplate() {
    try {
      const blob = await inventoryService.downloadTemplate()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "inventory_template.xlsx"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: "Template downloaded", description: "Fill it in and upload via Import Excel" })
    } catch (e: any) {
      toast({ title: "Failed to download template", description: e?.message, variant: "destructive" })
    }
  }

  async function handleImportExcel(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setImporting(true)
    try {
      const res = await inventoryService.importExcel(f)
      const summary =
        `${res.created} created, ${res.updated} updated` + (res.failed ? `, ${res.failed} skipped` : "")
      const firstErrors = (res.errors || [])
        .slice(0, 3)
        .map((er) => `Row ${er.row}: ${er.message}`)
        .join(" • ")
      if (res.failed) {
        toast({
          title: "Import finished with errors",
          description: firstErrors ? `${summary} — ${firstErrors}` : summary,
          variant: "destructive",
        })
      } else {
        toast({ title: "Inventory imported", description: summary, variant: "success" })
      }
      loadAll()
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

  const totalValue = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.quantity || 0) * Number(r.unit_cost || 0)), 0),
    [rows]
  )
  const assignedCount = rows.reduce(
    (n, r) => n + (Number(r.assigned_count || 0) || (r.employee_id ? 1 : 0)),
    0
  )
  const lowStockCount = rows.filter((r) => r.is_low_stock || (Number(r.minimum_stock || 0) > 0 && Number(r.quantity || 0) <= Number(r.minimum_stock || 0))).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground">
            Track office equipment assigned to employees or departments and general office supplies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={doExport} className="gap-2">
            <Download className="h-4 w-4" /> Export Excel
          </Button>
          <Button
            variant="secondary"
            onClick={downloadTemplate}
            className="gap-2"
            title="Download a blank Excel template in the correct format"
          >
            <FileSpreadsheet className="h-4 w-4" /> Template
          </Button>
          <Button
            variant="secondary"
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="gap-2"
            title="Bulk create/update inventory items from an Excel file"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {importing ? "Importing..." : "Import Excel"}
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xlsm"
            onChange={handleImportExcel}
            className="hidden"
          />
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
                    <Label>Category *</Label>
                    <Select
                      value={form.category || undefined}
                      onValueChange={handleCategoryChange}
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
                        onChange={handleCustomCategoryChange}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Item Type</Label>
                    <Select
                      value={form.item_type || undefined}
                      onValueChange={handleTypeChange}
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Item Code *</Label>
                    <Input
                      value={form.item_code || ""}
                      onChange={(e) => setForm({ ...form, item_code: e.target.value })}
                      placeholder="Auto-generated after Category & Item Type"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Auto-generated from Category + Item Type (you can still edit it).
                    </p>
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

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Quantity (Stock on Hand)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.quantity ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, quantity: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Units currently in stock. Assigning to employees will reduce this number.
                    </p>
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
                <DialogTitle>Assign Item</DialogTitle>
                {assignTarget && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{assignTarget.name}</span>
                    {" "}— Code: {assignTarget.item_code} — Stock: {assignTarget.quantity} unit(s)
                  </div>
                )}
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Assign To</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={assignForm.assign_to === "employee" ? "default" : "outline"}
                      onClick={() => setAssignForm({ ...assignForm, assign_to: "employee" })}
                      className="gap-2"
                    >
                      <UserPlus className="h-4 w-4" /> Employee
                    </Button>
                    <Button
                      type="button"
                      variant={assignForm.assign_to === "department" ? "default" : "outline"}
                      onClick={() => setAssignForm({ ...assignForm, assign_to: "department" })}
                      className="gap-2"
                    >
                      <Building2 className="h-4 w-4" /> Department
                    </Button>
                  </div>
                </div>
                {assignForm.assign_to === "employee" ? (
                  <div className="space-y-2">
                    <Label>Employee *</Label>
                    <EmployeeSelect
                      value={assignForm.employee_id}
                      onValueChange={(id) => setAssignForm({ ...assignForm, employee_id: id })}
                      placeholder="Search employee by ID or name..."
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Department *</Label>
                    <Select
                      value={assignForm.department || undefined}
                      onValueChange={(v) => setAssignForm({ ...assignForm, department: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                        <SelectItem value="custom">+ Add another department...</SelectItem>
                      </SelectContent>
                    </Select>
                    {assignForm.department === "custom" && (
                      <Input
                        className="mt-2"
                        placeholder="Enter department name"
                        maxLength={100}
                        value={assignForm.custom_department}
                        onChange={(e) => setAssignForm({ ...assignForm, custom_department: e.target.value })}
                      />
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      min={1}
                      max={assignTarget?.quantity ?? 1}
                      value={assignForm.quantity}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, quantity: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {assignTarget?.quantity ?? 0} unit(s) available in stock
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Condition at Handover</Label>
                    <Select
                      value={assignForm.condition || undefined}
                      onValueChange={(v) => setAssignForm({ ...assignForm, condition: v })}
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
                </div>
                <div className="space-y-2">
                  <Label>Assignment Notes (optional)</Label>
                  <Textarea
                    value={assignForm.assignment_notes}
                    onChange={(e) => setAssignForm({ ...assignForm, assignment_notes: e.target.value })}
                    placeholder="Accessories included, expected return date, etc."
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

          <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Return Item to Stock</DialogTitle>
                {returnTarget && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {returnTarget.assignee_type === "department"
                        ? `${returnTarget.department} department`
                        : returnTarget.employee_name || "Employee"}
                    </span>
                    {" "}returns {returnTarget.quantity} unit(s) — the quantity will be added back to stock.
                  </div>
                )}
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Condition on Return *</Label>
                  <Select
                    value={returnForm.return_condition || undefined}
                    onValueChange={(v) => setReturnForm({ ...returnForm, return_condition: v })}
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
                  <p className="text-xs text-muted-foreground">
                    This also updates the product's condition in stock (e.g. mark it Damaged if returned broken).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Return Notes (optional)</Label>
                  <Textarea
                    value={returnForm.notes}
                    onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
                    placeholder="Anything to record about the return..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setReturnOpen(false)}>Cancel</Button>
                <Button onClick={submitReturn} className="gap-2">
                  <UserMinus className="h-4 w-4" /> Confirm Return
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
              <CardTitle className="text-sm">Assigned Units</CardTitle>
              <CardDescription>With employees & departments</CardDescription>
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
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-7">
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
            <div className="space-y-1">
              <Label className="text-xs">Assigned Department</Label>
              <Select
                value={filters.department || "all"}
                onValueChange={(v) => setFilters({ ...filters, department: v === "all" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
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
                          {Number(r.assigned_count || 0) > 0 && (
                            <span className="text-[10px] text-indigo-600">
                              {r.assigned_count} assigned
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
                      <TableCell className="min-w-[200px]">
                        {(r.assignments?.length || 0) > 0 ? (
                          <div className="flex flex-col gap-2">
                            {r.assignments!.map((a) => (
                              <div key={a.id} className="flex items-start justify-between gap-2">
                                <div className="flex flex-col">
                                  {a.assignee_type === "department" ? (
                                    <>
                                      <span className="font-medium flex items-center gap-1">
                                        <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                                        {a.department}
                                      </span>
                                      <span className="text-xs text-muted-foreground">Department</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="font-medium">{a.employee_name || "Assigned"}</span>
                                      <span className="text-xs text-muted-foreground">
                                        ID: {a.employee_empid || a.employee_id?.slice(0, 8)}
                                      </span>
                                    </>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    {a.quantity > 1 ? `${a.quantity} unit(s) · ` : ""}
                                    {a.condition ? `${a.condition} · ` : ""}
                                    Since {formatDate(a.assigned_at)}
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openReturn(a)}
                                  title="Return to stock"
                                >
                                  <UserMinus className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
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
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openAssign(r)}
                            disabled={(r.quantity || 0) <= 0}
                            title="Assign to employee or department"
                          >
                            <UserPlus className="h-4 w-4 text-indigo-600" />
                          </Button>
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

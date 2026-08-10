import { useEffect, useState, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  Plus,
  Download,
  Eye,
  Pencil,
  Lock,
  Unlock,
  Trash2,
  Loader2,
  Search,
  Inbox,
  Paperclip,
  FileSpreadsheet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/useToast"
import { useAuth } from "@/contexts/AuthContext"
import { requisitionService } from "@/services/requisition.service"
import type { Requisition, RequisitionExpense } from "@/types"

export default function Requisitions() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const isAdmin =
    !!user?.is_superuser ||
    ["admin", "ceo", "hr"].includes((user?.role || "").toLowerCase())

  const [data, setData] = useState<Requisition[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [reopeningId, setReopeningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Requisition | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // View popup state
  const [viewing, setViewing] = useState<Requisition | null>(null)
  const [viewingLoading, setViewingLoading] = useState(false)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)

  // Excel import
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      setData(await requisitionService.getAll())
    } catch {
      toast({ title: "Failed to load requisitions", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const filtered = useMemo(() => {
    return data.filter((r) => {
      const matchesSearch = r.title
        .toLowerCase()
        .includes(search.toLowerCase())
      const matchesStatus =
        statusFilter === "all" || r.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [data, search, statusFilter])

  const handleCreate = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      await requisitionService.create(title.trim())
      toast({ title: "Requisition created" })
      setTitle("")
      setShowCreate(false)
      fetchAll()
    } catch {
      toast({ title: "Failed to create requisition", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setImporting(true)
    try {
      const { requisition, imported_rows } = await requisitionService.importExcel(f)
      toast({
        title: "Requisition imported",
        description: `${requisition.title} — ${imported_rows} row(s) added`,
      })
      fetchAll()
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

  const handleDownloadTemplate = async () => {
    try {
      const blob = await requisitionService.downloadTemplate()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "requisition_template.xlsx"
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast({ title: "Template downloaded", description: "Fill it in and upload via Import from Excel" })
    } catch {
      toast({ title: "Failed to download template", variant: "destructive" })
    }
  }

  const handleClose = async (id: string) => {
    setClosingId(id)
    try {
      await requisitionService.close(id)
      toast({ title: "Requisition closed" })
      fetchAll()
    } catch {
      toast({ title: "Failed to close requisition", variant: "destructive" })
    } finally {
      setClosingId(null)
    }
  }

  const handleReopen = async (id: string) => {
    setReopeningId(id)
    try {
      await requisitionService.reopen(id)
      toast({ title: "Requisition reopened — now editable" })
      fetchAll()
    } catch {
      toast({ title: "Failed to reopen requisition", variant: "destructive" })
    } finally {
      setReopeningId(null)
    }
  }

  const handleView = async (id: string) => {
    setViewingLoading(true)
    setViewing(null)
    try {
      const full = await requisitionService.getById(id)
      setViewing(full)
    } catch {
      toast({ title: "Failed to load requisition details", variant: "destructive" })
    } finally {
      setViewingLoading(false)
    }
  }

  const statusBadge = (status?: string | null) => {
    const s = (status || "pending").toLowerCase()
    const cls =
      s === "approved"
        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
        : s === "rejected"
          ? "bg-red-100 text-red-800 hover:bg-red-100"
          : "bg-amber-100 text-amber-800 hover:bg-amber-100"
    return (
      <Badge variant="secondary" className={cls}>
        {s}
      </Badge>
    )
  }

  const isPdf = (url: string) => url.toLowerCase().endsWith(".pdf")

  const handleDownloadSingle = async (id: string, reqTitle: string) => {
    try {
      const blob = await requisitionService.downloadSingle(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${reqTitle.replace(/\s+/g, "_")}_report.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast({ title: "Download failed", variant: "destructive" })
    }
  }

  const handleDownloadBulk = async () => {
    if (selected.size === 0) return
    try {
      const blob = await requisitionService.downloadBulk(Array.from(selected))
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `bulk_requisitions_report.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast({ title: "Bulk download failed", variant: "destructive" })
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    const id = deleteConfirm.id
    setDeletingId(id)
    try {
      await requisitionService.delete(id)
      toast({ title: "Requisition deleted" })
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      fetchAll()
    } catch {
      toast({ title: "Failed to delete requisition", variant: "destructive" })
    } finally {
      setDeletingId(null)
      setDeleteConfirm(null)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((r) => r.id)))
  }

  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString() : "—"

  const fmtCurrency = (n: number) =>
    `৳${n.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Requisitions</CardTitle>
              <CardDescription>
                Manage and track all expense requisitions
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Requisition
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={importing}
                onClick={() => importRef.current?.click()}
                title="Upload an Excel ledger to auto-create a requisition"
              >
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                )}
                Import from Excel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadTemplate}
                title="Download a blank Excel template in the correct format"
              >
                <Download className="mr-2 h-4 w-4" />
                Template
              </Button>
              <input
                ref={importRef}
                type="file"
                accept=".xlsx,.xlsm"
                onChange={handleImportExcel}
                className="hidden"
              />
            </div>
          </div>

          {/* Filter Row */}
          <div className="flex items-center gap-3 pt-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Inbox className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">
                {data.length === 0
                  ? "No requisitions yet."
                  : "No requisitions match your search."}
              </p>
            </div>
          ) : (
            <>
              {/* Bulk Select Banner */}
              {selected.size > 0 && (
                <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 mb-4">
                  <span className="text-sm font-medium text-blue-800">
                    {selected.size} selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadBulk}
                    className="border-blue-300 text-blue-800 hover:bg-blue-100"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Selected
                  </Button>
                </div>
              )}

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            filtered.length > 0 && selected.size === filtered.length
                          }
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created Date</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const total = (r.expenses || []).reduce(
                        (s, e) => s + e.amount,
                        0
                      )
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <Checkbox
                              checked={selected.has(r.id)}
                              onCheckedChange={() => toggleSelect(r.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {r.title}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                r.status === "open"
                                  ? "bg-blue-100 text-blue-800 hover:bg-blue-100"
                                  : "bg-gray-100 text-gray-800 hover:bg-gray-100"
                              }
                            >
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{fmtDate(r.created_at)}</TableCell>
                          <TableCell>
                            {r.status === "closed" && r.duration_days != null
                              ? `${r.duration_days} day${r.duration_days !== 1 ? "s" : ""}`
                              : r.status === "open"
                                ? <span className="text-muted-foreground">In progress</span>
                                : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {r.expenses && r.expenses.length > 0
                              ? fmtCurrency(total)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/requisitions/${r.id}`)}
                                title="Edit Requisition"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleView(r.id)}
                                title="View Requisition"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleDownloadSingle(r.id, r.title)
                                }
                                title="Download Report"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              {r.status === "open" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={closingId === r.id}
                                  onClick={() => handleClose(r.id)}
                                  title="Close Requisition"
                                >
                                  {closingId === r.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Lock className="h-4 w-4" />
                                  )}
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={reopeningId === r.id}
                                  onClick={() => handleReopen(r.id)}
                                  title="Reopen Requisition"
                                >
                                  {reopeningId === r.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Unlock className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setDeleteConfirm(r)}
                                  title="Delete Requisition"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Requisition</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Requisition title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!title.trim() || creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* View Dialog (read-only) */}
      <Dialog open={!!viewing || viewingLoading} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 flex-wrap">
              {viewing?.title ?? "Loading…"}
              {viewing && (
                <Badge
                  variant="secondary"
                  className={
                    viewing.status === "open"
                      ? "bg-blue-100 text-blue-800 hover:bg-blue-100"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-100"
                  }
                >
                  {viewing.status}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Read-only overview of this requisition and its expenses.
            </DialogDescription>
          </DialogHeader>
          {viewingLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : viewing ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">Created</p>
                  <p className="font-semibold">{fmtDate(viewing.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">Closed</p>
                  <p className="font-semibold">{fmtDate(viewing.closed_at)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">Duration</p>
                  <p className="font-semibold">
                    {viewing.duration_days != null
                      ? `${viewing.duration_days} day${viewing.duration_days !== 1 ? "s" : ""}`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">Total</p>
                  <p className="font-semibold">
                    {fmtCurrency((viewing.expenses || []).reduce((s, e) => s + e.amount, 0))}
                  </p>
                </div>
              </div>
              <Separator className="my-2" />
              <div className="rounded-md border max-h-[40vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Receipt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!viewing.expenses || viewing.expenses.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No expenses added yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      viewing.expenses.map((exp: RequisitionExpense) => (
                        <TableRow key={exp.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {exp.expense_date
                              ? new Date(exp.expense_date + "T00:00:00").toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell>{exp.notes || "—"}</TableCell>
                          <TableCell className="text-right font-medium">
                            {fmtCurrency(exp.amount)}
                          </TableCell>
                          <TableCell>{statusBadge(exp.status)}</TableCell>
                          <TableCell>
                            {exp.receipt_url ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setReceiptPreview(exp.receipt_url ?? null)}
                                className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              >
                                <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                                View
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleDownloadSingle(viewing.id, viewing.title)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Report
                </Button>
                <Button onClick={() => navigate(`/requisitions/${viewing.id}`)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Open Editor
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Receipt Preview Dialog */}
      <Dialog open={!!receiptPreview} onOpenChange={(open) => !open && setReceiptPreview(null)}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0">
          <DialogTitle className="sr-only">Receipt Preview</DialogTitle>
          <DialogDescription className="sr-only">Preview of the uploaded receipt file</DialogDescription>
          {receiptPreview &&
            (isPdf(receiptPreview) ? (
              <iframe
                src={receiptPreview}
                className="w-full h-full border-0"
                title="Receipt PDF"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-muted/20">
                <img
                  src={receiptPreview}
                  alt="Receipt"
                  className="max-w-full max-h-full object-contain rounded-md shadow-sm"
                />
              </div>
            ))}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Requisition?</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete
              <span className="font-semibold"> "{deleteConfirm?.title}"</span>?
              This will also remove all its expenses. This action cannot be undone.
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
import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  Plus,
  FileText,
  Loader2,
  Lock,
  Unlock,
  Upload,
  Paperclip,
  Receipt,
  AlertCircle,
  Pencil,
  Check,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/useToast"
import { useAuth } from "@/contexts/AuthContext"
import { requisitionService } from "@/services/requisition.service"
import type { Requisition, RequisitionExpense } from "@/types"

export default function RequisitionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const isAdmin =
    !!user?.is_superuser ||
    ["admin", "ceo", "hr"].includes((user?.role || "").toLowerCase())
  const fileRef = useRef<HTMLInputElement>(null)

  const [req, setReq] = useState<Requisition | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [note, setNote] = useState("")
  const [amount, setAmount] = useState("")
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split("T")[0])
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Inline title editing
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [savingTitle, setSavingTitle] = useState(false)

  // Per-expense approval action loading
  const [actionExpId, setActionExpId] = useState<string | null>(null)

  const fetchReq = async () => {
    if (!id) return
    setLoading(true)
    try {
      setReq(await requisitionService.getById(id))
    } catch {
      toast({ title: "Failed to load requisition", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReq() }, [id])

  const handleAddExpense = async () => {
    if (!id || !amount) return
    setAdding(true)
    try {
      await requisitionService.addExpense(id, {
        note: note || undefined,
        amount: parseFloat(amount),
        expense_date: expenseDate || undefined,
        receipt: file || undefined,
      })
      toast({ title: "Expense added" })
      setNote("")
      setAmount("")
      setExpenseDate(new Date().toISOString().split("T")[0])
      setFile(null)
      if (fileRef.current) fileRef.current.value = ""
      fetchReq()
    } catch (err: any) {
      toast({
        title: "Failed to add expense",
        description: err?.message || "Unknown error",
        variant: "destructive",
      })
      console.error("Add expense error:", err)
    } finally {
      setAdding(false)
    }
  }

  const handleClose = async () => {
    if (!id) return
    setClosing(true)
    try {
      await requisitionService.close(id)
      toast({ title: "Requisition closed" })
      fetchReq()
    } catch {
      toast({ title: "Failed to close requisition", variant: "destructive" })
    } finally {
      setClosing(false)
    }
  }

  const handleReopen = async () => {
    if (!id) return
    setReopening(true)
    try {
      await requisitionService.reopen(id)
      toast({ title: "Requisition reopened — now editable" })
      fetchReq()
    } catch {
      toast({ title: "Failed to reopen requisition", variant: "destructive" })
    } finally {
      setReopening(false)
    }
  }

  const startEditTitle = () => {
    if (!req) return
    setTitleDraft(req.title)
    setEditingTitle(true)
  }

  const handleSaveTitle = async () => {
    if (!id || !req) return
    const trimmed = titleDraft.trim()
    if (!trimmed) {
      toast({ title: "Title is required", variant: "destructive" })
      return
    }
    if (trimmed === req.title) {
      setEditingTitle(false)
      return
    }
    setSavingTitle(true)
    try {
      await requisitionService.update(id, trimmed)
      toast({ title: "Title updated" })
      setEditingTitle(false)
      fetchReq()
    } catch (err: any) {
      toast({
        title: "Failed to update title",
        description: err?.message || "Unknown error",
        variant: "destructive",
      })
    } finally {
      setSavingTitle(false)
    }
  }

  const handleApproveExpense = async (expId: string) => {
    if (!id) return
    setActionExpId(expId)
    try {
      await requisitionService.approveExpense(id, expId)
      toast({ title: "Expense approved" })
      fetchReq()
    } catch (err: any) {
      toast({
        title: "Failed to approve expense",
        description: err?.message || "Unknown error",
        variant: "destructive",
      })
    } finally {
      setActionExpId(null)
    }
  }

  const handleRejectExpense = async (expId: string) => {
    if (!id) return
    setActionExpId(expId)
    try {
      await requisitionService.rejectExpense(id, expId)
      toast({ title: "Expense rejected" })
      fetchReq()
    } catch (err: any) {
      toast({
        title: "Failed to reject expense",
        description: err?.message || "Unknown error",
        variant: "destructive",
      })
    } finally {
      setActionExpId(null)
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

  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleString() : "—"

  const fmtCurrency = (n: number) =>
    `৳${n.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const totalAmount = (req?.expenses || []).reduce((s, e) => s + e.amount, 0)

  const isPdf = (url: string) => url.toLowerCase().endsWith(".pdf")

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!req) {
    return <p className="text-center py-20 text-muted-foreground">Requisition not found.</p>
  }

  const isClosed = req.status === "closed"

  return (
    <div className="space-y-6">
      {/* Section 1: Header Card */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          {/* Top Row */}
          <div className="flex items-center gap-4 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/requisitions")}
              className="shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {editingTitle ? (
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle()
                    if (e.key === "Escape") setEditingTitle(false)
                  }}
                  autoFocus
                  className="text-lg font-bold h-9 max-w-md"
                  disabled={savingTitle}
                />
                <Button
                  size="sm"
                  onClick={handleSaveTitle}
                  disabled={savingTitle}
                  title="Save"
                >
                  {savingTitle ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingTitle(false)}
                  disabled={savingTitle}
                  title="Cancel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">{req.title}</h2>
                {!isClosed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startEditTitle}
                    title="Edit title"
                    className="h-7 w-7 p-0"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
            <Badge
              variant="secondary"
              className={
                isClosed
                  ? "bg-gray-100 text-gray-800 hover:bg-gray-100"
                  : "bg-blue-100 text-blue-800 hover:bg-blue-100"
              }
            >
              {req.status}
            </Badge>
            <div className="ml-auto">
              {isClosed ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reopening}
                  onClick={handleReopen}
                  className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {reopening ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Unlock className="mr-2 h-4 w-4" />
                  )}
                  Reopen
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
                  disabled={closing}
                  onClick={handleClose}
                >
                  {closing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="mr-2 h-4 w-4" />
                  )}
                  Close Requisition
                </Button>
              )}
            </div>
          </div>

          {/* Bottom Grid - Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="rounded-md border bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Created At
              </p>
              <p className="text-sm font-semibold mt-1">{fmtDate(req.created_at)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Closed At
              </p>
              <p className="text-sm font-semibold mt-1">{fmtDate(req.closed_at)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Duration
              </p>
              <p className="text-sm font-semibold mt-1">
                {req.duration_days != null
                  ? `${req.duration_days} day${req.duration_days !== 1 ? "s" : ""}`
                  : "Pending"}
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Total Expenses
              </p>
              <p className="text-sm font-semibold mt-1">{fmtCurrency(totalAmount)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Add New Expense Card */}
      {!isClosed && (
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add New Expense
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Expense Date */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                  Date
                </label>
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>

              {/* Amount */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ৳
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {/* Note - spans 2 columns */}
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                  Note
                </label>
                <Textarea
                  placeholder="Optional note..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={1}
                />
              </div>

              {/* Receipt Upload */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                  Receipt
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </Button>
                  {file && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {file.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end mt-4">
              <Button
                type="button"
                onClick={handleAddExpense}
                disabled={!amount || adding}
              >
                {adding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add Expense
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 3: Expenses History Table Card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Expense History</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          {/* Closed Banner */}
          {isClosed && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 mb-4">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-800">
                This requisition is closed. Editing is disabled.
              </span>
            </div>
          )}

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!req.expenses || req.expenses.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-40">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Receipt className="h-10 w-10 mb-2 opacity-40" />
                        <p className="text-sm">No expenses added yet.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  req.expenses.map((exp: RequisitionExpense) => (
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
                            onClick={() => setPreviewUrl(exp.receipt_url ?? null)}
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          >
                            <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                            View
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-1">
                          {isAdmin && (exp.status || "pending") === "pending" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={actionExpId === exp.id}
                                onClick={() => handleApproveExpense(exp.id)}
                                title="Approve"
                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              >
                                {actionExpId === exp.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={actionExpId === exp.id}
                                onClick={() => handleRejectExpense(exp.id)}
                                title="Reject"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {exp.receipt_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPreviewUrl(exp.receipt_url ?? null)}
                              title="View Receipt"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Receipt Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0">
          <DialogTitle className="sr-only">Receipt Preview</DialogTitle>
          <DialogDescription className="sr-only">Preview of the uploaded receipt file</DialogDescription>
          {previewUrl && (
            isPdf(previewUrl) ? (
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title="Receipt PDF"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-muted/20">
                <img
                  src={previewUrl}
                  alt="Receipt"
                  className="max-w-full max-h-full object-contain rounded-md shadow-sm"
                />
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
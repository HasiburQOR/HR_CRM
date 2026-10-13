import { useEffect, useRef, useState } from "react"
import { Plus, Check, X, UserCircle, Trash2, Eye, Paperclip, Download, FileText } from "lucide-react"
import { leaveService } from "@/services/leave.service"
import type { LeaveAttachment, LeaveRequest } from "@/types"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
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
import { formatDate } from "@/lib/utils"
import { EmployeeSelect } from "@/components/EmployeeSelect"

const statusVariant = (s: string) => {
  const map: Record<string, any> = {
    approved: "success",
    pending: "warning",
    rejected: "destructive",
  }
  return map[s] || "default"
}

const LEAVE_TYPES = ["sick", "vacation", "personal", "maternity", "paternity", "unpaid", "other"]

// Keep in sync with the limits in backend/app/routes/leave.py
const ATTACHMENT_EXTS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"]
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_ATTACHMENTS = 5

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

const canPreview = (contentType: string) => contentType.startsWith("image/") || contentType === "application/pdf"

/** Returns the reason a file can't be attached, or null if it is fine. */
function fileProblem(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
  if (!ATTACHMENT_EXTS.includes(ext)) return `${file.name}: only PDF, image and Word files are allowed`
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name}: file is larger than 10 MB`
  if (file.size === 0) return `${file.name}: file is empty`
  return null
}

export default function Leave() {
  const { user } = useAuth()
  const isEmployee = user?.role === "employee"
  const [rows, setRows] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<Partial<LeaveRequest>>({})
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null)
  const addDocInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const viewing = rows.find((r) => r.id === viewingId) || null

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setLoading(true)
      const res = await leaveService.getAll()
      setRows(Array.isArray(res) ? res : res.data || [])
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setForm({})
    setFiles([])
    setDialogOpen(true)
  }

  /** Validates picked files and returns the ones that fit within `room` remaining slots. */
  function acceptFiles(picked: File[], room: number): File[] {
    const accepted: File[] = []
    for (const file of picked) {
      const problem = fileProblem(file)
      if (problem) {
        toast({ title: "File not added", description: problem, variant: "destructive" })
      } else if (accepted.length >= room) {
        toast({ title: "File not added", description: `At most ${MAX_ATTACHMENTS} documents per request`, variant: "destructive" })
        break
      } else {
        accepted.push(file)
      }
    }
    return accepted
  }

  function pickFormFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || [])
    e.target.value = ""
    setFiles((prev) => [...prev, ...acceptFiles(picked, MAX_ATTACHMENTS - prev.length)])
  }

  async function submitForm() {
    try {
      setSubmitting(true)
      const created = await leaveService.create(form)
      const failed: string[] = []
      for (const file of files) {
        try {
          await leaveService.uploadAttachment(created.id, file)
        } catch (e: any) {
          failed.push(`${file.name} (${e?.message || "upload failed"})`)
        }
      }
      if (failed.length) {
        toast({
          title: "Request created, but some documents failed",
          description: `${failed.join(", ")}. Open the request to add them again.`,
          variant: "destructive",
        })
      } else {
        toast({ title: "Created", variant: "success" })
      }
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  async function approve(id: string) {
    try {
      await leaveService.approve(id)
      toast({ title: "Approved", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function reject(id: string) {
    try {
      await leaveService.reject(id)
      toast({ title: "Rejected", variant: "destructive" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function deleteLeave(id: string) {
    try {
      await leaveService.delete(id)
      toast({ title: "Request deleted", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function addDocuments(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || [])
    e.target.value = ""
    if (!viewing) return
    const accepted = acceptFiles(picked, MAX_ATTACHMENTS - (viewing.attachments?.length || 0))
    if (!accepted.length) return
    setUploading(true)
    for (const file of accepted) {
      try {
        await leaveService.uploadAttachment(viewing.id, file)
      } catch (err: any) {
        toast({ title: `Could not upload ${file.name}`, description: err?.message, variant: "destructive" })
      }
    }
    setUploading(false)
    load()
  }

  async function openAttachment(leaveId: string, att: LeaveAttachment, mode: "view" | "download") {
    try {
      const blob = await leaveService.getAttachmentBlob(leaveId, att.id)
      const url = URL.createObjectURL(blob)
      if (mode === "view") {
        setPreview({ url, type: att.content_type, name: att.original_name })
        return
      }
      const a = document.createElement("a")
      a.href = url
      a.download = att.original_name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e: any) {
      toast({ title: "Could not open document", description: e?.message, variant: "destructive" })
    }
  }

  async function removeAttachment(leaveId: string, att: LeaveAttachment) {
    try {
      await leaveService.deleteAttachment(leaveId, att.id)
      toast({ title: "Document removed", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  const viewingAttachments = viewing?.attachments || []
  const canRemoveDocs = !!viewing && (!isEmployee || viewing.status === "pending")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leave Requests</h2>
          <p className="text-muted-foreground">Approve or reject employee leave requests</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Request</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Leave Request</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Employee</Label>
                {isEmployee ? (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                    <UserCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{user?.full_name || user?.username}</span>
                    <span className="text-xs text-muted-foreground">(Submitted on your behalf)</span>
                  </div>
                ) : (
                  <EmployeeSelect
                    value={form.employee_id}
                    onValueChange={(id) => setForm({ ...form, employee_id: id })}
                    placeholder="Search employee by ID or name..."
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Leave Type</Label>
                <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={form.start_date ? String(form.start_date).slice(0, 10) : ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={form.end_date ? String(form.end_date).slice(0, 10) : ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea value={form.reason || ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Supporting Documents <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                <Input type="file" multiple accept={ATTACHMENT_EXTS.join(",")} onChange={pickFormFiles} disabled={files.length >= MAX_ATTACHMENTS} />
                <p className="text-xs text-muted-foreground">
                  Medical certificate, prescription or any other proof. PDF, image or Word, up to 10 MB each, max {MAX_ATTACHMENTS} files.
                </p>
                {files.length > 0 && (
                  <ul className="space-y-1">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.size)}</span>
                        <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setFiles(files.filter((_, idx) => idx !== i))}>
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={submitForm} disabled={submitting}>{submitting ? "Submitting..." : "Submit"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Requests ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No requests yet</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{(r as any).employee_name || r.employee_id?.slice(0, 8)}</TableCell>
                  <TableCell className="capitalize">{r.leave_type}</TableCell>
                  <TableCell>{formatDate(r.start_date)}</TableCell>
                  <TableCell>{formatDate(r.end_date)}</TableCell>
                  <TableCell className="max-w-xs">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{r.reason || "—"}</span>
                      {!!r.attachments?.length && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground" title={`${r.attachments.length} document(s) attached`}>
                          <Paperclip className="h-3.5 w-3.5" />{r.attachments.length}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={statusVariant(r.status || "pending")} className="capitalize">{r.status || "pending"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" title="View full request" onClick={() => setViewingId(r.id)}><Eye className="h-4 w-4" /></Button>
                      {r.status === "pending" && (
                        isEmployee ? (
                          <Button size="sm" variant="ghost" onClick={() => deleteLeave(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => approve(r.id)}><Check className="h-4 w-4 text-emerald-600" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => reject(r.id)}><X className="h-4 w-4 text-destructive" /></Button>
                          </>
                        )
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Full request view */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
            <DialogDescription className="sr-only">Full reason and supporting documents for this leave request</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Employee</p>
                  <p className="font-medium">{viewing.employee_name || viewing.employee_id?.slice(0, 8)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={statusVariant(viewing.status || "pending")} className="capitalize">{viewing.status || "pending"}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Leave Type</p>
                  <p className="font-medium capitalize">{viewing.leave_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dates</p>
                  <p className="font-medium">{formatDate(viewing.start_date)} → {formatDate(viewing.end_date)}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Reason</p>
                <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap break-words">
                  {viewing.reason || "No reason provided"}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Supporting Documents ({viewingAttachments.length})</p>
                  {viewingAttachments.length < MAX_ATTACHMENTS && (
                    <>
                      <input ref={addDocInputRef} type="file" multiple hidden accept={ATTACHMENT_EXTS.join(",")} onChange={addDocuments} />
                      <Button size="sm" variant="outline" disabled={uploading} onClick={() => addDocInputRef.current?.click()}>
                        <Paperclip className="mr-2 h-4 w-4" /> {uploading ? "Uploading..." : "Add document"}
                      </Button>
                    </>
                  )}
                </div>
                {viewingAttachments.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">No documents attached</p>
                ) : (
                  <ul className="space-y-1">
                    {viewingAttachments.map((att) => (
                      <li key={att.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate" title={att.original_name}>{att.original_name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatSize(att.size)}</span>
                        {canPreview(att.content_type) && (
                          <Button size="sm" variant="ghost" title="View" onClick={() => openAttachment(viewing.id, att, "view")}><Eye className="h-4 w-4" /></Button>
                        )}
                        <Button size="sm" variant="ghost" title="Download" onClick={() => openAttachment(viewing.id, att, "download")}><Download className="h-4 w-4" /></Button>
                        {canRemoveDocs && (
                          <Button size="sm" variant="ghost" title="Remove" onClick={() => removeAttachment(viewing.id, att)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewingId(null)}>Close</Button>
            {viewing?.status === "pending" && !isEmployee && (
              <>
                <Button variant="destructive" onClick={() => reject(viewing.id)}><X className="mr-2 h-4 w-4" /> Reject</Button>
                <Button onClick={() => approve(viewing.id)}><Check className="mr-2 h-4 w-4" /> Approve</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document preview */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0">
          <DialogTitle className="sr-only">Document Preview</DialogTitle>
          <DialogDescription className="sr-only">{preview?.name}</DialogDescription>
          {preview && (
            preview.type === "application/pdf" ? (
              <iframe src={preview.url} className="w-full h-full border-0" title={preview.name} />
            ) : (
              <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-muted/20">
                <img src={preview.url} alt={preview.name} className="max-w-full max-h-full object-contain rounded-md shadow-sm" />
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

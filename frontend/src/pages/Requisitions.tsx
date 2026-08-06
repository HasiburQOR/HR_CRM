import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  Plus,
  Download,
  Eye,
  Lock,
  Loader2,
  Search,
  Inbox,
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
import { useToast } from "@/components/ui/useToast"
import { requisitionService } from "@/services/requisition.service"
import type { Requisition } from "@/types"

export default function Requisitions() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [data, setData] = useState<Requisition[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

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
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Requisition
            </Button>
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
                                title="View"
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
                              {r.status === "open" && (
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
    </div>
  )
}
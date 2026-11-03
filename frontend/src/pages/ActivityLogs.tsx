import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { ChevronLeft, ChevronRight, Eye, History, Search, X } from "lucide-react"
import { activityLogService } from "@/services/activity-log.service"
import type { ActivityLog } from "@/types"
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/useToast"
import { formatDateTime } from "@/lib/utils"

const PAGE_SIZE = 50

function actionVariant(action?: string): "success" | "info" | "destructive" | "warning" | "outline" {
  const a = (action || "").toLowerCase()
  if (a.includes("delet") || a.includes("reject")) return "destructive"
  if (a.includes("unlock") || a.includes("permission") || a.includes("restor")) return "warning"
  if (a.includes("updat") || a.includes("chang") || a.includes("toggl")) return "info"
  if (a.includes("creat") || a.includes("check") || a.includes("approv") || a.includes("logged") || a.includes("added") || a.includes("submit")) return "success"
  return "outline"
}

function prettyField(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
}

function prettyValue(value: any): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function Who({ r }: { r: ActivityLog }) {
  if (!r.username) return <span className="text-muted-foreground">System / not signed in</span>
  return (
    <div className="leading-tight">
      <div className="font-medium">{r.employee_name || r.full_name || r.username}</div>
      <div className="text-xs text-muted-foreground font-mono">
        @{r.username}{r.employee_id ? ` · ${r.employee_id}` : ""}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {children}
    </div>
  )
}

function KeyValues({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,max-content)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-all">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function LogDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [log, setLog] = useState<ActivityLog | null>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!id) return
    setLog(null)
    setLoading(true)
    activityLogService
      .getById(id)
      .then(setLog)
      .catch((e: any) => toast({ title: "Failed to load log", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false))
  }, [id])

  const meta = log?.meta
  const changes = meta?.changes ? Object.entries(meta.changes) : []

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{log?.action || "Activity details"}</DialogTitle>
          <DialogDescription>
            {log?.created_at ? `${formatDateTime(log.created_at)} (Bangladesh time)` : loading ? "Loading..." : ""}
          </DialogDescription>
        </DialogHeader>

        {log && (
          <div className="space-y-6">
            <Section title="Who">
              <KeyValues
                rows={[
                  ["Account", log.username ? `${log.full_name || log.username} (@${log.username})` : "Not signed in / System"],
                  ["Employee", log.employee_name ? `${log.employee_name} (${log.employee_id})` : "—"],
                  ["IP address", log.ip_address || "—"],
                  ["Device", meta?.user_agent || "—"],
                ]}
              />
            </Section>

            <Section title="What">
              <KeyValues
                rows={[
                  ["Action", <Badge key="a" variant={actionVariant(log.action)}>{log.action}</Badge>],
                  ["Target", meta?.target?.label || "—"],
                  ["Request", meta?.method ? <span key="r" className="font-mono text-xs">{meta.method} {meta.path}</span> : "—"],
                  ["Result", meta?.status_code ? `HTTP ${meta.status_code}${meta.duration_ms != null ? ` · ${meta.duration_ms} ms` : ""}` : "—"],
                ]}
              />
            </Section>

            {changes.length > 0 && (
              <Section title={`Changes (${changes.length})`}>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Before</TableHead>
                        <TableHead>After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {changes.map(([field, c]) => (
                        <TableRow key={field}>
                          <TableCell className="font-medium">{prettyField(field)}</TableCell>
                          <TableCell className="font-mono text-xs text-red-600 break-all">{prettyValue(c.from)}</TableCell>
                          <TableCell className="font-mono text-xs text-green-600 break-all">{prettyValue(c.to)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Section>
            )}

            {meta?.record && (
              <Section title={meta.change_type === "created" ? "Record created" : "Record after this action"}>
                <div className="rounded-md border p-3">
                  <KeyValues rows={Object.entries(meta.record).filter(([k]) => k !== "id").map(([k, v]) => [prettyField(k), prettyValue(v)])} />
                </div>
              </Section>
            )}

            {meta?.request != null && (
              <Section title="Data sent (passwords hidden)">
                <pre className="text-xs font-mono bg-muted/50 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {typeof meta.request === "string" ? meta.request : JSON.stringify(meta.request, null, 2)}
                </pre>
              </Section>
            )}

            <Section title="Log text">
              <p className="text-xs font-mono bg-muted/50 rounded p-3 whitespace-pre-wrap break-all">{log.details}</p>
              {!meta && (
                <p className="text-xs text-muted-foreground">
                  This entry was recorded before detailed logging was added, so only the log text is available.
                </p>
              )}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function ActivityLogs() {
  const [rows, setRows] = useState<ActivityLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [filters, setFilters] = useState({ search: "", date_from: "", date_to: "" })
  const [viewId, setViewId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    load()
  }, [page, filters])

  async function load() {
    try {
      setLoading(true)
      const res = await activityLogService.getAll({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: filters.search || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
      })
      setRows(res.data || [])
      setTotal(res.total || 0)
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  function applyFilters(e: FormEvent) {
    e.preventDefault()
    setPage(1)
    setFilters({ search: search.trim(), date_from: dateFrom, date_to: dateTo })
  }

  function clearFilters() {
    setSearch("")
    setDateFrom("")
    setDateTo("")
    setPage(1)
    setFilters({ search: "", date_from: "", date_to: "" })
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = !!(filters.search || filters.date_from || filters.date_to)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Activity Logs</h2>
        <p className="text-muted-foreground">Audit trail of all system actions — who did what, to which record, and what changed</p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              {total} event{total === 1 ? "" : "s"}{hasFilters ? " match your filters" : ""}. Times are Bangladesh time. Click the eye icon to see full details.
            </CardDescription>
          </div>
          <History className="h-6 w-6 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px] space-y-1">
              <label className="text-xs text-muted-foreground">Search</label>
              <Input
                placeholder="Name, username, action, employee ID, IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <Button type="submit"><Search className="h-4 w-4 mr-1" />Apply</Button>
            {hasFilters && (
              <Button type="button" variant="ghost" onClick={clearFilters}><X className="h-4 w-4 mr-1" />Clear</Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No activity logs found.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setViewId(r.id)}>
                  <TableCell className="whitespace-nowrap text-muted-foreground font-mono text-xs">
                    {r.created_at ? formatDateTime(r.created_at) : "—"}
                  </TableCell>
                  <TableCell><Who r={r} /></TableCell>
                  <TableCell>
                    <Badge variant={actionVariant(r.action)}>{r.action || "—"}</Badge>
                    {r.change_count ? (
                      <span className="ml-2 text-xs text-muted-foreground">{r.change_count} field{r.change_count === 1 ? "" : "s"} changed</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm max-w-xs truncate" title={r.target?.label || r.details || ""}>
                    {r.target?.label || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.ip_address || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="View full details"
                      onClick={(e) => { e.stopPropagation(); setViewId(r.id) }}
                    >
                      <Eye className="h-4 w-4 text-blue-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <LogDetail id={viewId} onClose={() => setViewId(null)} />
    </div>
  )
}

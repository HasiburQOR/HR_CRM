import { useEffect, useState } from "react"
import { History } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/useToast"
import { formatDateTime } from "@/lib/utils"

const ACTION_COLOR: Record<string, any> = {
  create: "success",
  update: "info",
  delete: "destructive",
  login: "success",
  logout: "secondary",
}

export default function ActivityLogs() {
  const [rows, setRows] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setLoading(true)
      const res = await activityLogService.getAll({ limit: 200 })
      setRows(Array.isArray(res) ? res : res.data || [])
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Activity Logs</h2>
        <p className="text-muted-foreground">Audit trail of all system actions</p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Showing up to the last 200 events from the audit log.
            </CardDescription>
          </div>
          <History className="h-6 w-6 text-muted-foreground" />
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead className="max-w-md">Details</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No activity logs yet.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {r.timestamp || r.created_at ? formatDateTime(r.timestamp || r.created_at) : "—"}
                  </TableCell>
                  <TableCell>
                    {(r as any).user_name || r.user_id ? (
                      <span className="font-mono text-xs">{(r as any).user_name || r.user_id?.slice(0, 12)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_COLOR[r.action?.toLowerCase() || ""] || "outline"} className="capitalize">
                      {r.action || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.entity_type ? <span className="capitalize">{r.entity_type}</span> : "—"}
                    {r.entity_id ? <span className="text-muted-foreground ml-2">#{r.entity_id.slice(0, 8)}</span> : null}
                  </TableCell>
                  <TableCell className="max-w-md">
                    {r.details ? (
                      <pre className="text-xs font-mono truncate opacity-70 bg-muted/50 rounded px-2 py-1 inline-block max-w-full align-middle">
                        {typeof r.details === "string" ? r.details : JSON.stringify(r.details)}
                      </pre>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.ip_address || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

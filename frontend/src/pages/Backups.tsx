import { useEffect, useState, useRef } from "react"
import { DatabaseBackup, Download, RefreshCw, Trash2, Upload, Play } from "lucide-react"
import { backupService } from "@/services/backup.service"
import type { Backup } from "@/types"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/useToast"
import { formatDateTime } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const STATUS_VARIANT: Record<string, any> = {
  completed: "success",
  in_progress: "info",
  pending: "warning",
  failed: "destructive",
}

export default function Backups() {
  const [rows, setRows] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [restoreId, setRestoreId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setLoading(true)
      const res = await backupService.getAll()
      setRows(Array.isArray(res) ? res : res.data || [])
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function create() {
    try {
      setCreating(true)
      await backupService.create()
      toast({ title: "Backup created", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  async function doRestore(id: string) {
    try {
      await backupService.restore(id)
      toast({ title: "Database restored", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Restore failed", description: e?.message, variant: "destructive" })
    } finally {
      setRestoreId(null)
    }
  }

  async function doDelete(id: string) {
    try {
      await backupService.delete(id)
      toast({ title: "Deleted", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    } finally {
      setDeleteId(null)
    }
  }

  async function handleDownload(id: string) {
    try {
      await backupService.download(id)
      toast({ title: "Download started", variant: "success" })
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message, variant: "destructive" })
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await backupService.importAndRestore(file)
      toast({ title: "Imported and restored", variant: "success" })
      load()
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message, variant: "destructive" })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Backups</h2>
          <p className="text-muted-foreground">Create, restore, download, and import database backups</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Import &amp; Restore
          </Button>
          <input ref={fileInputRef} type="file" accept=".db,.sql,.sqlite,.zip" className="hidden" onChange={handleImport} />
          <Button onClick={create} disabled={creating}>
            <DatabaseBackup className="mr-2 h-4 w-4" /> {creating ? "Creating..." : "Create Backup"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Total Backups</CardTitle>
              <CardDescription>Stored locally on server</CardDescription>
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{rows.length}</div></CardContent>
        </Card>
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Latest Backup</CardTitle>
              <CardDescription>Most recent snapshot</CardDescription>
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">
            {rows[0] ? formatDateTime(rows[0].created_at) : "—"}
          </div></CardContent>
        </Card>
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">Storage Usage</CardTitle>
              <CardDescription>SQLite database</CardDescription>
            </div>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">
            {rows[0]?.file_size ? `${(rows[0].file_size / 1024).toFixed(1)} KB` : "—"}
          </div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Backup History</CardTitle>
            <div className="text-xs text-muted-foreground">
              <Label className="flex items-center gap-1.5 cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                Import .db/.sql/.zip to auto-restore
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Backup ID</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No backups yet — click "Create Backup" to start.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.id.slice(0, 12)}...</TableCell>
                  <TableCell className="font-mono text-xs">{r.file_name || "—"}</TableCell>
                  <TableCell>{r.file_size ? `${(r.file_size / 1024).toFixed(1)} KB` : "—"}</TableCell>
                  <TableCell>{r.created_at ? formatDateTime(r.created_at) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status || "completed"] || "secondary"} className="capitalize">
                      {r.status?.replace("_", " ") || "completed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => handleDownload(r.id)} title="Download">
                        <Download className="h-4 w-4" />
                      </Button>
                      <AlertDialog open={restoreId === r.id} onOpenChange={(o) => !o && setRestoreId(null)}>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => setRestoreId(r.id)} title="Restore">
                            <Play className="h-4 w-4 text-sky-600" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will replace the current database with the backup. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => doRestore(r.id)} className="bg-sky-600 hover:bg-sky-700">
                              <RefreshCw className="mr-2 h-4 w-4" /> Restore
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <AlertDialog open={deleteId === r.id} onOpenChange={(o) => !o && setDeleteId(null)}>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)} title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete this backup?</AlertDialogTitle></AlertDialogHeader>
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

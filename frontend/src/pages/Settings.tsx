import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Settings as SettingsIcon } from "lucide-react"
import { settingsService } from "@/services/settings.service"
import type { Setting } from "@/types"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/useToast"
import { formatDateTime } from "@/lib/utils"

export default function Settings() {
  const [rows, setRows] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Setting>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setLoading(true)
      const res = await settingsService.getAll()
      setRows(Array.isArray(res) ? res : res.data || [])
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setEditingId(null)
    setForm({})
    setDialogOpen(true)
  }

  function openEdit(s: Setting) {
    setEditingId(s.id)
    setForm(s)
    setDialogOpen(true)
  }

  async function submitForm() {
    try {
      if (editingId) {
        await settingsService.update(editingId, form)
        toast({ title: "Updated", variant: "success" })
      } else {
        await settingsService.create(form)
        toast({ title: "Created", variant: "success" })
      }
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  async function doDelete(id: string) {
    try {
      await settingsService.delete(id)
      toast({ title: "Deleted", variant: "success" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">Global application key-value configuration</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Setting</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Edit Setting" : "New Setting"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input value={form.key || ""} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="e.g. APP_NAME" />
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input value={form.value || ""} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={submitForm}>{editingId ? "Update" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm">System Settings</CardTitle>
              <CardDescription>Stored in `settings` table</CardDescription>
            </div>
            <SettingsIcon className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
            <p className="text-sm text-muted-foreground">configured keys</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">All Settings</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No settings yet.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm"><Badge variant="outline">{r.key}</Badge></TableCell>
                  <TableCell className="font-mono text-xs truncate max-w-xs" title={r.value}>{r.value}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{r.description || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.updated_at || r.created_at ? formatDateTime(r.updated_at || r.created_at) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog open={deleteId === r.id} onOpenChange={(o) => !o && setDeleteId(null)}>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete setting?</AlertDialogTitle></AlertDialogHeader>
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

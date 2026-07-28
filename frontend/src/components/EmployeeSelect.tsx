import { useMemo, useState, useEffect } from "react"
import { Search, ChevronDown, UserRound, X } from "lucide-react"
import type { Employee } from "@/types"
import { employeeService } from "@/services/employee.service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/useToast"

export interface EmployeeSelectProps {
  value?: string
  onValueChange: (id: string, employee?: Employee) => void
  placeholder?: string
  employees?: Employee[]
  className?: string
  disabled?: boolean
  includeInactive?: boolean
}

function displayName(e: Employee): string {
  const name =
    e.full_name ||
    [e.first_name, e.last_name].filter(Boolean).join(" ") ||
    e.email ||
    "(Unknown)"
  return name
}

function stripLeadingZeros(s: string): string {
  if (!s) return s
  const onlyDigits = /^\d+$/.test(s)
  return onlyDigits ? s.replace(/^0+/, "") || "0" : s
}

function idSearchScore(e: Employee, rawQuery: string): number {
  const q = rawQuery.trim()
  if (!q) return 0
  const id = (e.employee_id || "").toString()
  if (!id) return 0

  const qLow = q.toLowerCase()
  const idLow = id.toLowerCase()
  const idNumOnly = id.replace(/\D/g, "")
  const qNumOnly = q.replace(/\D/g, "")
  const idNoLead0 = stripLeadingZeros(idNumOnly)
  const qNoLead0 = stripLeadingZeros(qNumOnly)

  let score = 0
  if (idLow === qLow) score += 1000
  if (idNumOnly && qNumOnly === idNumOnly) score += 900
  if (idNoLead0 && qNoLead0 && qNoLead0 === idNoLead0) score += 850
  if (idNumOnly && qNumOnly && idNumOnly.endsWith(qNumOnly)) score += 700
  if (idLow.startsWith(qLow)) score += 650
  if (idNoLead0 && qNoLead0 && idNoLead0.startsWith(qNoLead0)) score += 600
  if (idNumOnly && qNumOnly && idNumOnly.includes(qNumOnly)) score += 500
  if (idLow.includes(qLow)) score += 400
  if (idNumOnly && qNumOnly && idNoLead0.includes(qNoLead0)) score += 300

  return score
}

function nameSearchScore(e: Employee, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return 0
  const fields = [
    e.full_name,
    e.first_name,
    e.last_name,
    e.email,
    e.nid,
    e.department,
    e.designation,
    e.job_title,
    e.phone,
  ].map((x) => (x ? String(x).toLowerCase() : ""))

  let score = 0
  const full = fields.join(" | ")
  const fullName = fields.slice(0, 3).filter(Boolean).join(" ")
  if (fullName === q) score += 350
  if (fields.some((f) => f === q)) score += 300
  if (fullName.startsWith(q)) score += 200
  if (fields.some((f) => f && f.startsWith(q))) score += 150
  if (full.includes(q)) score += 50

  return score
}

function rankAndFilter(employees: Employee[], query: string): { employee: Employee; score: number }[] {
  const q = query.trim()
  if (!q) {
    return employees.map((employee) => ({ employee, score: 0 }))
  }
  const out: { employee: Employee; score: number }[] = []
  for (const e of employees) {
    const s1 = idSearchScore(e, q)
    const s2 = nameSearchScore(e, q)
    const total = s1 + s2
    if (total > 0) out.push({ employee: e, score: total })
  }
  out.sort((a, b) => b.score - a.score)
  return out
}

export function EmployeeSelect({
  value,
  onValueChange,
  placeholder = "Select employee...",
  employees: external,
  className,
  disabled,
  includeInactive = false,
}: EmployeeSelectProps) {
  const { toast } = useToast()
  const [query, setQuery] = useState("")
  const [internal, setInternal] = useState<Employee[]>(external || [])
  const [loading, setLoading] = useState(!external)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (external && external.length) {
      setInternal(external)
      setLoading(false)
      return
    }
    let canceled = false
    ;(async () => {
      try {
        setLoading(true)
        if (includeInactive) {
          const res = await employeeService.getAll({ limit: 500 })
          const rows = Array.isArray(res) ? res : (res as any).data || []
          if (!canceled) setInternal(rows)
        } else {
          try {
            const rows = await employeeService.getActive()
            if (!canceled) setInternal(rows)
          } catch {
            const res = await employeeService.getAll({ limit: 500 })
            const rows = Array.isArray(res) ? res : (res as any).data || []
            if (!canceled) setInternal(rows)
          }
        }
      } catch (e: any) {
        toast({ title: "Failed to load employees", description: e?.message, variant: "destructive" })
      } finally {
        if (!canceled) setLoading(false)
      }
    })()
    return () => {
      canceled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external, includeInactive])

  const ranked = useMemo(() => rankAndFilter(internal, query), [internal, query])
  const filtered = useMemo(() => ranked.map((r) => r.employee), [ranked])
  const topMatch = useMemo(() => (ranked.length ? ranked[0] : null), [ranked])

  const selected = useMemo(
    () => internal.find((e) => e.id === value) || internal.find((e) => e.employee_id === value),
    [internal, value]
  )

  return (
    <Popover open={disabled ? false : open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate text-left">
              <UserRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">
                {selected.employee_id ? (
                  <Badge variant="outline" className="mr-2 font-mono text-[10px] px-1.5 py-0">
                    {selected.employee_id}
                  </Badge>
                ) : null}
                {displayName(selected)}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2">
              <Search className="h-3.5 w-3.5" />
              {placeholder}
            </span>
          )}
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {selected && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  onValueChange("")
                }}
              />
            )}
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search Employee ID (001, EMP004, 4) or Name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && topMatch && topMatch.score >= 400) {
                  e.preventDefault()
                  onValueChange(topMatch.employee.id, topMatch.employee)
                  setOpen(false)
                  setQuery("")
                }
              }}
              className="pl-9"
            />
          </div>
          {query && topMatch && topMatch.score >= 600 ? (
            <button
              type="button"
              onClick={() => {
                onValueChange(topMatch.employee.id, topMatch.employee)
                setOpen(false)
                setQuery("")
              }}
              className="mt-2 w-full flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700 px-2.5 py-1.5 text-left text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
            >
              <span className="font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">⭐ Best ID match:</span>
              {topMatch.employee.employee_id && (
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 shrink-0">
                  {topMatch.employee.employee_id}
                </Badge>
              )}
              <span className="truncate">{displayName(topMatch.employee)}</span>
              <span className="ml-auto text-muted-foreground shrink-0">Enter ↵</span>
            </button>
          ) : null}
          <div className="text-[11px] mt-1.5 text-muted-foreground">
            {loading
              ? "Loading…"
              : `${filtered.length} match${filtered.length === 1 ? "" : "es"}${query ? ` for "${query}"` : ""} of ${internal.length}${query && filtered.length === 0 && /^\d+$/.test(query.trim()) ? " · Try EMP" + query.trim() : ""}`}
          </div>
        </div>
        <ScrollArea className="max-h-72">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading employees…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No employees found.</div>
          ) : (
            <div className="p-1">
              {ranked.map(({ employee: e, score }) => {
                const isActive = value === e.id || value === e.employee_id
                const strongIdMatch = query.trim() && score >= 600
                return (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => {
                      onValueChange(e.id, e)
                      setOpen(false)
                      setQuery("")
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                      isActive && "bg-accent/50",
                      strongIdMatch && "ring-1 ring-emerald-300 dark:ring-emerald-700 bg-emerald-50/40 dark:bg-emerald-900/10"
                    )}
                  >
                    <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {e.employee_id && (
                          <Badge variant={strongIdMatch ? "default" : "outline"} className={cn("font-mono text-[10px] px-1.5 py-0 shrink-0", strongIdMatch && "bg-emerald-600 hover:bg-emerald-700")}>
                            {e.employee_id}
                          </Badge>
                        )}
                        <span className="truncate font-medium">{displayName(e)}</span>
                        {strongIdMatch && <span className="shrink-0 text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold">ID match</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[e.department, e.designation || e.job_title].filter(Boolean).join(" · ") || e.email || ""}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

export default EmployeeSelect

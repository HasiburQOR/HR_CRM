import { NavLink, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarDays,
  Wallet,
  CalendarClock,
  CheckSquare,
  Bell,
  FileBarChart,
  DatabaseBackup,
  Settings,
  History,
  Receipt,
  Package,
  ClipboardList,
  LogOut,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"

const allNavItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/attendance", label: "Attendance", icon: CalendarClock },
  { to: "/salary", label: "Salary", icon: Wallet },
  { to: "/leave", label: "Leave", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/reminders", label: "Reminders", icon: Bell },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/requisitions", label: "Requisitions", icon: ClipboardList },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/activity-logs", label: "Activity Logs", icon: History },
  { to: "/users", label: "Users", icon: UserCheck },
  { to: "/backups", label: "Backups", icon: DatabaseBackup },
  { to: "/settings", label: "Settings", icon: Settings },
]

const employeeNavItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/attendance", label: "Attendance", icon: CalendarClock },
  { to: "/leave", label: "Leave", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate("/login", { replace: true })
  }

  const isEmployee = user?.role === "employee"
  const navItems = isEmployee ? employeeNavItems : allNavItems

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center px-6">
        <h1 className="text-xl font-bold tracking-tight">HR CRM</h1>
      </div>
      <Separator />
      <ScrollArea className="flex-1 py-2">
        <nav className="flex flex-col gap-1 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive
                    ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                    : "text-muted-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
      <Separator />
      <div className="p-4">
        <div className="mb-3 rounded-lg bg-muted/50 p-3">
          <p className="text-sm font-medium">
            {user?.full_name || user?.username || "User"}
          </p>
          <p className="text-xs text-muted-foreground capitalize">{user?.role || "employee"}</p>
        </div>
        <Button variant="ghost" className="w-full gap-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </div>
    </div>
  )
}

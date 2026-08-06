import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Employees from '@/pages/Employees'
import AttendancePage from '@/pages/Attendance'
import SalaryPage from '@/pages/Salary'
import LeavePage from '@/pages/Leave'
import TasksPage from '@/pages/Tasks'
import RemindersPage from '@/pages/Reminders'
import ReportsPage from '@/pages/Reports'
import BackupsPage from '@/pages/Backups'
import SettingsPage from '@/pages/Settings'
import ActivityLogsPage from '@/pages/ActivityLogs'
import UsersPage from '@/pages/Users'
import ExpensesPage from '@/pages/Expenses'
import InventoryPage from '@/pages/Inventory'
import RequisitionsPage from '@/pages/Requisitions'
import RequisitionDetailPage from '@/pages/RequisitionDetail'
import { useAuth } from '@/contexts/AuthContext'

function EmployeeRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.role && user.role !== 'employee') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.role === 'employee') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route
              path="employees"
              element={
                <AdminRoute>
                  <Employees />
                </AdminRoute>
              }
            />
            <Route
              path="attendance"
              element={
                <ProtectedRoute>
                  <AttendancePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="salary"
              element={
                <AdminRoute>
                  <SalaryPage />
                </AdminRoute>
              }
            />
            <Route
              path="leave"
              element={
                <ProtectedRoute>
                  <LeavePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="tasks"
              element={
                <ProtectedRoute>
                  <TasksPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="reminders"
              element={
                <AdminRoute>
                  <RemindersPage />
                </AdminRoute>
              }
            />
            <Route
              path="reports"
              element={
                <AdminRoute>
                  <ReportsPage />
                </AdminRoute>
              }
            />
            <Route
              path="backups"
              element={
                <AdminRoute>
                  <BackupsPage />
                </AdminRoute>
              }
            />
            <Route
              path="settings"
              element={
                <AdminRoute>
                  <SettingsPage />
                </AdminRoute>
              }
            />
            <Route
              path="activity-logs"
              element={
                <AdminRoute>
                  <ActivityLogsPage />
                </AdminRoute>
              }
            />
            <Route
              path="users"
              element={
                <AdminRoute>
                  <UsersPage />
                </AdminRoute>
              }
            />
            <Route
              path="expenses"
              element={
                <AdminRoute>
                  <ExpensesPage />
                </AdminRoute>
              }
            />
            <Route
              path="inventory"
              element={
                <AdminRoute>
                  <InventoryPage />
                </AdminRoute>
              }
            />
            <Route
              path="requisitions"
              element={
                <AdminRoute>
                  <RequisitionsPage />
                </AdminRoute>
              }
            />
            <Route
              path="requisitions/:id"
              element={
                <AdminRoute>
                  <RequisitionDetailPage />
                </AdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <Toaster />
      </TooltipProvider>
    </AuthProvider>
  )
}

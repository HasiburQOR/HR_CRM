import { useState, useEffect, FormEvent } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"

export default function Login() {
  const [loginMethod, setLoginMethod] = useState<"username" | "employee_id">("username")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/"

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, navigate, from])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (loginMethod === "employee_id") {
        await login({ employee_id: identifier, password })
      } else {
        await login({ username: identifier, password })
      }
      toast({ title: "Login successful", description: "Welcome to HR CRM", variant: "success" })
      navigate(from, { replace: true })
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Invalid credentials"
      toast({ title: "Login failed", description: msg, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">HR CRM</CardTitle>
          <CardDescription>Enter your credentials to access the dashboard</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">
                {loginMethod === "employee_id" ? "Employee ID" : "Username or Email"}
              </Label>
              <Input
                id="identifier"
                type="text"
                autoComplete={loginMethod === "employee_id" ? "off" : "username"}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={loginMethod === "employee_id" ? "EMP001" : "admin"}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={loginMethod === "username" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setLoginMethod("username")}
              >
                Username / Email
              </Button>
              <Button
                type="button"
                variant={loginMethod === "employee_id" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setLoginMethod("employee_id")}
              >
                Employee ID
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

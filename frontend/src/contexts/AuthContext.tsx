import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import api from "@/lib/axios"
import type { User, AuthState, ApiResponse } from "@/types"

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"))
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("user")
    if (stored) {
      try {
        return JSON.parse(stored) as User
      } catch {
        return null
      }
    }
    return null
  })
  const [loading, setLoading] = useState(false)

  const login = useCallback(async (arg0: string | { username?: string; email?: string; employee_id?: string; password: string }, maybePassword?: string) => {
    setLoading(true)
    try {
      let username: string | undefined
      let email: string | undefined
      let employee_id: string | undefined
      let password: string

      if (typeof arg0 === "string") {
        username = arg0.includes("@") ? undefined : arg0
        email = arg0.includes("@") ? arg0 : undefined
        password = maybePassword as string
      } else {
        username = arg0.username
        email = arg0.email
        employee_id = arg0.employee_id
        password = arg0.password
      }

      const payload: any = { password }
      if (username) payload.username = username
      if (email) payload.email = email
      if (employee_id) payload.employee_id = employee_id
      if (!payload.username && !payload.email && !payload.employee_id) payload.username = arg0 as string

      const response = await api.post<ApiResponse<{ token: string; user: User }>>("/auth/login", payload)
      const result = response.data
      let data: { token: string; user: User }
      if ("data" in result && result.data && "token" in (result.data as any)) {
        data = result.data as { token: string; user: User }
      } else if ("token" in (result as any)) {
        data = result as unknown as { token: string; user: User }
      } else {
        throw new Error("Invalid response from server")
      }
      setToken(data.token)
      setUser(data.user)
      localStorage.setItem("token", data.token)
      localStorage.setItem("user", JSON.stringify(data.user))
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || "Login failed"
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem("token")
    localStorage.removeItem("user")
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem("token")
    const storedUser = localStorage.getItem("user")
    if (!stored && storedUser) {
      localStorage.removeItem("user")
      setUser(null)
    }
  }, [])

  const value: AuthState = {
    token,
    user,
    isAuthenticated: !!token && !!user,
    login,
    logout,
    loading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

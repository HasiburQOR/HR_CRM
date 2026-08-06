import axios, { AxiosInstance, AxiosError } from "axios"

const rawBase = import.meta.env.VITE_API_URL as string | undefined
const defaultBase = "/api"
const baseURL = rawBase && rawBase.trim() ? rawBase.replace(/\/$/, "") : defaultBase

const api: AxiosInstance = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token")
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // Let axios auto-set Content-Type for FormData (multipart/form-data with boundary)
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"]
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    return response
  },
  (error: AxiosError) => {
    // Extract FastAPI detail message so e.message shows useful info
    const detail = (error.response?.data as any)?.detail
    if (detail && typeof detail === "string") {
      error.message = detail
    }
    // Only auto-redirect on 401 if NOT on the login page
    // (wrong password on login should just show the error, not clear storage)
    if (error.response?.status === 401 && window.location.pathname !== "/login") {
      localStorage.removeItem("token")
      localStorage.removeItem("user")
      window.location.href = "/login"
    }
    return Promise.reject(error)
  }
)

export default api

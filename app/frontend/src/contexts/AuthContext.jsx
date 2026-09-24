import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi } from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me()
      setUser(me)
      return me
    } catch {
      setUser(null)
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Cookie HttpOnly session — always restore via /me
      await refresh()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const login = useCallback(async (username, password) => {
    const data = await authApi.login(username, password)
    // Ignore access_token if BE still returns it — cookie carries session
    if (data?.user) {
      setUser(data.user)
      return data.user
    }
    const me = await authApi.me()
    setUser(me)
    return me
  }, [])

  const register = useCallback(async (payload) => {
    const data = await authApi.register(payload)
    // Ignore access_token if present — cookie-only
    if (data?.user) {
      setUser(data.user)
      return data.user
    }
    const me = await authApi.me()
    setUser(me)
    return me
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      /* ignore */
    }
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refresh,
    }),
    [user, loading, login, register, logout, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError } from '../../api/client'
import { fetchConfig, previewConfig, saveConfig } from '../../api/endpoints'
import type { AdminConfig, ConfigDiff, ConfigGroup } from '../../api/types'

const clone = (c: AdminConfig): AdminConfig => JSON.parse(JSON.stringify(c))

export function useConfigForm() {
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [diff, setDiff] = useState<ConfigDiff | null>(null)
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // 上次保存的快照，reset 用它回退
  const saved = useRef<AdminConfig | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchConfig()
      saved.current = clone(res.config)
      setConfig(clone(res.config))
      setUpdatedBy(res.updated_by)
      setUpdatedAt(res.updated_at)
      setDirty(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '出了点问题，请稍后再试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const setField = useCallback(
    <G extends ConfigGroup, K extends keyof AdminConfig[G]>(
      group: G, key: K, value: AdminConfig[G][K],
    ) => {
      setConfig((prev) =>
        prev ? { ...prev, [group]: { ...prev[group], [key]: value } } : prev)
      setDirty(true)
      // 用户开始改这个字段，就把它上次的错误消掉
      setFieldErrors((prev) => {
        const path = `${group}.${String(key)}`
        if (!(path in prev)) return prev
        const next = { ...prev }
        delete next[path]
        return next
      })
    },
    [],
  )

  const preview = useCallback(async () => {
    if (!config) return
    setError(null)
    try {
      const res = await previewConfig(config)
      if (res.valid) {
        setFieldErrors({})
        setDiff(res)
      } else {
        // 校验不过就不弹确认窗，把错误摊到字段旁边
        setDiff(null)
        setFieldErrors(Object.fromEntries(res.errors.map((e) => [e.field, e.message])))
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '出了点问题，请稍后再试')
    }
  }, [config])

  const save = useCallback(async () => {
    if (!config) return
    setSaving(true)
    setError(null)
    try {
      const res = await saveConfig(config)
      saved.current = clone(res.config)
      setConfig(clone(res.config))
      setUpdatedBy(res.updated_by)
      setUpdatedAt(res.updated_at)
      setDirty(false)
      setDiff(null)
      setFieldErrors({})
    } catch (e) {
      // 刻意不清空 config：保存失败时把用户刚打的字弄丢是最惹人烦的一种 bug
      setError(e instanceof ApiError ? e.message : '出了点问题，请稍后再试')
      throw e
    } finally {
      setSaving(false)
    }
  }, [config])

  const reset = useCallback(() => {
    if (saved.current) setConfig(clone(saved.current))
    setDirty(false)
    setDiff(null)
    setFieldErrors({})
  }, [])

  const dismissDiff = useCallback(() => setDiff(null), [])

  return {
    config, loading, saving, error, fieldErrors, diff, dirty,
    updatedBy, updatedAt,
    setField, preview, save, reset, reload: load, dismissDiff,
  }
}

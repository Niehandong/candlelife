import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '../../api/client'
import { fetchArt } from '../../api/endpoints'
import type { ArtItem, ArtStatus } from '../../api/types'

export const PAGE_SIZE = 20

export function useArtList() {
  const [items, setItems] = useState<ArtItem[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<ArtStatus | ''>('')
  const [q, setQ] = useState('')

  const load = useCallback(async (targetPage: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchArt(status, q, targetPage, PAGE_SIZE)
      setItems(res.items)
      setTotal(res.total)
      setPages(res.pages)
      setPage(res.page)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '出了点问题，请稍后再试')
    } finally {
      setLoading(false)
    }
  }, [status, q])

  // 改筛选或搜索时回到第 1 页 —— 停在第 5 页而新结果只有 2 页会看到空列表
  useEffect(() => {
    // 搜索输入防抖 250ms，避免每敲一个字打一次请求
    const timer = setTimeout(() => { void load(1) }, q ? 250 : 0)
    return () => clearTimeout(timer)
  }, [load, q])

  /** 重新拉当前页。删掉本页最后一条时往前退一页，否则会停在空页上。 */
  const reload = useCallback(async () => {
    const lastItemOnPage = items.length === 1 && page > 1
    await load(lastItemOnPage ? page - 1 : page)
  }, [load, items.length, page])

  const goTo = useCallback((p: number) => {
    if (p < 1 || (pages > 0 && p > pages)) return
    void load(p)
  }, [load, pages])

  return {
    items, total, pages, page, loading, error,
    status, setStatus, q, setQ,
    reload, goTo,
  }
}

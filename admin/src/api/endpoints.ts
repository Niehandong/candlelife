import { request } from './client'
import type {
  AdminConfig, AdminConfigResponse, AdminMe, ArtCreate, ArtItem, ArtListResponse,
  ArtStatus, ArtUpdate, ConfigDiff, TokenResponse,
} from './types'

const BASE = '/api/v1/admin'

export const login = (username: string, password: string) =>
  request<TokenResponse>(`${BASE}/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const fetchMe = () => request<AdminMe>(`${BASE}/me`)

/** 改自己的密码。成功后【当前 token 也失效】，调用方要引导重新登录。 */
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>(`${BASE}/password`, {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  })

export const fetchConfig = () => request<AdminConfigResponse>(`${BASE}/config`)

export const previewConfig = (config: AdminConfig) =>
  request<ConfigDiff>(`${BASE}/config?dry_run=true`, {
    method: 'PUT',
    body: JSON.stringify(config),
  })

export const saveConfig = (config: AdminConfig) =>
  request<AdminConfigResponse>(`${BASE}/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  })

// 常量而非函数：导出走浏览器下载，但那个请求需要 Authorization 头，
// <a href> 带不了。因此导出按钮必须 fetch 拿到内容再造 Blob（见 ConfigFormShell）。
export const exportConfigUrl = `${BASE}/config/export`

export const fetchArt = (
  status?: ArtStatus | '',
  q?: string,
  page = 1,
  pageSize = 20,
) => {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (q) params.set('q', q)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  return request<ArtListResponse>(`${BASE}/art?${params.toString()}`)
}

export const createArt = (payload: ArtCreate) =>
  request<ArtItem>(`${BASE}/art`, { method: 'POST', body: JSON.stringify(payload) })

export const updateArt = (id: string, payload: ArtUpdate) =>
  request<ArtItem>(`${BASE}/art/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

export const deleteArt = (id: string) =>
  request<void>(`${BASE}/art/${encodeURIComponent(id)}`, { method: 'DELETE' })

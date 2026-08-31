import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../api/client'
import * as endpoints from '../../../api/endpoints'
import { useConfigForm } from '../useConfigForm'
import { cloneFixture } from './fixture'

describe('useConfigForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(endpoints, 'fetchConfig').mockResolvedValue({
      config: cloneFixture(), updated_by: 'alice', updated_at: '2026-08-31T10:00:00Z',
    })
  })

  it('加载后填入配置与最后修改人', async () => {
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.config?.app.name).toBe('烛生')
    expect(result.current.updatedBy).toBe('alice')
  })

  it('改字段后 dirty 变 true', async () => {
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.dirty).toBe(false)
    act(() => result.current.setField('app', 'slogan', '陪你好好睡'))
    expect(result.current.dirty).toBe(true)
    expect(result.current.config?.app.slogan).toBe('陪你好好睡')
  })

  it('preview 提交完整的五组配置，不是只提交当前页那一组', async () => {
    const spy = vi.spyOn(endpoints, 'previewConfig')
      .mockResolvedValue({ changes: [], valid: true, errors: [] })
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setField('app', 'slogan', 'x'))
    await act(async () => { await result.current.preview() })
    const sent = spy.mock.calls[0]![0]
    expect(Object.keys(sent).sort()).toEqual(
      ['app', 'onboarding', 'records', 'ritual', 'schedule'])
  })

  it('校验不过时把错误按字段路径摊平，不弹窗', async () => {
    vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [], valid: false,
      errors: [{ field: 'ritual.tolerance_minutes', message: '不得大于 180' }],
    })
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.preview() })
    expect(result.current.fieldErrors['ritual.tolerance_minutes']).toBe('不得大于 180')
    expect(result.current.diff).toBeNull()
  })

  it('校验通过时把 diff 留给调用方渲染', async () => {
    vi.spyOn(endpoints, 'previewConfig').mockResolvedValue({
      changes: [{ path: 'app.slogan', from: '陪你按时睡觉', to: 'x' }],
      valid: true, errors: [],
    })
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.preview() })
    expect(result.current.diff?.changes).toHaveLength(1)
    expect(result.current.fieldErrors).toEqual({})
  })

  it('save 成功后清掉 dirty 与 diff', async () => {
    vi.spyOn(endpoints, 'saveConfig').mockResolvedValue({
      config: cloneFixture(), updated_by: 'alice', updated_at: '2026-08-31T11:00:00Z',
    })
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setField('app', 'slogan', 'x'))
    await act(async () => { await result.current.save() })
    expect(result.current.dirty).toBe(false)
    expect(result.current.diff).toBeNull()
    expect(result.current.updatedAt).toBe('2026-08-31T11:00:00Z')
  })

  it('save 失败时保留用户的编辑，不把表单清空', async () => {
    vi.spyOn(endpoints, 'saveConfig')
      .mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', '服务器内部错误'))
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setField('app', 'slogan', '别弄丢我'))
    await act(async () => { await result.current.save().catch(() => {}) })
    expect(result.current.config?.app.slogan).toBe('别弄丢我')
    expect(result.current.dirty).toBe(true)
    expect(result.current.error).toContain('服务器内部错误')
  })

  it('reset 把表单退回上次保存的状态', async () => {
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setField('app', 'slogan', 'x'))
    act(() => result.current.reset())
    expect(result.current.config?.app.slogan).toBe('陪你按时睡觉')
    expect(result.current.dirty).toBe(false)
  })

  it('加载失败时给出可读错误，不留空白页', async () => {
    vi.spyOn(endpoints, 'fetchConfig')
      .mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请检查后端是否在运行'))
    const { result } = renderHook(() => useConfigForm())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('网络连接失败')
  })
})

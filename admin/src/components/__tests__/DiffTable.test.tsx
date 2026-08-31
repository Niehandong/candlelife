import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import DiffTable from '../DiffTable'

describe('变动预览表', () => {
  it('列出每一项变动的路径、原值与新值', () => {
    render(
      <DiffTable
        changes={[
          { path: 'ritual.tolerance_minutes', from: 30, to: 15 },
          { path: 'app.slogan', from: '陪你按时睡觉', to: '陪你好好睡' },
        ]}
      />,
    )
    expect(screen.getByText('按时完成容差（分钟）')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('陪你按时睡觉')).toBeInTheDocument()
  })

  it('无变动时明说没有改动', () => {
    render(<DiffTable changes={[]} />)
    expect(screen.getByText('没有改动')).toBeInTheDocument()
  })

  it('数组值渲染成可读的逗号串而不是 [object Object]', () => {
    render(
      <DiffTable
        changes={[{ path: 'ritual.resistance_options', from: ['a', 'b'], to: ['a'] }]}
      />,
    )
    expect(screen.getByText('a、b')).toBeInTheDocument()
    expect(screen.queryByText(/object Object/)).toBeNull()
  })

  it('布尔值渲染成开/关', () => {
    render(
      <DiffTable changes={[{ path: 'app.skip_tonight_enabled', from: true, to: false }]} />,
    )
    expect(screen.getByText('开')).toBeInTheDocument()
    expect(screen.getByText('关')).toBeInTheDocument()
  })

  it('不认识的路径退回显示原始路径，不崩', () => {
    render(<DiffTable changes={[{ path: 'x.y', from: 1, to: 2 }]} />)
    expect(screen.getByText('x.y')).toBeInTheDocument()
  })

  it('容差被改动时给出额外警告——这一项会立刻影响用户的按时判定', () => {
    render(
      <DiffTable changes={[{ path: 'ritual.tolerance_minutes', from: 30, to: 3 }]} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('历史夜记不会被修正')
  })
})

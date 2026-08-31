import { describe, expect, it } from 'vitest'
import { revealWindowOpensAt } from '@/domain/ritual'
import { isEditable } from '../editable'

const TZ = 'Asia/Shanghai'

describe('isEditable', () => {
  it('完成当晚可改', () => {
    expect(isEditable('2026-08-27', new Date('2026-08-27T23:59:00+08:00'), TZ)).toBe(true)
  })

  it('次日 05:59 仍可改', () => {
    expect(isEditable('2026-08-27', new Date('2026-08-28T05:59:00+08:00'), TZ)).toBe(true)
  })

  it('次日 06:00 起固化', () => {
    expect(isEditable('2026-08-27', new Date('2026-08-28T06:00:00+08:00'), TZ)).toBe(false)
  })

  it('数日后不可改', () => {
    expect(isEditable('2026-08-27', new Date('2026-09-01T10:00:00+08:00'), TZ)).toBe(false)
  })

  it('与揭晓窗口用同一条边界', () => {
    const opens = revealWindowOpensAt('2026-08-27', TZ)
    expect(isEditable('2026-08-27', new Date(opens.getTime() - 1000), TZ)).toBe(true)
    expect(isEditable('2026-08-27', opens, TZ)).toBe(false)
  })
})

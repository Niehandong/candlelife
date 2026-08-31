import { describe, expect, it } from 'vitest'
import cases from '@shared/ritual-cases.json'
import * as ritual from '../ritual'

type Case<I, O> = { name?: string; in: I; out: O }

describe('evaluate_completion', () => {
  const list = cases.evaluate_completion as Case<any, any>[]
  it.each(list.map((c) => [c.name ?? JSON.stringify(c.in), c] as const))('%s', (_n, c) => {
    const got = ritual.evaluateCompletion({
      plannedTime: c.in.planned_time,
      completedAt: new Date(c.in.completed_at),
      tz: c.in.tz,
      toleranceMinutes: c.in.tolerance_minutes,
      minTime: c.in.min_time,
      maxTime: c.in.max_time,
    })
    expect(got.ritualDate).toBe(c.out.ritual_date)
    expect(got.lateMinutes).toBe(c.out.late_minutes)
    expect(got.eligible).toBe(c.out.eligible)
  })
})

describe('current_ritual_night', () => {
  const list = cases.current_ritual_night as Case<any, string>[]
  it.each(list.map((c) => [c.name!, c] as const))('%s', (_n, c) => {
    expect(ritual.currentRitualNight(new Date(c.in.now), c.in.tz)).toBe(c.out)
  })
})

describe('calculate_on_time_streak', () => {
  const list = cases.calculate_on_time_streak as Case<any, number>[]
  it.each(list.map((c) => [c.name!, c] as const))('%s', (_n, c) => {
    expect(ritual.calculateOnTimeStreak(c.in.records, c.in.current_night)).toBe(c.out)
  })
})

describe('reward_draw_count', () => {
  const list = cases.reward_draw_count as Case<{ streak: number }, number>[]
  it.each(list.map((c) => [String(c.in.streak), c] as const))('streak=%s', (_n, c) => {
    expect(ritual.rewardDrawCount(c.in.streak)).toBe(c.out)
  })
})

describe('can_reveal', () => {
  const list = cases.can_reveal as Case<any, boolean>[]
  it.each(list.map((c) => [c.name!, c] as const))('%s', (_n, c) => {
    expect(
      ritual.canReveal({
        ritualDate: c.in.ritual_date,
        isEligible: c.in.is_eligible,
        rewardRevealedAt: c.in.reward_revealed_at ? new Date(c.in.reward_revealed_at) : null,
        now: new Date(c.in.now),
        tz: c.in.tz,
      })
    ).toBe(c.out)
  })
})

describe('summarize_collection', () => {
  const list = cases.summarize_collection as Case<{ art_ids: string[] }, any>[]
  it.each(list.map((c, i) => [i, c] as const))('case %i', (_n, c) => {
    const got = ritual.summarizeCollection(c.in.art_ids)
    expect(got.totalCards).toBe(c.out.total_cards)
    expect(got.uniqueWorks).toBe(c.out.unique_works)
    expect(got.counts).toEqual(c.out.counts)
  })
})

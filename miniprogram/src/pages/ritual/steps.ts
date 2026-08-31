import type { Draft, RitualStep } from '@/store/draft'

export const RITUAL_STEPS: RitualStep[] = ['resistance', 'gratitude', 'plan', 'prep', 'quiet']

export const STEP_TITLE: Record<RitualStep, string> = {
  resistance: '此刻是什么在拦着你',
  gratitude: '今天有什么值得谢谢',
  plan: '明天最想做的三件事',
  prep: '把光调暗一点',
  quiet: '安静下来',
}

export function nextStep(s: RitualStep): RitualStep | null {
  const i = RITUAL_STEPS.indexOf(s)
  return i >= 0 && i < RITUAL_STEPS.length - 1 ? RITUAL_STEPS[i + 1]! : null
}

export function prevStep(s: RitualStep): RitualStep | null {
  const i = RITUAL_STEPS.indexOf(s)
  return i > 0 ? RITUAL_STEPS[i - 1]! : null
}

const nonEmpty = (xs: string[]) => xs.filter((x) => x.trim().length > 0)

export function canAdvance(step: RitualStep, draft: Draft): boolean {
  switch (step) {
    case 'resistance':
      return Boolean(draft.resistanceReason)
    case 'gratitude':
      return nonEmpty(draft.gratitudes).length > 0
    case 'plan':
      return nonEmpty(draft.plans).length > 0
    default:
      return true
  }
}

export type CompletionAssessment = {
  /** 仪式夜，YYYY-MM-DD */
  ritualDate: string
  plannedAt: Date
  completedAt: Date
  lateMinutes: number
  eligible: boolean
}

export type CollectionSummary = {
  totalCards: number
  uniqueWorks: number
  counts: Record<string, number>
}

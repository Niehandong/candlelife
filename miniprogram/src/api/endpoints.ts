import { request } from './client'
import type {
  ArtDetail, CollectionResponse, CompleteRequest, CompleteResponse, ConfigResponse,
  EventItem, MeResponse, NightDetail, NightSummary, PendingResponse, RewardItem,
  SettingsPayload,
} from './types'

export const api = {
  wxLogin: (code: string) =>
    request<{ access_token: string; refresh_token: string }>({
      path: '/api/v1/auth/wx-login', method: 'POST', data: { code }, auth: false }),

  getConfig: () => request<ConfigResponse>({ path: '/api/v1/config', auth: false }),

  getMe: () => request<MeResponse>({ path: '/api/v1/me' }),
  updateNickname: (nickname: string) =>
    request<MeResponse>({ path: '/api/v1/me', method: 'PATCH', data: { nickname } }),
  updateSettings: (s: SettingsPayload) =>
    request<SettingsPayload>({ path: '/api/v1/me/settings', method: 'PUT', data: s }),
  deleteAccount: () => request<void>({ path: '/api/v1/me', method: 'DELETE' }),

  completeNight: (body: CompleteRequest) =>
    request<CompleteResponse>({ path: '/api/v1/nights/complete', method: 'POST', data: body }),
  listNights: () => request<{ items: NightSummary[] }>({ path: '/api/v1/nights' }),
  getNight: (ritualDate: string) =>
    request<NightDetail>({ path: `/api/v1/nights/${ritualDate}` }),
  editNightText: (ritualDate: string, gratitudes: string[], plans: string[]) =>
    request<NightDetail>({
      path: `/api/v1/nights/${ritualDate}`, method: 'PATCH', data: { gratitudes, plans } }),

  pendingRewards: () => request<PendingResponse>({ path: '/api/v1/rewards/pending' }),
  revealRewards: () =>
    request<{ rewards: RewardItem[] }>({ path: '/api/v1/rewards/reveal', method: 'POST' }),

  getCollection: () => request<CollectionResponse>({ path: '/api/v1/collection' }),
  getArt: (id: string) => request<ArtDetail>({ path: `/api/v1/art/${id}` }),

  postEvents: (events: EventItem[]) =>
    request<void>({ path: '/api/v1/events', method: 'POST', data: { events } }),
}

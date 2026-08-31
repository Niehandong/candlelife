import { revealWindowOpensAt } from '@/domain/ritual'

/** 夜记正文在揭晓窗口开启前可改，之后固化（spec 修正 7）。
 *  端上这个判断只决定是否显示编辑入口；服务端会再判一次并可能返回 409。 */
export function isEditable(ritualDate: string, now: Date, tz: string): boolean {
  return now.getTime() < revealWindowOpensAt(ritualDate, tz).getTime()
}

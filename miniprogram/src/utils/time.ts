const pad = (n: number) => String(n).padStart(2, '0')

/** 设备当前时刻 → 带 UTC 偏移的 ISO 字符串。
 *  不用 toISOString()——那会转成 Z，服务端虽仍能正确解析，
 *  但排查问题时看不出用户当时所处的偏移。 */
export function toIsoWithOffset(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

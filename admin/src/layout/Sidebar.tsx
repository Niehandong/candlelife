import { NavLink } from 'react-router-dom'

export const NAV = [
  { to: '/config', label: '基础设置' },
  { to: '/onboarding', label: '开场引导' },
  { to: '/ritual', label: '仪式设置' },
  { to: '/records', label: '记录与奖励' },
  { to: '/art', label: '作品库' },
] as const

export default function Sidebar({
  username, onSignOut, onChangePassword,
}: {
  username: string
  onSignOut: () => void
  /** 可选：不传就不显示「改密码」（Sidebar 的测试只关心导航） */
  onChangePassword?: () => void
}) {
  return (
    <nav style={{
      width: 'var(--sidebar)', minHeight: '100vh', background: 'var(--surface)',
      borderRight: '1px solid var(--border)', padding: '24px 16px',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 24, paddingLeft: 8 }}>
        烛生 · 后台
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1 }}>
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              style={({ isActive }) => ({
                display: 'block', padding: '10px 12px', borderRadius: 10,
                textDecoration: 'none', marginBottom: 4,
                background: isActive ? 'var(--primary-soft)' : 'transparent',
                color: isActive ? 'var(--primary-deep)' : 'var(--ink)',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* 账号区。改密码放这里而不是导航栏：它是账号操作，一年用两次，
          不该跟五个配置模块抢导航栏的位置。 */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>已登录</div>
        <div style={{ marginBottom: 10 }}>{username}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {onChangePassword && (
            <button type="button" className="btn" onClick={onChangePassword}
                    style={{ flex: 1, padding: '8px 6px', fontSize: 13 }}>
              改密码
            </button>
          )}
          <button type="button" className="btn" onClick={onSignOut}
                  style={{ flex: 1, padding: '8px 6px', fontSize: 13 }}>
            登出
          </button>
        </div>
      </div>
    </nav>
  )
}

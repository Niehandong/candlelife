import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import ChangePasswordDialog from '../auth/ChangePasswordDialog'
import { useAuth } from '../auth/useAuth'
import { ToastHost, useToast } from '../components/Toast'
import Sidebar from './Sidebar'

/** 内层：需要用到 ToastHost 提供的 useToast，所以不能和 ToastHost 同层 */
function ShellBody() {
  const { me, signOut } = useAuth()
  const toast = useToast()
  const [pwOpen, setPwOpen] = useState(false)

  return (
    <>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar
          username={me?.username ?? ''}
          onSignOut={signOut}
          onChangePassword={() => setPwOpen(true)}
        />
        <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1100 }}>
          <Outlet />
        </main>
      </div>

      <ChangePasswordDialog
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        onChanged={() => {
          setPwOpen(false)
          toast('密码已修改，请用新密码重新登录')
          // 后端把改密之前签发的 token 全作废了，当前这张也在内。
          // 不登出的话，接下来每个请求都会 401，界面会莫名其妙地坏掉。
          signOut()
        }}
      />
    </>
  )
}

export default function Shell() {
  return (
    <ToastHost>
      <ShellBody />
    </ToastHost>
  )
}

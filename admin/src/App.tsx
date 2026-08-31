import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import LoginPage from './auth/LoginPage'
import RequireAuth from './auth/RequireAuth'
import { AuthProvider } from './auth/useAuth'
import Shell from './layout/Shell'
import ArtPage from './modules/art/ArtPage'
import BasicPage from './modules/config/BasicPage'
import OnboardingPage from './modules/config/OnboardingPage'
import RecordsPage from './modules/config/RecordsPage'
import RitualPage from './modules/config/RitualPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth><Shell /></RequireAuth>}>
            <Route path="/config" element={<BasicPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/ritual" element={<RitualPage />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/art" element={<ArtPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/config" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

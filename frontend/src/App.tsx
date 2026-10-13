import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Skeleton } from './components/ui'
import PublicLayout from './layouts/PublicLayout'
import Home from './pages/public/Home'
import NotFound from './pages/public/NotFound'

const GamePage = lazy(() => import('./pages/public/GamePage'))
const RegisterPage = lazy(() => import('./pages/public/RegisterPage'))
const StatusPage = lazy(() => import('./pages/public/StatusPage'))
const SchedulePage = lazy(() => import('./pages/public/SchedulePage'))
const LivePage = lazy(() => import('./pages/public/LivePage'))

// The admin panel is loaded only when an administrator opens it.
const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
const Login = lazy(() => import('./pages/admin/Login'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const Registrations = lazy(() => import('./pages/admin/Registrations'))
const Tournaments = lazy(() => import('./pages/admin/Tournaments'))
const TournamentManage = lazy(() => import('./pages/admin/TournamentManage'))
const Games = lazy(() => import('./pages/admin/Games'))
const Streams = lazy(() => import('./pages/admin/Streams'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const Admins = lazy(() => import('./pages/admin/Admins'))
const Account = lazy(() => import('./pages/admin/Account'))

function PageFallback() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-12 md:px-8">
      <Skeleton className="h-12 w-1/2" />
      <Skeleton className="h-72" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="juegos/:gameId" element={<GamePage />} />
          <Route path="torneos/:tournamentId/inscripcion" element={<RegisterPage />} />
          <Route path="inscripcion/estado" element={<StatusPage />} />
          <Route path="cronograma" element={<SchedulePage />} />
          <Route path="en-vivo" element={<LivePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="admin/login" element={<Login />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="inscripciones" element={<Registrations />} />
          <Route path="torneos" element={<Tournaments />} />
          <Route path="torneos/:tournamentId" element={<TournamentManage />} />
          <Route path="juegos" element={<Games />} />
          <Route path="streams" element={<Streams />} />
          <Route path="administradores" element={<Admins />} />
          <Route path="configuracion" element={<Settings />} />
          <Route path="cuenta" element={<Account />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

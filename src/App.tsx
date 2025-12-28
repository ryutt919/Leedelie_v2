import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { CreateSchedulePage } from './pages/CreateSchedulePage'
import { ManageSchedulesPage } from './pages/ManageSchedulesPage'
import { IngredientsPage } from './pages/IngredientsPage'
import { PrepsPage } from './pages/PrepsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/create" element={<CreateSchedulePage />} />
      <Route path="/manage" element={<ManageSchedulesPage />} />
      <Route path="/ingredients" element={<IngredientsPage />} />
      <Route path="/preps" element={<PrepsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

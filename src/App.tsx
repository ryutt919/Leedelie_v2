import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { CreateSchedulePage } from './pages/CreateSchedulePage';
import { ManageSchedulesPage } from './pages/ManageSchedulesPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <Link to="/" className="logo">
            <h2>근무 스케줄 관리</h2>
          </Link>
          <div className="nav-links">
            <Link to="/">홈</Link>
            <Link to="/create">스케줄 생성</Link>
            <Link to="/manage">관리/조회</Link>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create" element={<CreateSchedulePage />} />
            <Route path="/manage" element={<ManageSchedulesPage />} />
          </Routes>
        </main>

        <footer className="footer">
          <p>&copy; 2025 근무 스케줄 관리 시스템</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;

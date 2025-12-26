import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { CreateSchedulePage } from './pages/CreateSchedulePage';
import { ManageSchedulesPage } from './pages/ManageSchedulesPage';
import { PrepManagementPage } from './pages/PrepManagementPage';
import { IngredientManagementPage } from './pages/IngredientManagementPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <Link to="/" className="logo">
            <h2>leedeli management</h2>
          </Link>
          <div className="nav-links">
            <Link to="/">홈</Link>
            <Link to="/create">스케줄 생성</Link>
            <Link to="/manage">스케줄 관리/조회</Link>
            <Link to="/preps">프렙/소스 관리</Link>
            <Link to="/ingredients">재료 관리</Link>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create" element={<CreateSchedulePage />} />
            <Route path="/manage" element={<ManageSchedulesPage />} />
            <Route path="/preps" element={<PrepManagementPage />} />
            <Route path="/ingredients" element={<IngredientManagementPage />} />
          </Routes>
        </main>

        <footer className="footer">
          <p>&copy; 2025 leedeli management</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;

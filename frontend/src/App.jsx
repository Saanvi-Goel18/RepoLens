import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <Router>
      <div className="app-container">
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/r/:jobId"
              element={
                <ErrorBoundary>
                  <Dashboard />
                </ErrorBoundary>
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;


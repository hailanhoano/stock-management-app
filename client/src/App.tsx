import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import { StockProvider } from './context/StockContext';
import { AuthProvider } from './context/AuthContext';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AuthProvider>
    <StockProvider>
      <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={
              <ProtectedRoute>
        <div className="flex h-screen bg-gray-100">
          <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
          
                  <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
            {/* Mobile header */}
            <div className="lg:hidden bg-white shadow-sm border-b border-gray-200">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <h1 className="text-lg font-semibold text-gray-900">Stock Management</h1>
                <div className="w-6"></div>
              </div>
            </div>

            {/* Main content */}
            <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50">
              <div className="py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </div>
              </div>
            </main>
          </div>
        </div>
              </ProtectedRoute>
            } />
          </Routes>
      </Router>
    </StockProvider>
    </AuthProvider>
  );
}

export default App; 
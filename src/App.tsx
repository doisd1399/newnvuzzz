import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppProvider, useAppStore } from './context/AppContext';

// Placeholders for Pages
import Login from './pages/Login';
import AdminLayout from './layouts/AdminLayout';
import DriverLayout from './layouts/DriverLayout';

import AdminFleet from './pages/admin/Fleet';
import AdminOperations from './pages/admin/Operations';
import SeniorPanel from './pages/admin/SeniorPanel';

import DriverProfile from './pages/driver/Profile';
import RecruitmentApply from './pages/RecruitmentApply';
import ApplicationStatus from './pages/ApplicationStatus';

import SelectProfile from './pages/SelectProfile';

import RegisterCompany from './pages/RegisterCompany';

const ProtectedRoute = ({ children, allowedRole }: { children: React.ReactNode, allowedRole: 'admin' | 'driver' }) => {
  const { currentUser, authInitialized, activeRole, activeCompanyId } = useAppStore();
  
  if (!authInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!activeCompanyId || !activeRole) return <Navigate to="/select-profile" replace />;
  
  if (activeRole !== allowedRole) {
    return <Navigate to={activeRole === 'admin' ? '/admin' : '/driver'} replace />;
  }
  
  return <>{children}</>;
};

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/select-profile" element={<SelectProfile />} />
        <Route path="/apply" element={<RecruitmentApply />} />
        <Route path="/apply/:companyId" element={<RecruitmentApply />} />
        <Route path="/register-company" element={<RegisterCompany />} />
        <Route path="/status" element={<ApplicationStatus />} />
        
        {/* Admin Routes */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRole="admin">
            <AdminLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="fleet" replace />} />
          <Route path="fleet" element={<AdminFleet />} />
          <Route path="operations" element={<AdminOperations />} />
          <Route path="senior" element={<SeniorPanel />} />
        </Route>

        {/* Driver Routes */}
        <Route path="/driver" element={
          <ProtectedRoute allowedRole="driver">
            <DriverLayout />
          </ProtectedRoute>
        }>
           <Route index element={<Navigate to="profile" replace />} />
           <Route path="profile" element={<DriverProfile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Toaster position="top-right" richColors />
      <AppRoutes />
    </AppProvider>
  );
}

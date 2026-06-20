import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { Login } from './pages/Login';
import { Resident } from './pages/Resident';
import { Dispatch } from './pages/Dispatch';
import { Admin } from './pages/Admin';
import { TicketDetail } from './pages/TicketDetail';
import { MainLayout } from './components/MainLayout';
import { RequireAuth } from './components/RequireAuth';
import { useAuthStore } from './store/authStore';

const AppContent: React.FC = () => {
  const { user, token } = useAuthStore();

  const getDefaultRoute = () => {
    if (!token || !user) return '/login';
    if (user.role === 'resident') return '/resident';
    if (user.role === 'dispatcher') return '/dispatch';
    if (user.role === 'admin') return '/admin';
    return '/login';
  };

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to={getDefaultRoute()} replace />} />

      <Route
        path="/resident"
        element={
          <RequireAuth allowedRoles={['resident']}>
            <MainLayout>
              <Resident />
            </MainLayout>
          </RequireAuth>
        }
      />

      <Route
        path="/dispatch"
        element={
          <RequireAuth allowedRoles={['dispatcher', 'admin']}>
            <MainLayout>
              <Dispatch />
            </MainLayout>
          </RequireAuth>
        }
      />

      <Route
        path="/admin"
        element={
          <RequireAuth allowedRoles={['admin']}>
            <MainLayout>
              <Admin />
            </MainLayout>
          </RequireAuth>
        }
      />

      <Route
        path="/tickets/:id"
        element={
          <RequireAuth allowedRoles={['resident', 'dispatcher', 'admin']}>
            <MainLayout>
              <TicketDetail />
            </MainLayout>
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to={getDefaultRoute()} replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1e3a5f',
          borderRadius: 8,
        },
      }}
    >
      <AntdApp>
        <Router>
          <AppContent />
        </Router>
      </AntdApp>
    </ConfigProvider>
  );
}

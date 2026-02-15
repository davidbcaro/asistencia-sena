import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoginView } from './views/LoginView';
import { InstructorLoginView } from './views/InstructorLoginView';
import { StudentsView } from './views/StudentsView';
import { AttendanceView } from './views/AttendanceView';
import { ReportsView } from './views/ReportsView';
import { AlertsView } from './views/AlertsView';
import { FichasView } from './views/FichasView';
import { SettingsView } from './views/SettingsView';
import { StudentAttendanceView } from './views/StudentAttendanceView';
import { CalificacionesView } from './views/CalificacionesView';
import { CronogramaView } from './views/CronogramaView';
import { syncFromCloud, subscribeToRealtime } from './services/db';
import { UserRole } from './types';

const instructorRouteToTab: Record<string, string> = {
  fichas: 'fichas',
  students: 'students',
  attendance: 'attendance',
  reports: 'reports',
  alerts: 'alerts',
  settings: 'settings',
  grades: 'grades',
};

const getActiveTabFromPath = (pathname: string) => {
  if (pathname.startsWith('/student')) return 'student-portal';
  if (pathname.startsWith('/instructor')) {
    const segment = pathname.split('/')[2];
    if (segment && instructorRouteToTab[segment]) return instructorRouteToTab[segment];
    return 'students';
  }
  return 'students';
};

const RequireRole: React.FC<{
  role: UserRole | null;
  allowed: UserRole[];
  fallback: string;
  children: React.ReactElement;
}> = ({ role, allowed, fallback, children }) => {
  if (!role || !allowed.includes(role)) {
    return <Navigate to={fallback} replace />;
  }
  return children;
};

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 1. Initial Pull
    syncFromCloud();
    // 2. Setup Realtime Listener (Insert/Update/Delete)
    subscribeToRealtime();
  }, []);

  const activeTab = useMemo(() => getActiveTabFromPath(location.pathname), [location.pathname]);

  const handleLogout = () => {
    setRole(null);
    navigate('/', { replace: true });
  };

  const handleSelectRole = (selectedRole: UserRole) => {
    setRole(selectedRole);
    const target = selectedRole === 'student' ? '/student' : '/instructor/students';
    navigate(target, { replace: true });
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'student-portal') {
      navigate('/student');
      return;
    }
    navigate(`/instructor/${tab}`);
  };

  const defaultLanding = role === 'student' ? '/student' : '/instructor/students';

  return (
    <Routes>
      <Route
        path="/"
        element={
          role ? <Navigate to={defaultLanding} replace /> : <LoginView onSelectRole={handleSelectRole} />
        }
      />
      <Route
        path="/login/instructor"
        element={
          role === 'professor' ? (
            <Navigate to="/instructor/students" replace />
          ) : (
            <InstructorLoginView onSelectRole={handleSelectRole} />
          )
        }
      />
      <Route
        path="/student"
        element={
          <RequireRole role={role} allowed={['student', 'professor']} fallback="/">
            <Layout
              activeTab="student-portal"
              onTabChange={handleTabChange}
              role={role as UserRole}
              onLogout={handleLogout}
            >
              <StudentAttendanceView onLogout={handleLogout} />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/instructor"
        element={
          <RequireRole role={role} allowed={['professor']} fallback="/">
            <Layout
              activeTab={activeTab}
              onTabChange={handleTabChange}
              role={role as UserRole}
              onLogout={handleLogout}
            >
              <Outlet />
            </Layout>
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="students" replace />} />
        <Route path="fichas" element={<FichasView />} />
        <Route path="fichas/:fichaId/cronograma" element={<CronogramaView />} />
        <Route path="students" element={<StudentsView />} />
        <Route path="attendance" element={<AttendanceView />} />
        <Route path="reports" element={<ReportsView />} />
        <Route path="grades" element={<CalificacionesView />} />
        <Route path="alerts" element={<AlertsView />} />
        <Route path="settings" element={<SettingsView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
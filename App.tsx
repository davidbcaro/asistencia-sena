import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { LoginView } from './views/LoginView';
import { StudentsView } from './views/StudentsView';
import { AttendanceView } from './views/AttendanceView';
import { ReportsView } from './views/ReportsView';
import { AlertsView } from './views/AlertsView';
import { FichasView } from './views/FichasView';
import { SettingsView } from './views/SettingsView';
import { StudentAttendanceView } from './views/StudentAttendanceView';
import { syncFromCloud, subscribeToRealtime } from './services/db';
import { UserRole } from './types';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [activeTab, setActiveTab] = useState('students');

  useEffect(() => {
    // 1. Initial Pull
    syncFromCloud();
    // 2. Setup Realtime Listener (Insert/Update/Delete)
    subscribeToRealtime();
  }, []);

  // Reset tab when role changes
  useEffect(() => {
      if (role === 'student') {
          setActiveTab('student-portal');
      } else if (role === 'professor') {
          setActiveTab('students');
      }
  }, [role]);

  const handleLogout = () => {
      setRole(null);
  };

  const renderContent = () => {
    // Security check: If student tries to access restricted views, default to portal
    if (role === 'student' && activeTab !== 'student-portal') {
        return <StudentAttendanceView />;
    }

    switch (activeTab) {
      case 'fichas':
        return <FichasView />;
      case 'students':
        return <StudentsView />;
      case 'attendance':
        return <AttendanceView />;
      case 'reports':
        return <ReportsView />;
      case 'alerts':
        return <AlertsView />;
      case 'settings':
        return <SettingsView />;
      case 'student-portal':
        return <StudentAttendanceView />;
      default:
        return <StudentsView />;
    }
  };

  if (!role) {
      return <LoginView onSelectRole={setRole} />;
  }

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab} role={role} onLogout={handleLogout}>
      {renderContent()}
    </Layout>
  );
};

export default App;
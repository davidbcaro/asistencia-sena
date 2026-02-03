import React, { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, CalendarCheck, BarChart3, Mail, GraduationCap, Layers, Settings, Database, Cloud, AlertCircle, ClipboardCheck, LogOut } from 'lucide-react';
import { isSupabaseConfigured } from '../services/db';
import { UserRole } from '../types';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  role: UserRole;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, role, onLogout }) => {
  const [hasCloud, setHasCloud] = useState(false);

  useEffect(() => {
    // Check initial state
    setHasCloud(isSupabaseConfigured());

    // Listen for storage changes (when settings are saved)
    const handleStorageChange = () => {
        setHasCloud(isSupabaseConfigured());
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const allNavItems = [
    { id: 'fichas', label: 'Fichas', icon: Layers, roles: ['professor'] }, 
    { id: 'students', label: 'Aprendices', icon: Users, roles: ['professor'] },
    { id: 'attendance', label: 'Tomar Asistencia', icon: CalendarCheck, roles: ['professor'] },
    { id: 'reports', label: 'Reportes', icon: BarChart3, roles: ['professor'] },
    { id: 'alerts', label: 'Alertas', icon: Mail, roles: ['professor'] },
    { id: 'settings', label: 'Datos y Config', icon: Database, roles: ['professor'] },
    { id: 'student-portal', label: 'Registro Asistencia', icon: ClipboardCheck, roles: ['professor', 'student'] },
  ];

  // Filter items based on the current role
  const navItems = allNavItems.filter(item => {
      // If user is professor, show everything EXCEPT student-portal (optional, but requested to keep separate roles usually)
      // However, prompt said "Professor... all permissions". Let's give professor access to everything including the portal for testing.
      if (role === 'professor') return true; 
      
      // If user is student, ONLY show student-portal
      if (role === 'student') return item.id === 'student-portal';
      
      return false;
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col">
        <Link to="/" className="p-6 flex items-center space-x-3 border-b border-gray-100">
          <div className={`p-2 rounded-lg ${role === 'professor' ? 'bg-indigo-600' : 'bg-green-600'}`}>
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">AsistenciaPro</h1>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {role === 'professor' ? 'Panel Instructor' : 'Portal Aprendiz'}
            </span>
          </div>
        </Link>
        
        <nav className="p-4 space-y-2 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            // Style tweak for portal item when viewed by professor
            const isPortalItem = item.id === 'student-portal';
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === item.id
                    ? role === 'professor' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'bg-green-50 text-green-700 font-medium'
                    : isPortalItem && role === 'professor'
                        ? 'text-indigo-600 bg-indigo-50/30 hover:bg-indigo-100 font-medium border border-indigo-100 border-dashed'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        
        {/* Footer */}
        <div className="p-4 space-y-3">
             {role === 'professor' && (
                 <>
                    <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium ${
                        hasCloud ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                        {hasCloud ? <Cloud className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        <span>{hasCloud ? 'Nube Conectada' : 'Nube no config.'}</span>
                    </div>
                 </>
             )}
             
             {role !== 'student' && (
                 <button 
                    onClick={onLogout}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all font-medium text-sm"
                 >
                     <LogOut className="w-4 h-4" />
                     <span>Cerrar Sesión</span>
                 </button>
             )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white shadow-sm sticky top-0 z-10 md:hidden p-4 flex items-center justify-between">
           <Link to="/" className="flex items-center space-x-2">
              <GraduationCap className={`w-6 h-6 ${role === 'professor' ? 'text-indigo-600' : 'text-green-600'}`} />
              <span className="font-bold text-gray-800">AsistenciaPro</span>
           </Link>
           {role !== 'student' && (
               <button onClick={onLogout} className="p-2 text-gray-500">
                   <LogOut className="w-5 h-5" />
               </button>
           )}
        </header>
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};
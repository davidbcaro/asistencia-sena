import React, { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, CalendarCheck, BarChart3, Mail, GraduationCap, Layers, Database, Cloud, AlertCircle, ClipboardCheck, LogOut, FileSpreadsheet, PanelLeftClose, PanelLeft } from 'lucide-react';
import { isSupabaseConfigured } from '../services/db';
import { UserRole } from '../types';

const SIDEBAR_OPEN_KEY = 'asistenciapro-sidebar-open';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  role: UserRole;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, role, onLogout }) => {
  const [hasCloud, setHasCloud] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
      return stored !== 'false';
    } catch {
      return true;
    }
  });
  const homePath = role === 'student' ? '/student' : '/instructor/students';

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_OPEN_KEY, String(next));
      } catch {}
      return next;
    });
  };

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
    { id: 'grades', label: 'Calificaciones', icon: FileSpreadsheet, roles: ['professor'] },
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

  const isInstructor = role === 'professor';
  const showSidebarToggle = isInstructor;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Toggle: open sidebar when closed (solo instructor) */}
      {showSidebarToggle && !sidebarOpen && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="fixed left-3 top-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 shadow-md text-gray-700 hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors text-sm font-medium"
          title="Abrir menú"
        >
          <PanelLeft className="w-5 h-5" />
          <span className="hidden sm:inline">Abrir menú</span>
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={`flex flex-col flex-shrink-0 bg-white border-r border-gray-200 transition-[width] duration-200 ease-out overflow-hidden
          w-full
          ${!isInstructor || sidebarOpen ? 'md:w-64' : 'md:w-0 md:min-w-0 md:border-0'}`}
      >
        <div className="flex flex-col flex-shrink-0 min-w-[16rem] md:min-w-0">
          <div className="p-4 pb-2 flex items-center justify-between gap-2 border-b border-gray-100">
            <Link to={homePath} className="flex items-center space-x-3 flex-1 min-w-0">
              <div className={`p-2 rounded-lg flex-shrink-0 ${role === 'professor' ? 'bg-indigo-600' : 'bg-green-600'}`}>
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-800 truncate">AsistenciaPro</h1>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {role === 'professor' ? 'Panel Instructor' : 'Portal Aprendiz'}
                </span>
              </div>
            </Link>
            {showSidebarToggle && (
              <button
                type="button"
                onClick={toggleSidebar}
                className="flex-shrink-0 p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                title="Cerrar menú"
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            )}
          </div>
        
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
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white shadow-sm sticky top-0 z-10 md:hidden p-4 flex items-center justify-between">
           <Link to={homePath} className="flex items-center space-x-2">
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
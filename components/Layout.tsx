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

  const sidebarCollapsed = isInstructor && !sidebarOpen;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside
        className={`flex flex-col flex-shrink-0 bg-white border-r border-gray-200 transition-[width] duration-200 ease-out overflow-hidden w-full ${!sidebarCollapsed ? 'md:w-64' : ''}`}
        style={
          sidebarCollapsed
            ? { width: 0, minWidth: 0, borderRightWidth: 0 }
            : undefined
        }
      >
        <div
          className="flex flex-col flex-1 min-w-[16rem]"
          style={sidebarCollapsed ? { width: 0, minWidth: 0, overflow: 'hidden', pointerEvents: 'none' } : undefined}
        >
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
      <main className="flex-1 overflow-auto flex flex-col min-w-0">
        {/* Barra superior: instructor siempre (toggle); estudiante solo en móvil (logo + logout) */}
        <header
          className={`bg-white shadow-sm sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-gray-100 ${!showSidebarToggle ? 'md:hidden' : ''}`}
        >
          {showSidebarToggle && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-indigo-700 transition-colors text-sm font-medium border border-gray-200 hover:border-indigo-200 shrink-0"
              title={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              {sidebarOpen ? (
                <>
                  <PanelLeftClose className="w-5 h-5" />
                  <span className="hidden sm:inline">Cerrar menú</span>
                </>
              ) : (
                <>
                  <PanelLeft className="w-5 h-5" />
                  <span className="hidden sm:inline">Abrir menú</span>
                </>
              )}
            </button>
          )}
          <div className="md:hidden flex-1 flex items-center justify-between min-w-0">
            <Link to={homePath} className="flex items-center space-x-2 min-w-0">
              <GraduationCap className={`w-6 h-6 shrink-0 ${role === 'professor' ? 'text-indigo-600' : 'text-green-600'}`} />
              <span className="font-bold text-gray-800 truncate">AsistenciaPro</span>
            </Link>
            {role !== 'student' && (
              <button onClick={onLogout} className="p-2 text-gray-500 shrink-0">
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>
        <div className="p-4 md:p-8 max-w-7xl mx-auto flex-1 w-full">
          {children}
        </div>
      </main>
    </div>
  );
};
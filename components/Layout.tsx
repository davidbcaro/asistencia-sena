import React, { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, CalendarCheck, BarChart3, Mail, GraduationCap,
  Layers, Database, Cloud, ClipboardCheck, LogOut, FileSpreadsheet,
  PanelLeft, PanelLeftClose, BookOpen, Scale, BookMarked, Menu,
} from 'lucide-react';
import { isSupabaseConfigured } from '../services/db';
import { UserRole } from '../types';

const SIDEBAR_PINNED_KEY = 'asistenciapro-sidebar-pinned';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  role: UserRole;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, role, onLogout }) => {
  const [hasCloud, setHasCloud] = useState(false);
  const [isPinned, setIsPinned] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_PINNED_KEY) === 'true'; }
    catch { return false; }
  });
  const [isHovering, setIsHovering] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const homePath = role === 'student' ? '/student' : '/instructor/students';
  const isInstructor = role === 'professor';

  const togglePin = () => {
    setIsPinned(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_PINNED_KEY, String(next)); } catch {}
      return next;
    });
  };

  useEffect(() => {
    setHasCloud(isSupabaseConfigured());
    const handleStorageChange = () => setHasCloud(isSupabaseConfigured());
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Desktop: icon rail (collapsed) by default; expands on hover or when pinned.
  // Students: always fully expanded (single nav item, no need for rail).
  const desktopExpanded = !isInstructor || isPinned || isHovering;

  const allNavItems = [
    { id: 'fichas',         label: 'Fichas',              icon: Layers,          roles: ['professor'] },
    { id: 'students',       label: 'Aprendices',          icon: Users,           roles: ['professor'] },
    { id: 'asistencia-lms', label: 'Asistencia LMS',      icon: BookOpen,        roles: ['professor'] },
    { id: 'debido-proceso', label: 'Debido proceso',      icon: Scale,           roles: ['professor'] },
    { id: 'attendance',     label: 'Tomar Asistencia',    icon: CalendarCheck,   roles: ['professor'] },
    { id: 'reports',        label: 'Reportes',            icon: BarChart3,       roles: ['professor'] },
    { id: 'grades',         label: 'Calificaciones',      icon: FileSpreadsheet, roles: ['professor'] },
    { id: 'sofia-plus',     label: 'Sofia Plus',          icon: BookMarked,      roles: ['professor'] },
    { id: 'alerts',         label: 'Alertas',             icon: Mail,            roles: ['professor'] },
    { id: 'settings',       label: 'Datos y Config',      icon: Database,        roles: ['professor'] },
    { id: 'student-portal', label: 'Registro Asistencia', icon: ClipboardCheck,  roles: ['professor', 'student'] },
  ];

  const navItems = allNavItems.filter(item => {
    if (role === 'professor') return true;
    if (role === 'student') return item.id === 'student-portal';
    return false;
  });

  /** Shared sidebar content rendered both in the desktop rail and mobile drawer */
  const SidebarContent = ({ expanded }: { expanded: boolean }) => (
    <div className="flex flex-col h-full">

      {/* ── Logo / Header ─────────────────────────────────────── */}
      <div
        className={`flex items-center border-b border-gray-100 flex-shrink-0 transition-all duration-200 ${
          expanded ? 'px-3 gap-2 py-3.5' : 'justify-center px-2 py-3.5'
        }`}
      >
        <Link
          to={homePath}
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 min-w-0 flex-1 ${!expanded ? 'justify-center' : ''}`}
        >
          <div className={`p-2 rounded-lg flex-shrink-0 transition-colors ${role === 'professor' ? 'bg-teal-600' : 'bg-green-600'}`}>
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          {/* Text fades + slides in when expanded */}
          <div
            className={`min-w-0 overflow-hidden transition-all duration-200 ${
              expanded ? 'opacity-100 max-w-[11rem]' : 'opacity-0 max-w-0 pointer-events-none'
            }`}
          >
            <p className="text-sm font-bold text-gray-800 whitespace-nowrap leading-tight">AsistenciaPro</p>
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
              {role === 'professor' ? 'Panel Instructor' : 'Portal Aprendiz'}
            </p>
          </div>
        </Link>

        {/* Pin/unpin button — only for instructors, fades in with sidebar */}
        {isInstructor && (
          <button
            onClick={togglePin}
            title={isPinned ? 'Desanclar menú' : 'Anclar menú abierto'}
            className={`flex-shrink-0 p-1.5 rounded-lg transition-all duration-200 ${
              isPinned
                ? 'text-teal-600 bg-teal-50 hover:bg-teal-100'
                : 'text-gray-400 hover:text-teal-600 hover:bg-teal-50'
            } ${expanded ? 'opacity-100' : 'opacity-0 pointer-events-none w-0 p-0 overflow-hidden'}`}
          >
            {isPinned
              ? <PanelLeftClose className="w-4 h-4" />
              : <PanelLeft className="w-4 h-4" />
            }
          </button>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────── */}
      <nav className={`flex-1 py-2 space-y-0.5 overflow-y-auto overflow-x-hidden ${expanded ? 'px-2' : 'px-1.5'}`}>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isPortalItem = item.id === 'student-portal';

          return (
            <button
              key={item.id}
              onClick={() => { onTabChange(item.id); setMobileOpen(false); }}
              title={!expanded ? item.label : undefined}
              className={`w-full flex items-center rounded-lg transition-colors duration-150 group
                ${expanded ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-2.5'}
                ${isActive
                  ? role === 'professor'
                    ? 'bg-teal-50 text-teal-700 font-semibold'
                    : 'bg-green-50 text-green-700 font-semibold'
                  : isPortalItem && role === 'professor'
                    ? 'text-teal-500 bg-teal-50/30 hover:bg-teal-100 font-medium border border-dashed border-teal-100'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }
              `}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span
                className={`text-sm whitespace-nowrap overflow-hidden transition-all duration-200 ${
                  expanded ? 'opacity-100 max-w-[11rem]' : 'opacity-0 max-w-0 pointer-events-none'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── Footer: cloud status ───────────────────────────────── */}
      <div className={`py-3 border-t border-gray-100 flex-shrink-0 ${expanded ? 'px-3' : 'px-1.5'}`}>
        {role === 'professor' && (
          <div
            title={!expanded ? (hasCloud ? 'Nube Conectada' : 'Nube no configurada') : undefined}
            className={`flex items-center rounded-lg text-xs font-medium transition-all duration-150 ${
              expanded ? 'gap-2 px-3 py-2' : 'justify-center px-2 py-2'
            } ${hasCloud ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}
          >
            <Cloud className="w-3.5 h-3.5 flex-shrink-0" />
            <span
              className={`whitespace-nowrap overflow-hidden transition-all duration-200 ${
                expanded ? 'opacity-100 max-w-[10rem]' : 'opacity-0 max-w-0 pointer-events-none'
              }`}
            >
              {hasCloud ? 'Nube Conectada' : 'Nube no config.'}
            </span>
          </div>
        )}
      </div>

    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── Mobile overlay drawer ──────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-2xl flex flex-col z-10">
            <SidebarContent expanded={true} />
          </aside>
        </div>
      )}

      {/* ── Desktop sidebar: icon rail → expands on hover / pin ── */}
      <aside
        className="hidden md:flex flex-col flex-shrink-0 bg-white border-r border-gray-200 overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{ width: desktopExpanded ? '16rem' : '3.5rem' }}
        onMouseEnter={() => { if (isInstructor && !isPinned) setIsHovering(true); }}
        onMouseLeave={() => { if (isInstructor) setIsHovering(false); }}
      >
        <SidebarContent expanded={desktopExpanded} />
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto flex flex-col min-w-0">

        {/* Top header */}
        <header className="bg-white shadow-sm sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile: hamburger button */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors border border-gray-200"
              title="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Mobile: logo */}
            <div className="md:hidden">
              <Link to={homePath} className="flex items-center gap-2">
                <GraduationCap className={`w-5 h-5 ${role === 'professor' ? 'text-teal-600' : 'text-green-600'}`} />
                <span className="font-bold text-gray-800 text-sm">AsistenciaPro</span>
              </Link>
            </div>
          </div>

          {role !== 'student' && (
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all font-medium text-sm shrink-0"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          )}
        </header>

        {/* Page content — min-w-0 evita scroll horizontal por contenido ancho */}
        <div className="p-4 md:p-6 flex-1 w-full min-w-0">
          {children}
        </div>

      </main>
    </div>
  );
};

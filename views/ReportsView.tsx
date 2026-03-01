import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  FileDown, Search, Filter, ChevronLeft, ChevronRight,
  ArrowUpDown, Monitor, BookOpen, CalendarCheck,
} from 'lucide-react';
import {
  getStudents, getAttendance, getFichas, getSessions,
  getLmsLastAccess, getGradeActivities, getGrades,
} from '../services/db';
import { Ficha, GradeActivity, GradeEntry } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return -1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / 86_400_000);
}

function downloadCsv(headers: string[], rows: (string | number)[][], filename: string) {
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── constants ───────────────────────────────────────────────────────────────

type TabId = 'sessions' | 'lms' | 'evidencias';
const ITEMS_PER_PAGE = 15;
const TODAY_ISO = new Date().toISOString().split('T')[0];

const PIE_SESSIONS  = ['#4f46e5', '#ef4444'];
const PIE_LMS       = ['#22c55e', '#f59e0b', '#ef4444', '#9ca3af'];
const PIE_EV        = ['#22c55e', '#fbbf24', '#f97316', '#ef4444'];

const barChartHeight = (count: number) => Math.max(count * 36, 220);

// ─── Paginator (defined outside to avoid re-creation on every render) ────────

const Paginator: React.FC<{
  page: number;
  pages: number;
  total: number;
  onPageChange: (p: number) => void;
}> = ({ page, pages, total, onPageChange }) => {
  if (pages <= 1) return null;
  const from = (page - 1) * ITEMS_PER_PAGE + 1;
  const to   = Math.min(page * ITEMS_PER_PAGE, total);
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
      <span className="text-sm text-gray-500">
        Mostrando {from}–{to} de {total}
      </span>
      <div className="flex items-center space-x-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <span className="text-sm font-medium text-gray-700 px-2">
          {page} / {pages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(pages, page + 1))}
          disabled={page === pages}
          className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>
    </div>
  );
};

// ─── KpiCard ─────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  label: string;
  value: string | number;
  valueColor?: string;
  sub?: string;
}> = ({ label, value, valueColor = 'text-gray-800', sub }) => (
  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    <p className={`text-3xl font-bold mt-1 ${valueColor}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

// ─── SearchBar ───────────────────────────────────────────────────────────────

const SearchBar: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => (
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    <input
      type="text"
      placeholder="Buscar..."
      className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-56 bg-white shadow-sm"
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  </div>
);

// ─── ExportBtn ───────────────────────────────────────────────────────────────

const ExportBtn: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg border border-indigo-100 font-medium transition-colors"
  >
    <FileDown className="w-4 h-4" />
    Exportar
  </button>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const ReportsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('sessions');

  // ── raw data ──
  const [students,        setStudents]       = useState(getStudents());
  const [allRecords,      setAllRecords]      = useState(getAttendance());
  const [fichas,          setFichas]          = useState<Ficha[]>([]);
  const [sessions,        setSessions]        = useState(getSessions());
  const [lmsLastAccess,   setLmsLastAccess]   = useState(getLmsLastAccess());
  const [gradeActivities, setGradeActivities] = useState(getGradeActivities());
  const [grades,          setGrades]          = useState<GradeEntry[]>([]);

  // ── shared filter ──
  const [selectedFicha, setSelectedFicha] = useState('Todas');

  // ── per-tab search ──
  const [searchSessions,   setSearchSessions]   = useState('');
  const [searchLms,        setSearchLms]        = useState('');
  const [searchEvidencias, setSearchEvidencias] = useState('');

  // ── per-tab pagination ──
  const [pageSessions,   setPageSessions]   = useState(1);
  const [pageLms,        setPageLms]        = useState(1);
  const [pageEvidencias, setPageEvidencias] = useState(1);

  // ── sort (sessions) ──
  const [sortSessions, setSortSessions] = useState<'lastname' | 'firstname'>('lastname');

  // ── data load ──
  const loadData = () => {
    setStudents(getStudents());
    setAllRecords(getAttendance());
    setFichas(getFichas());
    setSessions(getSessions());
    setLmsLastAccess(getLmsLastAccess());
    setGradeActivities(getGradeActivities());
    setGrades(getGrades());
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  // Reset pages on filter / tab change
  useEffect(() => { setPageSessions(1);   }, [selectedFicha, searchSessions, sortSessions, activeTab]);
  useEffect(() => { setPageLms(1);        }, [selectedFicha, searchLms, activeTab]);
  useEffect(() => { setPageEvidencias(1); }, [selectedFicha, searchEvidencias, activeTab]);

  // Reset search when switching tabs
  useEffect(() => {
    setSearchSessions('');
    setSearchLms('');
    setSearchEvidencias('');
  }, [activeTab]);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — SESIONES EN LÍNEA
  // ══════════════════════════════════════════════════════════════════════════

  const baseSessionStats = useMemo(() => {
    return students.map(student => {
      const validSessions = sessions.filter(s =>
        s.group === 'Todas' || s.group === 'Todos' || s.group === student.group
      );
      const totalDays  = validSessions.length;
      const validDates = new Set(validSessions.map(s => s.date));
      const presentCount = allRecords.filter(r =>
        r.studentId === student.id && r.present && validDates.has(r.date)
      ).length;
      const absentCount = totalDays - presentCount;
      return {
        id:        student.id,
        fullName:  `${student.firstName} ${student.lastName}`,
        firstName: student.firstName,
        lastName:  student.lastName,
        email:     student.email || '',
        document:  student.documentNumber || '',
        group:     student.group || 'General',
        present:   presentCount,
        absent:    absentCount,
        total:     totalDays,
        rate:      totalDays > 0 ? (presentCount / totalDays) * 100 : 0,
      };
    }).sort((a, b) => b.absent - a.absent);
  }, [students, allRecords, sessions]);

  const sessionsByFicha = useMemo(() =>
    selectedFicha === 'Todas'
      ? baseSessionStats
      : baseSessionStats.filter(s => s.group === selectedFicha),
    [baseSessionStats, selectedFicha]
  );

  const sessionKpis = useMemo(() => {
    const totalPresent = sessionsByFicha.reduce((a, c) => a + c.present, 0);
    const totalAbsent  = sessionsByFicha.reduce((a, c) => a + c.absent,  0);
    const total        = totalPresent + totalAbsent;
    const totalSessions =
      selectedFicha === 'Todas'
        ? sessions.length
        : sessions.filter(s =>
            s.group === 'Todas' || s.group === 'Todos' || s.group === selectedFicha
          ).length;
    return {
      rate:          total > 0 ? (totalPresent / total) * 100 : 0,
      totalAbsent,
      atRisk:        sessionsByFicha.filter(s => s.absent >= 3).length,
      totalSessions,
    };
  }, [sessionsByFicha, sessions, selectedFicha]);

  const sessionPieData = useMemo(() => [
    { name: 'Asistencias', value: sessionsByFicha.reduce((a, c) => a + c.present, 0) },
    { name: 'Fallas',      value: sessionsByFicha.reduce((a, c) => a + c.absent,  0) },
  ], [sessionsByFicha]);

  const sessionStatsForTable = useMemo(() => {
    const q = searchSessions.toLowerCase();
    return sessionsByFicha
      .filter(s =>
        s.fullName.toLowerCase().includes(q) ||
        s.document.includes(q) ||
        s.email.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (sortSessions === 'lastname') {
          const c = a.lastName.localeCompare(b.lastName);
          return c !== 0 ? c : a.firstName.localeCompare(b.firstName);
        }
        const c = a.firstName.localeCompare(b.firstName);
        return c !== 0 ? c : a.lastName.localeCompare(b.lastName);
      });
  }, [sessionsByFicha, searchSessions, sortSessions]);

  const sessionPages     = Math.ceil(sessionStatsForTable.length / ITEMS_PER_PAGE);
  const sessionPaginated = sessionStatsForTable.slice(
    (pageSessions - 1) * ITEMS_PER_PAGE, pageSessions * ITEMS_PER_PAGE
  );

  const downloadSessionsCsv = () =>
    downloadCsv(
      ['Documento', 'Nombres', 'Apellidos', 'Ficha', 'Email', 'Total Clases', 'Asistencias', 'Fallas', '% Asistencia'],
      sessionStatsForTable.map(s => [
        `"${s.document}"`, `"${s.firstName}"`, `"${s.lastName}"`, `"${s.group}"`, `"${s.email}"`,
        s.total, s.present, s.absent, `${s.rate.toFixed(1)}%`,
      ]),
      `reporte_sesiones_${selectedFicha}_${TODAY_ISO}.csv`
    );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — ASISTENCIA LMS
  // ══════════════════════════════════════════════════════════════════════════

  const lmsStatsFull = useMemo(() =>
    students.map(student => {
      const lastAccess = lmsLastAccess[student.id] || null;
      const days       = lastAccess ? daysSince(lastAccess) : null;
      const category   =
        days === null  ? 'Sin acceso'        :
        days <= 7      ? 'Activo (≤7d)'      :
        days <= 20     ? 'Moderado (8–20d)'  :
                         'En riesgo (>20d)';
      return {
        id:          student.id,
        fullName:    `${student.firstName} ${student.lastName}`,
        firstName:   student.firstName,
        lastName:    student.lastName,
        email:       student.email || '',
        document:    student.documentNumber || '',
        group:       student.group || 'General',
        lastAccess,
        days,
        category,
      };
    }),
    [students, lmsLastAccess]
  );

  const lmsByFicha = useMemo(() =>
    selectedFicha === 'Todas'
      ? lmsStatsFull
      : lmsStatsFull.filter(s => s.group === selectedFicha),
    [lmsStatsFull, selectedFicha]
  );

  const lmsKpis = useMemo(() => {
    const withAccess = lmsByFicha.filter(s => s.days !== null && s.days >= 0);
    const avgDays    =
      withAccess.length > 0
        ? Math.round(withAccess.reduce((a, c) => a + (c.days ?? 0), 0) / withAccess.length)
        : null;
    return {
      active:   lmsByFicha.filter(s => s.days !== null && s.days <= 7).length,
      moderate: lmsByFicha.filter(s => s.days !== null && s.days > 7 && s.days <= 20).length,
      atRisk:   lmsByFicha.filter(s => s.days !== null && s.days > 20).length,
      noAccess: lmsByFicha.filter(s => s.days === null).length,
      avgDays,
    };
  }, [lmsByFicha]);

  const lmsPieData = useMemo(() => {
    const cats = ['Activo (≤7d)', 'Moderado (8–20d)', 'En riesgo (>20d)', 'Sin acceso'];
    return cats
      .map(cat => ({ name: cat, value: lmsByFicha.filter(s => s.category === cat).length }))
      .filter(d => d.value > 0);
  }, [lmsByFicha]);

  const lmsBarData = useMemo(() =>
    lmsByFicha
      .filter(s => s.days !== null && s.days > 0)
      .sort((a, b) => (b.days ?? 0) - (a.days ?? 0))
      .slice(0, 20)
      .map(s => ({ name: s.lastName, days: s.days ?? 0, fullName: s.fullName })),
    [lmsByFicha]
  );

  const lmsForTable = useMemo(() => {
    const q = searchLms.toLowerCase();
    return lmsByFicha
      .filter(s =>
        s.fullName.toLowerCase().includes(q) ||
        s.document.includes(q) ||
        s.email.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const da = a.days ?? 9_999;
        const db = b.days ?? 9_999;
        return db - da;
      });
  }, [lmsByFicha, searchLms]);

  const lmsPages     = Math.ceil(lmsForTable.length / ITEMS_PER_PAGE);
  const lmsPaginated = lmsForTable.slice(
    (pageLms - 1) * ITEMS_PER_PAGE, pageLms * ITEMS_PER_PAGE
  );

  const downloadLmsCsv = () =>
    downloadCsv(
      ['Documento', 'Nombres', 'Apellidos', 'Ficha', 'Email', 'Último acceso', 'Días inactivo', 'Estado LMS'],
      lmsForTable.map(s => [
        `"${s.document}"`, `"${s.firstName}"`, `"${s.lastName}"`, `"${s.group}"`, `"${s.email}"`,
        s.lastAccess || '-',
        s.days !== null && s.days >= 0 ? s.days : '-',
        `"${s.category}"`,
      ]),
      `reporte_lms_${selectedFicha}_${TODAY_ISO}.csv`
    );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — EVIDENCIAS PENDIENTES
  // ══════════════════════════════════════════════════════════════════════════

  const gradeMap = useMemo(() => {
    const map = new Map<string, GradeEntry>();
    grades.forEach(g => map.set(`${g.studentId}-${g.activityId}`, g));
    return map;
  }, [grades]);

  const evidenciasStatsFull = useMemo(() =>
    students.map(student => {
      const group         = student.group || '';
      const fichaSpecific = gradeActivities.filter(a => a.group === group);
      const fichaActs     = fichaSpecific.length > 0
        ? fichaSpecific
        : gradeActivities.filter(a => a.group === '');
      const pending: GradeActivity[] = [];
      fichaActs.forEach(a => {
        const g = gradeMap.get(`${student.id}-${a.id}`);
        if (!g || g.letter !== 'A') pending.push(a);
      });
      return {
        id:                  student.id,
        fullName:            `${student.firstName} ${student.lastName}`,
        firstName:           student.firstName,
        lastName:            student.lastName,
        email:               student.email || '',
        document:            student.documentNumber || '',
        group,
        pendienteCount:      pending.length,
        pendienteActivities: pending,
        totalActivities:     fichaActs.length,
      };
    }),
    [students, gradeActivities, gradeMap]
  );

  const evidenciasByFicha = useMemo(() =>
    selectedFicha === 'Todas'
      ? evidenciasStatsFull
      : evidenciasStatsFull.filter(s => s.group === selectedFicha),
    [evidenciasStatsFull, selectedFicha]
  );

  const evidenciasKpis = useMemo(() => {
    const total        = evidenciasByFicha.length;
    const alDia        = evidenciasByFicha.filter(s => s.pendienteCount === 0).length;
    const totalPending = evidenciasByFicha.reduce((a, c) => a + c.pendienteCount, 0);
    // Activity with most pending
    const actMap = new Map<string, { name: string; count: number }>();
    evidenciasByFicha.forEach(s =>
      s.pendienteActivities.forEach(a => {
        const match = a.name.match(/EV\d+/i);
        const short = match ? match[0].toUpperCase() : a.name.slice(0, 12);
        const entry = actMap.get(a.id);
        if (entry) entry.count++;
        else actMap.set(a.id, { name: short, count: 1 });
      })
    );
    const worst = Array.from(actMap.values()).sort((a, b) => b.count - a.count)[0];
    return {
      alDia,
      conPendientes: total - alDia,
      totalPending,
      avg:           total > 0 ? (totalPending / total).toFixed(1) : '0.0',
      worstActivity: worst?.name ?? '—',
    };
  }, [evidenciasByFicha]);

  const activityBarData = useMemo(() => {
    const actMap = new Map<string, { name: string; fullName: string; count: number }>();
    evidenciasByFicha.forEach(s =>
      s.pendienteActivities.forEach(a => {
        const match = a.name.match(/EV\d+/i);
        const short = match ? match[0].toUpperCase() : a.name.slice(0, 10);
        const entry = actMap.get(a.id);
        if (entry) entry.count++;
        else actMap.set(a.id, { name: short, fullName: a.name, count: 1 });
      })
    );
    return Array.from(actMap.values()).sort((a, b) => b.count - a.count).slice(0, 15);
  }, [evidenciasByFicha]);

  const evidenciasPieData = useMemo(() => {
    const buckets = [
      { name: 'Al día (0)',    count: 0 },
      { name: 'Bajo (1–2)',    count: 0 },
      { name: 'Medio (3–5)',   count: 0 },
      { name: 'Alto (6+)',     count: 0 },
    ];
    evidenciasByFicha.forEach(s => {
      if      (s.pendienteCount === 0)  buckets[0].count++;
      else if (s.pendienteCount <= 2)   buckets[1].count++;
      else if (s.pendienteCount <= 5)   buckets[2].count++;
      else                              buckets[3].count++;
    });
    return buckets.filter(b => b.count > 0);
  }, [evidenciasByFicha]);

  const evidenciasForTable = useMemo(() => {
    const q = searchEvidencias.toLowerCase();
    return evidenciasByFicha
      .filter(s =>
        s.fullName.toLowerCase().includes(q) ||
        s.document.includes(q)
      )
      .sort((a, b) => b.pendienteCount - a.pendienteCount);
  }, [evidenciasByFicha, searchEvidencias]);

  const evPages     = Math.ceil(evidenciasForTable.length / ITEMS_PER_PAGE);
  const evPaginated = evidenciasForTable.slice(
    (pageEvidencias - 1) * ITEMS_PER_PAGE, pageEvidencias * ITEMS_PER_PAGE
  );

  const downloadEvidenciasCsv = () =>
    downloadCsv(
      ['Documento', 'Nombres', 'Apellidos', 'Ficha', 'Total Actividades', 'Pendientes', 'Actividades Pendientes'],
      evidenciasForTable.map(s => [
        `"${s.document}"`, `"${s.firstName}"`, `"${s.lastName}"`, `"${s.group}"`,
        s.totalActivities, s.pendienteCount,
        `"${s.pendienteActivities.map(a => a.name).join('; ')}"`,
      ]),
      `reporte_evidencias_${selectedFicha}_${TODAY_ISO}.csv`
    );

  // ─── shared tab config ─────────────────────────────────────────────────────

  const TABS: { id: TabId; label: string; Icon: React.ElementType; badge?: number }[] = [
    { id: 'sessions',   label: 'Sesiones en línea',    Icon: CalendarCheck },
    { id: 'lms',        label: 'Asistencia LMS',        Icon: Monitor },
    { id: 'evidencias', label: 'Evidencias pendientes', Icon: BookOpen },
  ];

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reportes</h2>
          <p className="text-gray-500">
            Estadísticas y reportes&nbsp;
            {selectedFicha !== 'Todas' ? `— Ficha ${selectedFicha}` : 'de todos los grupos'}.
          </p>
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white shadow-sm font-medium text-gray-700"
            value={selectedFicha}
            onChange={e => setSelectedFicha(e.target.value)}
          >
            <option value="Todas">Todas las Fichas</option>
            {fichas.map(f => <option key={f.id} value={f.code}>{f.code}</option>)}
          </select>
        </div>
      </div>

      {/* ── Tab Nav ── */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1 sm:gap-6 overflow-x-auto">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 py-3 px-2 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                activeTab === id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB 1 — SESIONES EN LÍNEA
      ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Asistencia promedio"
              value={`${sessionKpis.rate.toFixed(1)}%`}
              valueColor={sessionKpis.rate >= 80 ? 'text-green-600' : sessionKpis.rate >= 60 ? 'text-amber-500' : 'text-red-600'}
            />
            <KpiCard
              label="Fallas acumuladas"
              value={sessionKpis.totalAbsent}
              valueColor="text-red-600"
            />
            <KpiCard
              label="En riesgo (≥3 fallas)"
              value={sessionKpis.atRisk}
              valueColor="text-orange-500"
              sub={`de ${sessionsByFicha.length} aprendices`}
            />
            <KpiCard
              label="Clases registradas"
              value={sessionKpis.totalSessions}
              valueColor="text-indigo-600"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Bar — ranking fallas */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[440px]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold text-gray-800">Ranking de fallas</h3>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">
                  Top {Math.min(sessionsByFicha.length, 20)}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div style={{ height: barChartHeight(Math.min(sessionsByFicha.length, 20)), minWidth: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sessionsByFicha.slice(0, 20)}
                      layout="vertical"
                      margin={{ left: 0, right: 34, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="fullName"
                        type="category"
                        width={138}
                        tick={{ fontSize: 10, fill: '#4b5563' }}
                        interval={0}
                      />
                      <Tooltip
                        cursor={{ fill: '#f9fafb' }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                      />
                      <Bar dataKey="absent" name="Fallas" radius={[0, 4, 4, 0]} barSize={18}>
                        {sessionsByFicha.slice(0, 20).map((e, i) => (
                          <Cell key={i} fill={e.absent >= 5 ? '#dc2626' : e.absent >= 3 ? '#f97316' : '#4f46e5'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Pie — distribución */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-[440px] flex flex-col">
              <h3 className="text-base font-semibold text-gray-800 mb-4">Distribución global</h3>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sessionPieData}
                      cx="50%" cy="45%"
                      innerRadius={72} outerRadius={112}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {sessionPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_SESSIONS[i % PIE_SESSIONS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v.toLocaleString(), '']} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-800">
                Detalle por aprendiz
                <span className="ml-2 text-sm font-normal text-gray-400">({sessionStatsForTable.length})</span>
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <SearchBar value={searchSessions} onChange={setSearchSessions} />
                <button
                  onClick={() => setSortSessions(p => p === 'lastname' ? 'firstname' : 'lastname')}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 shadow-sm"
                  title={`Ordenar por ${sortSessions === 'lastname' ? 'nombre' : 'apellido'}`}
                >
                  <ArrowUpDown className="w-4 h-4 text-gray-500" />
                </button>
                <ExportBtn onClick={downloadSessionsCsv} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[640px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Apellidos {sortSessions === 'lastname' && <span className="text-indigo-500">↓</span>}
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Nombres {sortSessions === 'firstname' && <span className="text-indigo-500">↓</span>}
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Ficha</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-center">Clases</th>
                    <th className="px-6 py-3 text-xs font-semibold text-green-600 uppercase text-center">Asistencias</th>
                    <th className="px-6 py-3 text-xs font-semibold text-red-600 uppercase text-center">Fallas</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-center">% Asist.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessionPaginated.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">
                        {sessionsByFicha.length === 0 ? 'No hay datos para esta ficha.' : 'Sin coincidencias.'}
                      </td>
                    </tr>
                  ) : sessionPaginated.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{s.lastName}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">
                        {s.firstName}
                        <span className="block text-xs text-gray-400 font-mono">{s.document}</span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{s.group}</td>
                      <td className="px-6 py-3 text-sm text-center text-gray-600">{s.total}</td>
                      <td className="px-6 py-3 text-sm text-center text-green-600 font-semibold">{s.present}</td>
                      <td className="px-6 py-3 text-sm text-center text-red-600 font-semibold">{s.absent}</td>
                      <td className="px-6 py-3 text-sm text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          s.rate >= 80 ? 'bg-green-100 text-green-700' :
                          s.rate >= 60 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {s.rate.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginator
              page={pageSessions}
              pages={sessionPages}
              total={sessionStatsForTable.length}
              onPageChange={setPageSessions}
            />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 2 — ASISTENCIA LMS
      ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'lms' && (
        <div className="space-y-6">

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Acceso reciente (≤7d)"
              value={lmsKpis.active}
              valueColor="text-green-600"
              sub={`de ${lmsByFicha.length} aprendices`}
            />
            <KpiCard
              label="Moderados (8–20d)"
              value={lmsKpis.moderate}
              valueColor="text-amber-500"
            />
            <KpiCard
              label="En riesgo (>20d)"
              value={lmsKpis.atRisk}
              valueColor="text-red-600"
            />
            <KpiCard
              label="Sin acceso registrado"
              value={lmsKpis.noAccess}
              valueColor="text-gray-500"
              sub={lmsKpis.avgDays !== null ? `Promedio: ${lmsKpis.avgDays}d inactivos` : undefined}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Bar — top inactivos */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[440px]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold text-gray-800">Top más inactivos</h3>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">días sin ingresar</span>
              </div>
              {lmsBarData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                  Sin datos de acceso LMS cargados
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div style={{ height: barChartHeight(lmsBarData.length), minWidth: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={lmsBarData}
                        layout="vertical"
                        margin={{ left: 0, right: 44, top: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          width={120}
                          tick={{ fontSize: 10, fill: '#4b5563' }}
                          interval={0}
                        />
                        <Tooltip
                          cursor={{ fill: '#f9fafb' }}
                          formatter={(v: number) => [`${v} días`, 'Inactividad']}
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                          labelFormatter={(_: any, payload: any[]) =>
                            payload?.[0]?.payload?.fullName ?? ''}
                        />
                        <Bar dataKey="days" name="Días" radius={[0, 4, 4, 0]} barSize={18}>
                          {lmsBarData.map((e, i) => (
                            <Cell key={i} fill={e.days > 20 ? '#ef4444' : e.days > 7 ? '#f59e0b' : '#22c55e'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Pie — categorías */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-[440px] flex flex-col">
              <h3 className="text-base font-semibold text-gray-800 mb-4">Distribución por actividad LMS</h3>
              {lmsPieData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
              ) : (
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={lmsPieData}
                        cx="50%" cy="43%"
                        innerRadius={72} outerRadius={112}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {lmsPieData.map((_, i) => (
                          <Cell key={i} fill={PIE_LMS[i % PIE_LMS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => [v, 'aprendices']} />
                      <Legend verticalAlign="bottom" height={52} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-800">
                Detalle LMS por aprendiz
                <span className="ml-2 text-sm font-normal text-gray-400">({lmsForTable.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                <SearchBar value={searchLms} onChange={setSearchLms} />
                <ExportBtn onClick={downloadLmsCsv} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[620px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Apellidos</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Nombres</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Ficha</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Último acceso</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-center">Días inactivo</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Estado LMS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lmsPaginated.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-500">Sin datos.</td>
                    </tr>
                  ) : lmsPaginated.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{s.lastName}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">
                        {s.firstName}
                        <span className="block text-xs text-gray-400 font-mono">{s.document}</span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{s.group || 'General'}</td>
                      <td className="px-6 py-3 text-sm text-gray-600 font-mono text-xs">
                        {s.lastAccess ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-3 text-sm text-center">
                        {s.days !== null && s.days >= 0 ? (
                          <span className={`font-bold tabular-nums ${
                            s.days > 20 ? 'text-red-600' : s.days > 7 ? 'text-amber-600' : 'text-green-600'
                          }`}>
                            {s.days}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.category === 'Activo (≤7d)'     ? 'bg-green-100 text-green-700' :
                          s.category === 'Moderado (8–20d)' ? 'bg-amber-100 text-amber-700' :
                          s.category === 'En riesgo (>20d)' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {s.category}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginator
              page={pageLms}
              pages={lmsPages}
              total={lmsForTable.length}
              onPageChange={setPageLms}
            />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 3 — EVIDENCIAS PENDIENTES
      ═════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'evidencias' && (
        <div className="space-y-6">

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Al día (0 pendientes)"
              value={evidenciasKpis.alDia}
              valueColor="text-green-600"
              sub={`de ${evidenciasByFicha.length} aprendices`}
            />
            <KpiCard
              label="Con pendientes"
              value={evidenciasKpis.conPendientes}
              valueColor="text-amber-500"
            />
            <KpiCard
              label="Total pendientes"
              value={evidenciasKpis.totalPending}
              valueColor="text-red-500"
              sub={`Promedio: ${evidenciasKpis.avg} por aprendiz`}
            />
            <KpiCard
              label="Actividad más pendiente"
              value={evidenciasKpis.worstActivity}
              valueColor="text-indigo-600"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Bar — pendientes por actividad */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[440px]">
              <h3 className="text-base font-semibold text-gray-800 mb-4">Pendientes por actividad</h3>
              {activityBarData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                  Sin actividades registradas
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div style={{ height: barChartHeight(activityBarData.length), minWidth: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={activityBarData}
                        layout="vertical"
                        margin={{ left: 0, right: 44, top: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          width={72}
                          tick={{ fontSize: 11, fill: '#4b5563' }}
                          interval={0}
                        />
                        <Tooltip
                          cursor={{ fill: '#f9fafb' }}
                          formatter={(v: number) => [`${v} aprendices`, 'Pendientes']}
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                          labelFormatter={(_: any, payload: any[]) =>
                            payload?.[0]?.payload?.fullName ?? ''}
                        />
                        <Bar dataKey="count" name="Pendientes" radius={[0, 4, 4, 0]} barSize={22} fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Pie — distribución por nivel */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-[440px] flex flex-col">
              <h3 className="text-base font-semibold text-gray-800 mb-4">Distribución por nivel de pendientes</h3>
              {evidenciasPieData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
              ) : (
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={evidenciasPieData}
                        cx="50%" cy="43%"
                        innerRadius={72} outerRadius={112}
                        paddingAngle={4}
                        dataKey="count"
                        nameKey="name"
                      >
                        {evidenciasPieData.map((_, i) => (
                          <Cell key={i} fill={PIE_EV[i % PIE_EV.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => [v, 'aprendices']} />
                      <Legend verticalAlign="bottom" height={52} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-800">
                Detalle evidencias por aprendiz
                <span className="ml-2 text-sm font-normal text-gray-400">({evidenciasForTable.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                <SearchBar value={searchEvidencias} onChange={setSearchEvidencias} />
                <ExportBtn onClick={downloadEvidenciasCsv} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[620px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Apellidos</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Nombres</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Ficha</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-center">Total act.</th>
                    <th className="px-6 py-3 text-xs font-semibold text-amber-600 uppercase text-center">Pendientes</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actividades pendientes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {evPaginated.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-500">Sin datos.</td>
                    </tr>
                  ) : evPaginated.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{s.lastName}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">
                        {s.firstName}
                        <span className="block text-xs text-gray-400 font-mono">{s.document}</span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{s.group || 'General'}</td>
                      <td className="px-6 py-3 text-sm text-center text-gray-600">{s.totalActivities}</td>
                      <td className="px-6 py-3 text-sm text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                          s.pendienteCount === 0 ? 'bg-green-100 text-green-700' :
                          s.pendienteCount <= 2   ? 'bg-amber-100 text-amber-700' :
                          s.pendienteCount <= 5   ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {s.pendienteCount}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-500 max-w-xs">
                        {s.pendienteActivities.length === 0 ? (
                          <span className="text-green-600 font-medium">✓ Al día</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {s.pendienteActivities.slice(0, 6).map(a => {
                              const match = a.name.match(/EV\d+/i);
                              const short = match ? match[0].toUpperCase() : a.name.slice(0, 8);
                              return (
                                <span
                                  key={a.id}
                                  className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs"
                                  title={a.name}
                                >
                                  {short}
                                </span>
                              );
                            })}
                            {s.pendienteActivities.length > 6 && (
                              <span className="text-gray-400 text-xs self-center">
                                +{s.pendienteActivities.length - 6} más
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginator
              page={pageEvidencias}
              pages={evPages}
              total={evidenciasForTable.length}
              onPageChange={setPageEvidencias}
            />
          </div>
        </div>
      )}

    </div>
  );
};

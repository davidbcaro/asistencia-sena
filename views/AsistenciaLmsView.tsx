import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, ChevronLeft, ChevronRight, Search, FileDown, Upload, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, Ficha, GradeActivity, GradeEntry } from '../types';
import { getStudents, getFichas, getLmsLastAccess, saveLmsLastAccess, getGradeActivities, getGrades } from '../services/db';

/** Normaliza valor de celda a string para documento (Excel puede devolver número o notación científica). */
function normalizeDoc(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    if (Number.isInteger(value)) return String(value).trim();
    const rounded = Math.round(value);
    return String(rounded).trim();
  }
  let s = String(value).trim();
  // Excel a veces exporta números largos como "1.23457E+7"
  const sci = /^(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/.exec(s);
  if (sci) {
    const num = parseFloat(s);
    if (!isNaN(num)) return String(Math.round(num)).trim();
  }
  return s;
}

/**
 * Devuelve la "base" del documento para emparejar: solo dígitos y sin ceros a la izquierda.
 * Así "78763222", "78763222cc", "01110553370" (app) y 1110553370 (Excel) coinciden.
 * Excel quita el cero inicial en números; la app puede guardarlo con cero.
 */
function documentBaseForMatch(doc: string): string {
  const raw = normalizeDoc(doc);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  // Quitar ceros a la izquierda para que 01110553370 y 1110553370 den el mismo key
  return digits.replace(/^0+/, '') || '0';
}

/** Normaliza texto general: minúsculas, sin tildes, sin espacios extras. */
function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * Parsea fecha desde el archivo. Acepta:
 * - "2026-01-27 10:54:31"
 * - "2026-01-27"
 * - DD/MM/YYYY HH:mm:ss
 * - Número serial de Excel (fecha)
 * Devuelve string "YYYY-MM-DD HH:mm:ss" para guardar y mostrar.
 */
function parseDateFromCell(value: unknown): string | null {
  if (value == null || value === '') return null;
  const v = String(value).trim();
  if (!v) return null;

  // Número serial de Excel (fecha)
  const num = Number(value);
  if (!isNaN(num) && num > 1000) {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + num * 86400000);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
  }

  // String: YYYY-MM-DD HH:mm:ss o YYYY-MM-DD (mes y día pueden ser 1 o 2 dígitos)
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?/.exec(v);
  if (isoMatch) {
    const [, y, m, d, H, M, S] = isoMatch;
    const h = (H ?? '0').padStart(2, '0');
    const min = (M ?? '0').padStart(2, '0');
    const sec = (S ?? '0').padStart(2, '0');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')} ${h}:${min}:${sec}`;
  }

  // DD/MM/YYYY HH:mm:ss o DD/MM/YYYY
  const dmyMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?/.exec(v);
  if (dmyMatch) {
    const [, d, m, y, H, M, S] = dmyMatch;
    const h = (H ?? '0').padStart(2, '0');
    const min = (M ?? '0').padStart(2, '0');
    const sec = (S ?? '0').padStart(2, '0');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')} ${h}:${min}:${sec}`;
  }
  return null;
}

/** Calcula días desde la fecha/hora indicada (ej. "2026-01-27 10:54:31") hasta hoy. */
function daysSince(dateStr: string): number {
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return -1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = today.getTime() - d.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

export const AsistenciaLmsView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [lmsLastAccess, setLmsLastAccess] = useState<Record<string, string>>({});
  const [gradeActivities, setGradeActivities] = useState<GradeActivity[]>([]);
  const [grades, setGrades] = useState<GradeEntry[]>([]);

  const [filterFicha, setFilterFicha] = useState<string>('Todas');
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'lastname' | 'firstname' | 'document' | 'group' | 'status' | 'lastAccess' | 'daysInactive' | 'final'>('lastname');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ITEMS_PER_PAGE = 15;

  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const loadData = () => {
    setStudents(getStudents());
    setFichas(getFichas());
    setLmsLastAccess(getLmsLastAccess());
    setGradeActivities(getGradeActivities());
    setGrades(getGrades());
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  /** Mapa rápido studentId+activityId → GradeEntry */
  const gradeMap = useMemo(() => {
    const map = new Map<string, GradeEntry>();
    grades.forEach(g => map.set(`${g.studentId}-${g.activityId}`, g));
    return map;
  }, [grades]);

  /**
   * Calcula el "Final" de un estudiante considerando TODAS las actividades de su ficha
   * (sin filtrar por fase, para mostrar el estado global en la vista LMS).
   */
  const getFinalForStudent = (student: Student): { score: number | null; letter: 'A' | 'D' | null } => {
    const fichaActivities = gradeActivities.filter(a => a.group === (student.group || ''));
    const totalActivities = fichaActivities.length;
    if (totalActivities === 0) return { score: null, letter: null };

    let missing = 0;
    let sum = 0;
    fichaActivities.forEach(activity => {
      const grade = gradeMap.get(`${student.id}-${activity.id}`);
      if (!grade) {
        missing += 1;
        sum += 0;
      } else {
        sum += grade.score;
      }
    });

    const avg = missing === totalActivities ? null : sum / totalActivities;
    const delivered = totalActivities - missing;
    const allApproved =
      delivered === totalActivities &&
      fichaActivities.every(a => gradeMap.get(`${student.id}-${a.id}`)?.letter === 'A');
    const letter: 'A' | 'D' = allApproved ? 'A' : 'D';
    return { score: avg, letter };
  };

  const handleSort = (column: typeof sortOrder) => {
    if (sortOrder === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortOrder(column);
    setSortDirection('asc');
  };

  const filteredStudents = students
    .filter(student => {
      const matchesFicha = filterFicha === 'Todas' || (student.group || 'General') === filterFicha;
      const matchesStatus = filterStatus === 'Todos' || (student.status || 'Formación') === filterStatus;
      const term = searchTerm.toLowerCase();
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const matchesSearch =
        fullName.includes(term) ||
        (student.documentNumber || '').includes(term) ||
        (student.email || '').toLowerCase().includes(term);

      return matchesFicha && matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      let cmp = 0;
      const lastA = lmsLastAccess[a.id];
      const lastB = lmsLastAccess[b.id];
      const daysA = lastA != null ? daysSince(lastA) : -1;
      const daysB = lastB != null ? daysSince(lastB) : -1;

      if (sortOrder === 'document') {
        cmp = (a.documentNumber || '').localeCompare(b.documentNumber || '');
        if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
      } else if (sortOrder === 'group') {
        cmp = (a.group || 'General').localeCompare(b.group || 'General');
        if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
      } else if (sortOrder === 'status') {
        cmp = (a.status || 'Formación').localeCompare(b.status || 'Formación');
        if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
      } else if (sortOrder === 'lastname') {
        cmp = a.lastName.localeCompare(b.lastName);
        if (cmp === 0) cmp = a.firstName.localeCompare(b.firstName);
      } else if (sortOrder === 'firstname') {
        cmp = a.firstName.localeCompare(b.firstName);
        if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
      } else if (sortOrder === 'lastAccess') {
        cmp = (lastA || '').localeCompare(lastB || '');
        if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
      } else if (sortOrder === 'daysInactive') {
        cmp = daysA - daysB;
        if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
      } else if (sortOrder === 'final') {
        const scoreA = getFinalForStudent(a).score ?? -1;
        const scoreB = getFinalForStudent(b).score ?? -1;
        cmp = scoreA - scoreB;
        if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
      }
      return direction * cmp;
    });

  const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE);
  const paginatedStudents = showAllStudents
    ? filteredStudents
    : filteredStudents.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
      );

  useEffect(() => {
    setCurrentPage(1);
  }, [filterFicha, filterStatus, searchTerm, sortOrder, sortDirection]);
  useEffect(() => {
    setCurrentPage(1);
  }, [showAllStudents]);

  useEffect(() => {
    if (!showFilters) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilters]);

  useEffect(() => {
    if (!showStatusFilter) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target as Node)) {
        setShowStatusFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStatusFilter]);

  const generateReport = () => {
    const headers = [
      'No.',
      'Documento',
      'Apellidos',
      'Nombres',
      'Correo electrónico',
      'Ficha',
      'Estado',
      'Último acceso',
      'Días sin ingresar',
      'Final',
    ];
    const rows = filteredStudents.map((student, idx) => {
      const lastAccess = lmsLastAccess[student.id];
      const days = lastAccess != null ? daysSince(lastAccess) : null;
      const final = getFinalForStudent(student);
      return [
        idx + 1,
        `"${student.documentNumber || ''}"`,
        `"${student.lastName}"`,
        `"${student.firstName}"`,
        `"${student.email || ''}"`,
        `"${student.group || 'General'}"`,
        `"${student.status || 'Formación'}"`,
        lastAccess || '-',
        days != null && days >= 0 ? String(days) : '-',
        final.letter === 'A' ? 'A' : '-',
      ];
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fichaName = filterFicha === 'Todas' ? 'todas' : filterFicha;
    link.setAttribute('download', `asistencia_lms_${fichaName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const normalizeEmail = (value: unknown): string => {
    return String(value ?? '').trim().toLowerCase();
  };

  const processRows = (
    rows: unknown[][],
    docColIndex: number,
    dateColIndex: number,
    startRowIndex: number,
    emailColIndex: number = -1
  ): { current: Record<string, string>; updated: number; skipped: number; noDate: number } => {
    const current = getLmsLastAccess();
    const studentsList = getStudents();

    // Índices de búsqueda: por documento, por email, por username
    const byDoc = new Map<string, Student>();
    const byEmail = new Map<string, Student>();
    const byUsername = new Map<string, Student>();

    studentsList.forEach(s => {
      // Por número de documento (solo dígitos, sin ceros iniciales)
      if (s.documentNumber) {
        const base = documentBaseForMatch(normalizeDoc(s.documentNumber));
        if (base) byDoc.set(base, s);
      }
      // Por email
      const email = normalizeEmail(s.email);
      if (email) byEmail.set(email, s);
      // Por username (puede ser el email o el documento del LMS)
      if (s.username) {
        const uname = normalizeEmail(s.username);
        if (uname) byUsername.set(uname, s);
        // Si el username tiene dígitos, también indexar como doc
        const ubase = documentBaseForMatch(normalizeDoc(uname));
        if (ubase && !byDoc.has(ubase)) byDoc.set(ubase, s);
      }
    });

    let updated = 0;
    let skipped = 0;
    let noDate = 0;

    for (let i = startRowIndex; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;

      // Fila completamente vacía → ignorar
      if (row.every(c => c == null || String(c).trim() === '')) continue;

      const dateParsed = parseDateFromCell(row[dateColIndex]);

      // Intentar encontrar el estudiante por múltiples métodos
      const docRaw = normalizeDoc(row[docColIndex]);
      const docBase = documentBaseForMatch(docRaw);
      const docNormalized = normalizeText(docRaw);

      let student: Student | undefined;

      // 1. Match exacto por dígitos de documento (sin ceros iniciales)
      if (!student && docBase) student = byDoc.get(docBase);

      // 2. Match por email en la columna de documento (LMS usa correo como usuario)
      if (!student && docNormalized.includes('@')) student = byEmail.get(docNormalized);

      // 3. Match por username del estudiante
      if (!student && docNormalized) student = byUsername.get(docNormalized);

      // 4. Match por columna de email (si existe)
      if (!student && emailColIndex >= 0 && row[emailColIndex] != null) {
        const email = normalizeEmail(row[emailColIndex]);
        if (email) {
          student = byEmail.get(email) ?? byUsername.get(email);
        }
      }

      // 5. Match parcial: el username del LMS puede ser solo la parte antes del @ del correo del estudiante
      if (!student && docNormalized && !docNormalized.includes('@')) {
        studentsList.forEach(s => {
          if (student) return;
          const emailLocal = normalizeEmail(s.email).split('@')[0];
          if (emailLocal && emailLocal === docNormalized) student = s;
        });
      }

      if (student) {
        if (dateParsed) {
          // Solo actualizar si la nueva fecha es más reciente o no hay fecha previa
          const existing = current[student.id];
          if (!existing || dateParsed > existing) {
            current[student.id] = dateParsed;
          }
          updated++;
        } else {
          // Encontró el estudiante pero sin fecha válida (ej: "nunca accedió")
          noDate++;
        }
      } else {
        skipped++;
      }
    }
    return { current, updated, skipped, noDate };
  };

  const normalizeHeader = (h: string) =>
    String(h || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setUploadSuccess(null);
    if (!file) return;

    const ext = (file.name || '').toLowerCase();
    const isExcel = ext.endsWith('.xlsx') || ext.endsWith('.xls');

    if (isExcel) {
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          raw: true,
        }) as unknown[][];
        if (!rows.length) {
          setUploadSuccess('El archivo no tiene filas.');
          return;
        }
        const headers = (rows[0] || []).map(h => normalizeHeader(String(h)));

        // Detectar columna de documento/usuario (LMS SENA usa "Nombre de usuario" = número de doc o correo)
        const docIdx = headers.findIndex(h =>
          h === 'nombre de usuario' ||
          h === 'usuario' ||
          h === 'username' ||
          h === 'documento' ||
          h === 'identificacion' ||
          h === 'cedula' ||
          h === 'numero de documento' ||
          h === 'num documento' ||
          h.includes('nombre de usuario') ||
          (h.includes('usuario') && !h.includes('correo') && !h.includes('nombre completo')) ||
          h.includes('documento') ||
          h.includes('identificacion') ||
          h.includes('cedula')
        );

        // Detectar columna de último acceso
        const dateIdx = headers.findIndex(h =>
          h === 'ultimo acceso' ||
          h === 'ultimo ingreso' ||
          h === 'last access' ||
          h === 'fecha ultimo acceso' ||
          h === 'fecha de acceso' ||
          h === 'acceso' ||
          h.includes('ultimo acceso') ||
          h.includes('ultimo ingreso') ||
          h.includes('last access') ||
          h.includes('fecha ultimo') ||
          (h.includes('fecha') && h.includes('acceso')) ||
          (h.includes('fecha') && !h.includes('nombre') && !h.includes('nacimiento'))
        );

        // Detectar columna de correo
        const emailIdx = headers.findIndex(h =>
          h === 'correo electronico' ||
          h === 'correo' ||
          h === 'email' ||
          h === 'direccion de correo' ||
          h.includes('correo electronico') ||
          (h.includes('correo') && !h.includes('nombre')) ||
          h.includes('email')
        );

        const docCol = docIdx >= 0 ? docIdx : 0;
        const dateCol = dateIdx >= 0 ? dateIdx : (docIdx >= 0 ? -1 : 1);
        const emailCol = emailIdx >= 0 ? emailIdx : -1;

        const hasHeaderRow = headers.some(h =>
          h && (
            h.includes('nombre de usuario') ||
            h.includes('usuario') ||
            h.includes('documento') ||
            h.includes('ultimo acceso') ||
            h.includes('apellido') ||
            h.includes('nombre') ||
            h.includes('fecha') ||
            h.includes('acceso')
          )
        );
        const startRow = hasHeaderRow ? 1 : 0;

        if (dateCol < 0) {
          setUploadSuccess('No se encontró la columna de fecha de acceso en el archivo. Verifica que tenga una columna "Último acceso".');
          return;
        }
        const { current, updated, skipped, noDate } = processRows(rows, docCol, dateCol, startRow, emailCol);
        saveLmsLastAccess(current);
        setLmsLastAccess(current);
        const parts = [`Actualizados: ${updated}`];
        if (noDate > 0) parts.push(`sin fecha: ${noDate}`);
        if (skipped > 0) parts.push(`sin match: ${skipped}`);
        setUploadSuccess(parts.join(' · ') + '.');
      } catch (err) {
        console.error(err);
        setUploadSuccess('Error al leer el Excel. Revisa que el archivo sea válido.');
      }
      return;
    }

    // CSV
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const sep = text.includes(';') ? ';' : ',';
      const rows: unknown[][] = lines.map(line =>
        line.split(sep).map(p => p.trim().replace(/^["']|["']$/g, ''))
      );
      const first = rows[0] || [];
      const headers = first.map(h => normalizeHeader(String(h)));
      const hasHeader = headers.some(h =>
        h && (
          h.includes('nombre de usuario') ||
          h.includes('usuario') ||
          h.includes('documento') ||
          h.includes('ultimo') ||
          h.includes('fecha') ||
          h.includes('apellido') ||
          h.includes('nombre') ||
          h.includes('acceso')
        )
      );
      const docIdxCsv = headers.findIndex(h =>
        h === 'nombre de usuario' ||
        h === 'usuario' ||
        h === 'username' ||
        h === 'documento' ||
        h === 'identificacion' ||
        h === 'cedula' ||
        h.includes('nombre de usuario') ||
        (h.includes('usuario') && !h.includes('correo') && !h.includes('nombre completo')) ||
        h.includes('documento') ||
        h.includes('identificacion') ||
        h.includes('cedula')
      );
      const dateIdxCsv = headers.findIndex(h =>
        h === 'ultimo acceso' ||
        h === 'ultimo ingreso' ||
        h === 'last access' ||
        h === 'acceso' ||
        h.includes('ultimo acceso') ||
        h.includes('ultimo ingreso') ||
        h.includes('last access') ||
        (h.includes('fecha') && h.includes('acceso')) ||
        (h.includes('fecha') && !h.includes('nombre') && !h.includes('nacimiento'))
      );
      const emailIdxCsv = headers.findIndex(h =>
        h === 'correo electronico' ||
        h === 'correo' ||
        h === 'email' ||
        h.includes('correo electronico') ||
        (h.includes('correo') && !h.includes('nombre')) ||
        h.includes('email')
      );
      const docCol = hasHeader && docIdxCsv >= 0 ? docIdxCsv : 0;
      const dateCol = hasHeader && dateIdxCsv >= 0 ? dateIdxCsv : 1;
      const emailCol = emailIdxCsv >= 0 ? emailIdxCsv : -1;
      const startRow = hasHeader ? 1 : 0;
      const { current, updated, skipped, noDate } = processRows(rows, docCol, dateCol, startRow, emailCol);
      saveLmsLastAccess(current);
      setLmsLastAccess(current);
      const parts2 = [`Actualizados: ${updated}`];
      if (noDate > 0) parts2.push(`sin fecha: ${noDate}`);
      if (skipped > 0) parts2.push(`sin match: ${skipped}`);
      setUploadSuccess(parts2.join(' · ') + '.');
    };
    reader.readAsText(file, 'UTF-8');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Asistencia LMS</h2>
          <p className="text-gray-500">Último acceso al LMS y días sin ingresar por aprendiz.</p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 bg-white shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="relative" ref={filtersRef}>
            <button
              type="button"
              onClick={() => setShowFilters(prev => !prev)}
              className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-300 shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Filter className="w-4 h-4 text-gray-500" />
              <span>Filtros</span>
            </button>
            {showFilters && (
              <div className="absolute right-0 mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-lg z-20 p-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Ficha</label>
                  <select
                    value={filterFicha}
                    onChange={e => {
                      setFilterFicha(e.target.value);
                      setShowFilters(false);
                    }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="Todas">Todas las Fichas</option>
                    {fichas.map(f => (
                      <option key={f.id} value={f.code}>{f.code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Estado</label>
                  <select
                    value={filterStatus}
                    onChange={e => {
                      setFilterStatus(e.target.value);
                      setShowFilters(false);
                    }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="Todos">Todos los Estados</option>
                    <option value="Formación">Formación</option>
                    <option value="Cancelado">Cancelado</option>
                    <option value="Retiro Voluntario">Retiro Voluntario</option>
                    <option value="Deserción">Deserción</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={generateReport}
            className="flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <FileDown className="w-4 h-4" />
            <span>Reporte</span>
          </button>

          <label className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>Cargar documento</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>

      {uploadSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-800">
          {uploadSuccess}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-left min-w-[1000px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-4 font-semibold text-gray-600 text-sm w-14 text-center">No.</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <button
                  type="button"
                  onClick={() => handleSort('document')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'document' ? 'text-indigo-700' : ''}`}
                >
                  Documento
                  {sortOrder === 'document' && (
                    <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm min-w-[11rem]">
                <button
                  type="button"
                  onClick={() => handleSort('lastname')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'lastname' ? 'text-indigo-700' : ''}`}
                >
                  Apellidos
                  {sortOrder === 'lastname' && (
                    <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm min-w-[11rem]">
                <button
                  type="button"
                  onClick={() => handleSort('firstname')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'firstname' ? 'text-indigo-700' : ''}`}
                >
                  Nombres
                  {sortOrder === 'firstname' && (
                    <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-80 min-w-[20rem]">Correo electrónico</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <button
                  type="button"
                  onClick={() => handleSort('group')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'group' ? 'text-indigo-700' : ''}`}
                >
                  Ficha
                  {sortOrder === 'group' && (
                    <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <div className="relative inline-flex items-center gap-2" ref={statusFilterRef}>
                  <button
                    type="button"
                    onClick={() => setShowStatusFilter(prev => !prev)}
                    className="inline-flex items-center gap-1 hover:text-gray-900"
                  >
                    Estado
                    <Filter className="w-3.5 h-3.5 text-gray-400" />
                    {filterStatus !== 'Todos' && (
                      <span className="text-indigo-600 text-xs">({filterStatus})</span>
                    )}
                  </button>
                  {showStatusFilter && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowStatusFilter(false)} />
                      <div className="absolute left-0 top-full mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1">
                        {['Todos los Estados', 'Formación', 'Cancelado', 'Retiro Voluntario', 'Deserción'].map(opt => {
                          const val = opt === 'Todos los Estados' ? 'Todos' : opt;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => {
                                setFilterStatus(val);
                                setShowStatusFilter(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm ${filterStatus === val ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <button
                  type="button"
                  onClick={() => handleSort('lastAccess')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'lastAccess' ? 'text-indigo-700' : ''}`}
                >
                  Último acceso
                  {sortOrder === 'lastAccess' && (
                    <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <button
                  type="button"
                  onClick={() => handleSort('daysInactive')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'daysInactive' ? 'text-indigo-700' : ''}`}
                >
                  Días sin ingresar
                  {sortOrder === 'daysInactive' && (
                    <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <button
                  type="button"
                  onClick={() => handleSort('final')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'final' ? 'text-indigo-700' : ''}`}
                >
                  Final
                  {sortOrder === 'final' && (
                    <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedStudents.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                  {students.length === 0
                    ? 'No hay aprendices registrados.'
                    : searchTerm
                    ? 'No se encontraron aprendices con ese criterio.'
                    : 'No hay aprendices en esta ficha.'}
                </td>
              </tr>
            ) : (
              paginatedStudents.map((student, index) => {
                const lastAccess = lmsLastAccess[student.id];
                const days = lastAccess != null ? daysSince(lastAccess) : null;
                return (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 text-center text-gray-500 text-xs tabular-nums">
                      {showAllStudents ? index + 1 : (currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-mono text-xs">
                      {student.documentNumber || '-'}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900 text-xs min-w-[11rem]">
                      {student.lastName}
                    </td>
                    <td className="px-6 py-4 text-gray-800 text-xs min-w-[11rem]">
                      {student.firstName}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm w-80 min-w-[20rem] whitespace-nowrap" title={student.email || undefined}>
                      {student.email || <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <Users className="w-3 h-3 mr-1" />
                        {student.group || 'General'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          student.status === 'Formación'
                            ? 'bg-green-100 text-green-800'
                            : student.status === 'Cancelado'
                            ? 'bg-yellow-100 text-yellow-800'
                            : student.status === 'Retiro Voluntario'
                            ? 'bg-orange-100 text-orange-800'
                            : student.status === 'Deserción'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {student.status || 'Formación'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm tabular-nums">
                      {lastAccess || '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm tabular-nums">
                      {days != null && days >= 0 ? String(days) : '-'}
                    </td>
                    {(() => {
                      const final = getFinalForStudent(student);
                      return (
                        <td className="px-6 py-4 text-sm text-center">
                          {final.letter === 'A'
                            ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">A</span>
                            : <span className="text-gray-400">-</span>
                          }
                        </td>
                      );
                    })()}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 flex-wrap gap-2">
          <span className="text-sm text-gray-500">
            {showAllStudents
              ? `Mostrando todos (${filteredStudents.length} aprendices)`
              : `Mostrando ${(currentPage - 1) * ITEMS_PER_PAGE + 1} a ${Math.min(currentPage * ITEMS_PER_PAGE, filteredStudents.length)} de ${filteredStudents.length} resultados`}
          </span>
          <div className="flex items-center gap-3">
            {showAllStudents ? (
              <button
                type="button"
                onClick={() => setShowAllStudents(false)}
                className="text-indigo-600 hover:text-indigo-700 font-medium text-sm"
              >
                Mostrar 15 por página
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowAllStudents(true)}
                  className="text-indigo-600 hover:text-indigo-700 font-medium text-sm"
                >
                  Mostrar todos
                </button>
                {totalPages > 1 && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                      Página {currentPage} de {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

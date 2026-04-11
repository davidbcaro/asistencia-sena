import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, ChevronLeft, ChevronRight, Search, FileDown, Upload, Users, X, BookOpen, ListChecks } from 'lucide-react';
import ExcelJS from 'exceljs';
import { Student, Ficha, GradeActivity, GradeEntry } from '../types';
import { getStudents, getFichas, getLmsLastAccess, saveLmsLastAccess, getGradeActivities, getGrades, getDebidoProcesoState, saveDebidoProcesoStep, getRetiroVoluntarioState, saveRetiroVoluntarioStep, getPlanMejoramientoState, savePlanMejoramientoStep, getEstadoStepperTooltip } from '../services/db';
import {
  ALL_EVIDENCE_AREAS,
  activityMatchesEvidenceArea,
  buildEvidenceAreaOptions,
  shortEvidenceLabel,
  filterActsForPendingEvidence,
  type EvidencePendingScope,
} from '../services/evidenceMeta';

/** Pasos del stepper Cancelación (igual que DebidoProcesoView). */
const CANCELACION_STEPS: { step: number; tooltip: string }[] = [
  { step: 0, tooltip: 'Sin novedad' },
  { step: 1, tooltip: 'Correo riesgo de deserción' },
  { step: 2, tooltip: 'Agregar novedad al acta' },
  { step: 3, tooltip: 'Correo Coordinación (5 días)' },
  { step: 4, tooltip: 'Cancelación' },
  { step: 5, tooltip: 'Cancelación en Sofia Plus' },
];

/** Pasos del stepper Retiro voluntario (igual que DebidoProcesoView). */
const RETIRO_STEPS: { step: number; tooltip: string }[] = [
  { step: 1, tooltip: 'Sin novedad' },
  { step: 2, tooltip: 'Intención de retiro' },
  { step: 3, tooltip: 'Solicitud de retiro' },
  { step: 4, tooltip: 'Agregar novedad de retiro al acta' },
  { step: 5, tooltip: 'Retiro efectuado en Sofia Plus' },
];

/** Pasos del stepper Plan de mejoramiento (igual que DebidoProcesoView). */
const PMA_STEPS: { step: number; tooltip: string }[] = [
  { step: 0, tooltip: 'Sin PMA' },
  { step: 1, tooltip: 'Se asigna PMA' },
  { step: 2, tooltip: 'Aprobación de PMA' },
];

/** Mini stepper para Cancelación / Retiro voluntario (misma lógica que DebidoProcesoView). */
function AsistenciaLmsStepper(props: {
  steps: { step: number; tooltip: string }[];
  currentStep: number;
  defaultStep: number;
  onStepClick: (step: number) => void;
}) {
  const { steps, currentStep, defaultStep, onStepClick } = props;
  const effective = steps.some((s) => s.step === currentStep) ? currentStep : defaultStep;
  const current = effective;
  return (
    <div className="flex items-center gap-0 justify-center" role="group" aria-label="Estado">
      {steps.map(({ step, tooltip }, i) => {
        const isDone = step < current;
        const isCurrent = step === current;
        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div
                className={`h-0.5 w-4 flex-shrink-0 ${isDone ? 'bg-teal-500' : 'bg-gray-200'}`}
                aria-hidden
              />
            )}
            <button
              type="button"
              title={tooltip}
              onClick={() => onStepClick(step)}
              className={`relative flex-shrink-0 rounded-full p-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 ${
                isDone
                  ? 'bg-teal-500 text-white hover:bg-teal-600'
                  : isCurrent
                    ? 'bg-teal-500 text-white ring-2 ring-teal-300 ring-offset-1 hover:bg-teal-600'
                    : 'bg-gray-200 text-gray-400 hover:bg-gray-300'
              }`}
              style={{ width: 22, height: 22 }}
            >
              {isDone ? (
                <svg className="w-full h-full" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              ) : (
                <span className="sr-only">{step}. {tooltip}</span>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

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

/** Clave canónica de una actividad — mismo algoritmo que CalificacionesView. */
function getActivityCanonicalKey(a: { name: string; detail?: string | null }): string {
  const baseName = `${a.name} ${a.detail ?? ''}`.trim();
  const gaFullMatch = baseName.match(/GA\d+-\d+-AA\d+-EV\d+/i);
  if (gaFullMatch) return normalizeText(gaFullMatch[0]);
  const aaEvMatch = baseName.match(/AA\d+-EV\d+/i);
  if (aaEvMatch) return normalizeText(aaEvMatch[0]);
  const evMatch = baseName.match(/ev(idencia)?\s*(\d+)/i);
  if (evMatch) return 'ev' + String(parseInt(evMatch[2], 10));
  const numMatch = baseName.match(/(\d+)/);
  if (numMatch) return 'ev' + String(parseInt(numMatch[1], 10));
  return normalizeText(baseName) || baseName;
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

const ALL_PHASES_LMS = 'Todas las fases';

export const AsistenciaLmsView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [lmsLastAccess, setLmsLastAccess] = useState<Record<string, string>>({});
  const [gradeActivities, setGradeActivities] = useState<GradeActivity[]>([]);
  const [grades, setGrades] = useState<GradeEntry[]>([]);

  const [filterFicha, setFilterFicha] = useState<string>('Todas');
  const [filterFase, setFilterFase] = useState<string[]>([]);
  const [filterEvidenceArea, setFilterEvidenceArea] = useState<string>(ALL_EVIDENCE_AREAS);
  const [selectedEvidenceIdList, setSelectedEvidenceIdList] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [filterNovedad, setFilterNovedad] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'lastname' | 'firstname' | 'document' | 'group' | 'status' | 'lastAccess' | 'daysInactive' | 'final'>('lastname');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [showFichaDropdown, setShowFichaDropdown] = useState(false);
  const [showFaseDropdown, setShowFaseDropdown] = useState(false);
  const [evidencePickerOpen, setEvidencePickerOpen] = useState(false);
  const [pendientesModalStudent, setPendientesModalStudent] = useState<Student | null>(null);
  const fichaDropdownRef = useRef<HTMLDivElement>(null);
  const faseDropdownRef = useRef<HTMLDivElement>(null);
  const evidencePickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ITEMS_PER_PAGE = 15;

  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [cancelacionMap, setCancelacionMap] = useState<Record<string, number>>({});
  const [retiroMap, setRetiroMap] = useState<Record<string, number>>({});
  const [pmaMap, setPmaMap] = useState<Record<string, number>>({});

  const loadData = () => {
    setStudents(getStudents());
    setFichas(getFichas());
    setLmsLastAccess(getLmsLastAccess());
    setGradeActivities(getGradeActivities());
    setGrades(getGrades());
    setCancelacionMap(getDebidoProcesoState());
    setRetiroMap(getRetiroVoluntarioState());
    setPmaMap(getPlanMejoramientoState());
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  // Click-outside: close dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fichaDropdownRef.current && !fichaDropdownRef.current.contains(e.target as Node)) setShowFichaDropdown(false);
      if (faseDropdownRef.current && !faseDropdownRef.current.contains(e.target as Node)) setShowFaseDropdown(false);
      if (evidencePickerRef.current && !evidencePickerRef.current.contains(e.target as Node)) setEvidencePickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /** Available phases derived from all activities (same pattern as AlertsView) */
  const lmsPhaseOptions = useMemo(() => {
    const known = ['Fase Inducción', 'Fase 1: Análisis', 'Fase 2: Planeación', 'Fase 3: Ejecución', 'Fase 4: Evaluación'];
    const extra = [...new Set(gradeActivities.map(a => a.phase).filter(Boolean) as string[])]
      .filter(p => !known.includes(p))
      .sort((a, b) => a.localeCompare(b, 'es'));
    return [ALL_PHASES_LMS, ...known.filter(p => gradeActivities.some(a => a.phase === p)), ...extra];
  }, [gradeActivities]);

  /** Activities visible for the selected ficha (global seeds + ficha-specific) */
  const evidenceBasePool = useMemo(() => {
    const isAll = filterFicha === 'Todas';
    let pool = gradeActivities.filter(a => a.group === '' || (isAll ? false : a.group === filterFicha));
    if (filterFase.length > 0) pool = pool.filter(a => filterFase.includes(a.phase ?? ''));
    return [...pool].sort((a, b) =>
      (a.phase || '').localeCompare(b.phase || '', 'es') || a.name.localeCompare(b.name, 'es')
    );
  }, [gradeActivities, filterFicha, filterFase]);

  const lmsEvAreaOptions = useMemo(() => buildEvidenceAreaOptions(evidenceBasePool), [evidenceBasePool]);

  const evidencePickerPool = useMemo(
    () => evidenceBasePool.filter(a => activityMatchesEvidenceArea(a, filterEvidenceArea)),
    [evidenceBasePool, filterEvidenceArea]
  );

  const selectedEvidenceIdSet = useMemo(
    () => new Set(selectedEvidenceIdList),
    [selectedEvidenceIdList]
  );

  // Reset area filter if it's no longer available
  useEffect(() => {
    if (!lmsEvAreaOptions.includes(filterEvidenceArea)) setFilterEvidenceArea(ALL_EVIDENCE_AREAS);
  }, [lmsEvAreaOptions, filterEvidenceArea]);

  // Reset selected evidences when pool changes
  useEffect(() => {
    const valid = new Set(evidencePickerPool.map(a => a.id));
    setSelectedEvidenceIdList(prev => prev.filter(id => valid.has(id)));
  }, [evidencePickerPool]);

  const pendingScope = useMemo<EvidencePendingScope>(() => ({
    phaseFilter: filterFase,
    allPhasesLabel: ALL_PHASES_LMS,
    areaFilter: filterEvidenceArea,
    selectedActivityIds: selectedEvidenceIdSet,
  }), [filterFase, filterEvidenceArea, selectedEvidenceIdSet]);

  const toggleFase = (phase: string) => {
    setFilterFase(prev =>
      prev.includes(phase) ? prev.filter(p => p !== phase) : [...prev, phase]
    );
  };

  /** Mapa rápido studentId+activityId → GradeEntry */
  const gradeMap = useMemo(() => {
    const map = new Map<string, GradeEntry>();
    grades.forEach(g => map.set(`${g.studentId}-${g.activityId}`, g));
    return map;
  }, [grades]);

  /**
   * Mapa por clave canónica: `studentId-canonicalKey` → GradeEntry
   * Permite encontrar calificaciones aunque el activityId haya cambiado (ej: semillas vs ficha-específicas).
   */
  const canonicalGradeMap = useMemo(() => {
    const activityCanonical = new Map<string, string>();
    gradeActivities.forEach(a => activityCanonical.set(a.id, getActivityCanonicalKey(a)));
    const map = new Map<string, GradeEntry>();
    grades.forEach(g => {
      const canonical = activityCanonical.get(g.activityId);
      if (!canonical) return;
      const key = `${g.studentId}-${canonical}`;
      const existing = map.get(key);
      if (!existing || g.updatedAt > existing.updatedAt) map.set(key, g);
    });
    return map;
  }, [grades, gradeActivities]);

  /**
   * Devuelve las actividades deduplicadas por clave canónica para un estudiante.
   * Combina semillas globales (group='') y actividades ficha-específicas,
   * eliminando duplicados (la versión ficha-específica prevalece).
   */
  const getStudentActivities = (student: Student): GradeActivity[] => {
    const studentGroup = student.group || '';
    const byCanonical = new Map<string, GradeActivity>();
    // Base: semillas globales
    gradeActivities.filter(a => a.group === '').forEach(a => byCanonical.set(getActivityCanonicalKey(a), a));
    // Sobreescribir con versiones ficha-específicas si las hay
    if (studentGroup) {
      gradeActivities.filter(a => a.group === studentGroup).forEach(a => byCanonical.set(getActivityCanonicalKey(a), a));
    }
    return Array.from(byCanonical.values());
  };

  /** Lookup de calificación tolerante a cambios de ID: primero intenta exacto, luego por clave canónica. */
  const getGradeForActivity = (studentId: string, activity: GradeActivity): GradeEntry | undefined =>
    gradeMap.get(`${studentId}-${activity.id}`) ??
    canonicalGradeMap.get(`${studentId}-${getActivityCanonicalKey(activity)}`);

  /**
   * Calcula el "Final" de un estudiante considerando las actividades de su ficha.
   * Usa deduplicación por clave canónica para tolerar cambios de ID entre importaciones.
   */
  const getFinalForStudent = (student: Student): { score: number | null; letter: 'A' | 'D' | null } => {
    const fichaActivities = getStudentActivities(student);
    const totalActivities = fichaActivities.length;
    if (totalActivities === 0) return { score: null, letter: null };

    let missing = 0;
    let sum = 0;
    fichaActivities.forEach(activity => {
      const grade = getGradeForActivity(student.id, activity);
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
      fichaActivities.every(a => getGradeForActivity(student.id, a)?.letter === 'A');
    const letter: 'A' | 'D' = allApproved ? 'A' : 'D';
    return { score: avg, letter };
  };

  /** Etiqueta corta de actividad (EV01, EV02, … o nombre). */
  const getActivityShortLabel = (name: string) => {
    const match = name.match(/EV\d+/i);
    return match ? match[0].toUpperCase() : name;
  };

  /**
   * Pendientes del aprendiz: actividades sin calificación o con letra D,
   * filtradas por el pendingScope activo (fase + área + evidencias seleccionadas).
   */
  const getPendientesForStudent = (student: Student): { count: number; activities: GradeActivity[] } => {
    const fichaActivities = getStudentActivities(student);
    const scopedActivities = filterActsForPendingEvidence(fichaActivities, pendingScope);
    const pending: GradeActivity[] = [];
    scopedActivities.forEach(activity => {
      const grade = getGradeForActivity(student.id, activity);
      if (!grade || grade.letter !== 'A') pending.push(activity);
    });
    return { count: pending.length, activities: pending };
  };

  /**
   * Calcula el valor de "Novedad" según:
   * - Estado "Formación" y días sin ingresar >= 20 → "Riesgo de deserción"
   * - Estado "Formación" y Final no es "A" y días sin ingresar < 20 → "Plan de mejoramiento"
   * - Resto → "-"
   */
  const getNovedad = (student: Student, daysInactive: number | null, finalLetter: 'A' | 'D' | null): string => {
    const status = student.status || 'Formación';
    if (status !== 'Formación') return '-';
    const days = daysInactive != null && daysInactive >= 0 ? daysInactive : -1;
    if (days >= 20) return 'Riesgo de deserción';
    if (finalLetter !== 'A' && days >= 0 && days < 20) return 'Plan de mejoramiento';
    return '-';
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
      const lastAccess = lmsLastAccess[student.id];
      const days = lastAccess != null ? daysSince(lastAccess) : null;
      const final = getFinalForStudent(student);
      const novedad = getNovedad(student, days, final.letter);
      const novedadFilterValue = filterNovedad === 'Sin novedad' ? '-' : filterNovedad;
      const matchesNovedad = filterNovedad === 'Todos' || novedad === novedadFilterValue;
      const term = searchTerm.toLowerCase();
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const matchesSearch =
        fullName.includes(term) ||
        (student.documentNumber || '').includes(term) ||
        (student.email || '').toLowerCase().includes(term);

      return matchesFicha && matchesStatus && matchesNovedad && matchesSearch;
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
  }, [filterFicha, filterFase, filterStatus, filterNovedad, searchTerm, sortOrder, sortDirection]);
  useEffect(() => {
    setCurrentPage(1);
  }, [showAllStudents]);


  const generateReport = async () => {
    // Collect all unique activities (by full name) across filtered students, respecting current scope filters
    const activityColMap = new Map<string, GradeActivity>();
    filteredStudents.forEach(student => {
      const scoped = filterActsForPendingEvidence(getStudentActivities(student), pendingScope);
      scoped.forEach(a => {
        const colKey = [a.name, a.detail].filter(Boolean).join(' ');
        if (!activityColMap.has(colKey)) activityColMap.set(colKey, a);
      });
    });
    const activityCols = [...activityColMap.entries()].sort(([, a], [, b]) =>
      (a.phase || '').localeCompare(b.phase || '', 'es') || a.name.localeCompare(b.name, 'es')
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('LMS');

    // Base columns + one per evidence
    const BASE_COUNT = 10; // No. Documento Nombres Apellidos Correo Ficha Estado ÚltimoAcceso Días Pendientes
    ws.columns = [
      { header: 'No.',                  width: 5 },
      { header: 'Documento',            width: 14 },
      { header: 'Nombres',              width: 20 },
      { header: 'Apellidos',            width: 20 },
      { header: 'Correo electrónico',   width: 30 },
      { header: 'Ficha',                width: 12 },
      { header: 'Estado',               width: 14 },
      { header: 'Último acceso',        width: 22 },
      { header: 'Días sin ingresar',    width: 9 },
      { header: 'Pendientes',           width: 12 },
      ...activityCols.map(([colKey]) => ({ header: colKey, width: 7 })),
    ];

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.height = 50;
    headerRow.eachCell((cell, colNum) => {
      cell.font = { bold: true };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNum >= BASE_COUNT - 1 ? 'center' : 'left', // center Días, Pendientes, evidencias
        wrapText: colNum > BASE_COUNT, // wrap text only for evidence columns
      };
    });

    // Data rows
    filteredStudents.forEach((student, idx) => {
      const lastAccess = lmsLastAccess[student.id];
      const days = lastAccess != null ? daysSince(lastAccess) : null;
      const { count, activities: pendingActivities } = getPendientesForStudent(student);
      const pendingNames = new Set(pendingActivities.map(a => [a.name, a.detail].filter(Boolean).join(' ')));

      const values: (string | number)[] = [
        idx + 1,
        student.documentNumber || '',
        student.firstName,
        student.lastName,
        student.email || '',
        student.group || 'General',
        student.status || 'Formación',
        lastAccess || '-',
        days != null && days >= 0 ? days : '-',
        count > 0 ? count : '-',
        ...activityCols.map(([colKey]) => (pendingNames.has(colKey) ? 'x' : '')),
      ];

      const row = ws.addRow(values);

      // Center-align Días sin ingresar (col 9), Pendientes (col 10), and all evidence cols
      for (let c = 9; c <= BASE_COUNT + activityCols.length; c++) {
        row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fichaName = filterFicha === 'Todas' ? 'todas' : filterFicha;
    link.download = `asistencia_lms_${fichaName}_${new Date().toISOString().split('T')[0]}.xlsx`;
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
    <div className="space-y-6 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-gray-900">Asistencia LMS</h2>
          <p className="text-gray-500">Último acceso al LMS y días sin ingresar por aprendiz.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Búsqueda */}
          <div className="relative min-w-[160px] flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar aprendiz..."
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none w-full bg-white shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="hidden sm:block w-px h-6 bg-gray-200" />

          {/* Filtro Ficha */}
          <div className="relative" ref={fichaDropdownRef}>
            <button
              type="button"
              onClick={() => { setShowFichaDropdown(p => !p); setShowFaseDropdown(false); setEvidencePickerOpen(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm whitespace-nowrap ${showFichaDropdown ? 'bg-teal-600 border-teal-600 text-white' : filterFicha !== 'Todas' ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              <Filter className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Ficha</span>
              {filterFicha !== 'Todas' && (
                <span className={`text-xs font-semibold max-w-[5rem] truncate ${showFichaDropdown ? 'text-teal-100' : 'text-teal-600'}`}>{filterFicha}</span>
              )}
            </button>
            {showFichaDropdown && (
              <div className="absolute left-0 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1 max-h-72 overflow-y-auto">
                {[{ code: 'Todas', label: 'Todas las fichas' }, ...fichas.map(f => ({ code: f.code, label: `${f.code} — ${f.program}` }))].map(opt => (
                  <button key={opt.code} type="button"
                    onClick={() => { setFilterFicha(opt.code); setShowFichaDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-teal-50 hover:text-teal-700 transition-colors ${filterFicha === opt.code ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}
                  >{opt.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* Filtro Fase */}
          <div className="relative" ref={faseDropdownRef}>
            <button
              type="button"
              onClick={() => { setShowFaseDropdown(p => !p); setShowFichaDropdown(false); setEvidencePickerOpen(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm whitespace-nowrap ${showFaseDropdown ? 'bg-teal-600 border-teal-600 text-white' : filterFase.length > 0 ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Fase</span>
              {filterFase.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${showFaseDropdown ? 'bg-white/20 text-white' : 'bg-teal-500 text-white'}`}>{filterFase.length}</span>
              )}
            </button>
            {showFaseDropdown && (
              <div className="absolute left-0 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1 max-h-72 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setFilterFase([])}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-teal-50 hover:text-teal-700 transition-colors ${filterFase.length === 0 ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}
                >{ALL_PHASES_LMS}</button>
                <div className="border-t border-gray-100 my-1" />
                {lmsPhaseOptions.filter(ph => ph !== ALL_PHASES_LMS).map(ph => (
                  <label key={ph} className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-teal-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterFase.includes(ph)}
                      onChange={() => toggleFase(ph)}
                      className="w-3.5 h-3.5 accent-teal-600 flex-shrink-0"
                    />
                    <span className={filterFase.includes(ph) ? 'text-teal-700 font-medium' : 'text-gray-700'}>
                      {ph.replace(/^Fase\s*\d*:?\s*/i, '')}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Filtro Evidencias */}
          <div className="relative" ref={evidencePickerRef}>
            <button
              type="button"
              onClick={() => { setEvidencePickerOpen(p => !p); setShowFichaDropdown(false); setShowFaseDropdown(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm whitespace-nowrap ${evidencePickerOpen ? 'bg-teal-600 border-teal-600 text-white' : (filterEvidenceArea !== ALL_EVIDENCE_AREAS || selectedEvidenceIdList.length > 0) ? 'bg-teal-50 border-teal-400 text-teal-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              <ListChecks className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Evidencias</span>
              {(filterEvidenceArea !== ALL_EVIDENCE_AREAS || selectedEvidenceIdList.length > 0) && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${evidencePickerOpen ? 'bg-white/20 text-white' : 'bg-teal-500 text-white'}`}>
                  {selectedEvidenceIdList.length > 0 ? `${selectedEvidenceIdList.length}/${evidencePickerPool.length}` : evidencePickerPool.length}
                </span>
              )}
            </button>
            {evidencePickerOpen && (
              <div className="absolute left-0 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Filtrar evidencias para Pendientes</p>
                </div>
                <div className="p-3 space-y-3">
                  {/* Área */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Área</p>
                    <select
                      className="w-full pl-2.5 pr-8 py-1.5 border border-gray-200 rounded-lg text-xs bg-white font-medium text-gray-700 focus:ring-2 focus:ring-teal-500 outline-none"
                      value={filterEvidenceArea}
                      onChange={e => { setFilterEvidenceArea(e.target.value); setSelectedEvidenceIdList([]); }}
                    >
                      {lmsEvAreaOptions.map(ar => (
                        <option key={ar} value={ar}>{ar === ALL_EVIDENCE_AREAS ? 'Todas las áreas' : ar}</option>
                      ))}
                    </select>
                  </div>
                  {/* Evidencias individuales */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Columnas</p>
                      {selectedEvidenceIdList.length > 0 && (
                        <button type="button" onClick={() => setSelectedEvidenceIdList([])}
                          className="text-[11px] text-teal-600 hover:text-teal-800 font-medium">Mostrar todas</button>
                      )}
                    </div>
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100">
                      {evidencePickerPool.length === 0
                        ? <p className="text-xs text-gray-400 py-4 text-center">Sin evidencias en este contexto.</p>
                        : evidencePickerPool.map(a => {
                          const implicitAll = selectedEvidenceIdList.length === 0;
                          const checked = implicitAll || selectedEvidenceIdSet.has(a.id);
                          return (
                            <label key={a.id} className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-white transition-colors ${checked ? '' : 'opacity-50'}`}>
                              <input type="checkbox" checked={checked}
                                onChange={() => {
                                  const poolIds = evidencePickerPool.map(x => x.id);
                                  setSelectedEvidenceIdList(prev => {
                                    if (prev.length === 0) return poolIds.filter(x => x !== a.id);
                                    const s = new Set(prev);
                                    if (s.has(a.id)) s.delete(a.id); else s.add(a.id);
                                    const arr = Array.from(s);
                                    return arr.length === 0 || arr.length === poolIds.length ? [] : arr;
                                  });
                                }}
                                className="w-3.5 h-3.5 text-teal-600 border-gray-300 rounded focus:ring-teal-500 flex-shrink-0"
                              />
                              <span className="flex-1 min-w-0">
                                <span className="font-mono text-[11px] font-semibold text-teal-700">{shortEvidenceLabel(a.name)}</span>
                                {(a.detail || a.name) && (
                                  <span className="block text-[11px] text-gray-400 truncate leading-tight mt-0.5">
                                    {(a.detail || a.name).replace(/^Evidencia de (?:conocimiento|producto|desempe[ñn]o):\s*/i, '')}
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })
                      }
                    </div>
                  </div>
                  {(filterEvidenceArea !== ALL_EVIDENCE_AREAS || selectedEvidenceIdList.length > 0) && (
                    <button type="button"
                      onClick={() => { setFilterEvidenceArea(ALL_EVIDENCE_AREAS); setSelectedEvidenceIdList([]); }}
                      className="w-full text-center text-xs text-gray-400 hover:text-red-500 py-1 transition-colors">
                      Limpiar filtros
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="hidden sm:block w-px h-6 bg-gray-200" />

          {/* Estado */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-medium text-gray-700 focus:ring-2 focus:ring-teal-500 outline-none shadow-sm"
          >
            <option value="Todos">Todos los estados</option>
            <option value="Formación">Formación</option>
            <option value="Cancelado">Cancelado</option>
            <option value="Retiro Voluntario">Retiro Voluntario</option>
            <option value="Deserción">Deserción</option>
          </select>

          {/* Novedad */}
          <select
            value={filterNovedad}
            onChange={e => setFilterNovedad(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-medium text-gray-700 focus:ring-2 focus:ring-teal-500 outline-none shadow-sm"
          >
            <option value="Todos">Todas las novedades</option>
            <option value="Riesgo de deserción">Riesgo de deserción</option>
            <option value="Plan de mejoramiento">Plan de mejoramiento</option>
            <option value="Sin novedad">Sin novedad</option>
          </select>

          <div className="hidden sm:block w-px h-6 bg-gray-200" />

          <button
            onClick={generateReport}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg transition-colors shadow-sm text-sm font-medium"
          >
            <FileDown className="w-4 h-4" />
            <span>Reporte</span>
          </button>

          <label className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg transition-colors shadow-sm cursor-pointer text-sm font-medium">
            <Upload className="w-4 h-4" />
            <span>Cargar</span>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      {uploadSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-800">
          {uploadSuccess}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-4 font-semibold text-gray-600 text-sm w-14 text-center">No.</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <button
                  type="button"
                  onClick={() => handleSort('document')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'document' ? 'text-teal-700' : ''}`}
                >
                  Documento
                  {sortOrder === 'document' && (
                    <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm min-w-[11rem]">
                <button
                  type="button"
                  onClick={() => handleSort('firstname')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'firstname' ? 'text-teal-700' : ''}`}
                >
                  Nombres
                  {sortOrder === 'firstname' && (
                    <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm min-w-[11rem]">
                <button
                  type="button"
                  onClick={() => handleSort('lastname')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'lastname' ? 'text-teal-700' : ''}`}
                >
                  Apellidos
                  {sortOrder === 'lastname' && (
                    <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm min-w-[12rem]">Correo electrónico</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <button
                  type="button"
                  onClick={() => handleSort('group')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'group' ? 'text-teal-700' : ''}`}
                >
                  Ficha
                  {sortOrder === 'group' && (
                    <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                Estado
                {filterStatus !== 'Todos' && <span className="ml-1 text-teal-600 text-xs font-normal">({filterStatus})</span>}
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm text-center">Pendientes</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <button
                  type="button"
                  onClick={() => handleSort('lastAccess')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'lastAccess' ? 'text-teal-700' : ''}`}
                >
                  Último acceso
                  {sortOrder === 'lastAccess' && (
                    <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <button
                  type="button"
                  onClick={() => handleSort('daysInactive')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'daysInactive' ? 'text-teal-700' : ''}`}
                >
                  Días sin ingresar
                  {sortOrder === 'daysInactive' && (
                    <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <button
                  type="button"
                  onClick={() => handleSort('final')}
                  className={`inline-flex items-center gap-1 hover:text-gray-900 ${sortOrder === 'final' ? 'text-teal-700' : ''}`}
                >
                  Final
                  {sortOrder === 'final' && (
                    <span className="text-teal-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                Novedad
                {filterNovedad !== 'Todos' && <span className="ml-1 text-teal-600 text-xs font-normal">({filterNovedad})</span>}
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm text-center">Cancelación</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm text-center">Retiro voluntario</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm text-center min-w-[140px]">Plan de mejoramiento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedStudents.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-6 py-8 text-center text-gray-500">
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
                      {student.firstName}
                    </td>
                    <td className="px-6 py-4 text-gray-800 text-xs min-w-[11rem]">
                      {student.lastName}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm" title={student.email || undefined}>
                      <div className="max-w-[16rem] truncate">
                        {student.email || <span className="text-gray-400">-</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <Users className="w-3 h-3 mr-1" />
                        {student.group || 'General'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        title={getEstadoStepperTooltip(student.id, student.status)}
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
                    {(() => {
                      const { count, activities } = getPendientesForStudent(student);
                      return (
                        <td className="px-6 py-4 text-sm text-center">
                          <button
                            type="button"
                            onClick={() => setPendientesModalStudent(student)}
                            className={`font-semibold tabular-nums ${count > 0 ? 'text-amber-600 hover:text-amber-700 hover:underline' : 'text-gray-500'}`}
                            title={count > 0 ? 'Ver detalle de pendientes' : undefined}
                          >
                            {count}
                          </button>
                        </td>
                      );
                    })()}
                    <td className="px-6 py-4 text-gray-600 text-sm tabular-nums">
                      {lastAccess || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm tabular-nums">
                      {days != null && days >= 0
                        ? <span className={days >= 20 ? 'font-semibold text-red-600' : 'text-gray-600'}>{days}</span>
                        : <span className="text-gray-400">-</span>}
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
                    {(() => {
                      const final = getFinalForStudent(student);
                      const novedad = getNovedad(student, days, final.letter);
                      return (
                        <td className="px-6 py-4 text-sm">
                          {novedad === 'Riesgo de deserción' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Riesgo de deserción
                            </span>
                          ) : novedad === 'Plan de mejoramiento' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              Plan de mejoramiento
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      );
                    })()}
                    <td className="px-6 py-4">
                      <AsistenciaLmsStepper
                        steps={CANCELACION_STEPS}
                        currentStep={cancelacionMap[student.id] ?? 0}
                        defaultStep={0}
                        onStepClick={(step) => {
                          saveDebidoProcesoStep(student.id, step);
                          setCancelacionMap(getDebidoProcesoState());
                        }}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <AsistenciaLmsStepper
                        steps={RETIRO_STEPS}
                        currentStep={retiroMap[student.id] ?? 1}
                        defaultStep={1}
                        onStepClick={(step) => {
                          saveRetiroVoluntarioStep(student.id, step);
                          setRetiroMap(getRetiroVoluntarioState());
                        }}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <AsistenciaLmsStepper
                        steps={PMA_STEPS}
                        currentStep={pmaMap[student.id] ?? 0}
                        defaultStep={0}
                        onStepClick={(step) => {
                          savePlanMejoramientoStep(student.id, step);
                          setPmaMap(getPlanMejoramientoState());
                        }}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

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
                className="text-teal-600 hover:text-teal-700 font-medium text-sm"
              >
                Mostrar 15 por página
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowAllStudents(true)}
                  className="text-teal-600 hover:text-teal-700 font-medium text-sm"
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

      {pendientesModalStudent && (() => {
        const { count, activities } = getPendientesForStudent(pendientesModalStudent);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPendientesModalStudent(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <h3 className="text-lg font-bold text-gray-900">Pendientes</h3>
                <button type="button" onClick={() => setPendientesModalStudent(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="text-sm text-gray-600 mb-3 flex-shrink-0">
                <span className="font-medium text-gray-700">{pendientesModalStudent.lastName} {pendientesModalStudent.firstName}</span>
                <span className="text-gray-500"> — {count} pendiente{count !== 1 ? 's' : ''}</span>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden overflow-y-auto max-h-64 flex-1 min-h-0">
                {activities.length === 0 ? (
                  <p className="px-4 py-6 text-center text-gray-500 text-sm">Sin pendientes.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {activities.map(activity => (
                      <li key={activity.id} className="px-4 py-2.5 text-sm text-gray-800">
                        {getActivityShortLabel(activity.name)}
                        {activity.detail ? <span className="text-gray-500 ml-1">— {activity.detail}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-4 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setPendientesModalStudent(null)}
                  className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

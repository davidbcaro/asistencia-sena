import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, FileDown, Filter, Pencil, Trash2, Upload, Search } from 'lucide-react';
import { Ficha, GradeActivity, GradeEntry, Student } from '../types';
import {
  addGradeActivity,
  deleteGradeEntry,
  getFichas,
  getGradeActivities,
  getGrades,
  getJuiciosEvaluativos,
  getRapColumns,
  getStudents,
  saveGradeActivities,
  saveGrades,
  saveJuiciosEvaluativos,
  updateGradeActivity,
  updateStudent,
  upsertGrades,
} from '../services/db';

const PASSING_SCORE = 70;
const TABLE_ROW_HEIGHT_PX = 56;

const normalizeText = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const normalizeHeader = (value: string) =>
  normalizeText(value).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const normalizeDoc = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return Math.trunc(value).toString().replace(/^0+/, '') || '0';
  }
  const strValue = String(value).trim();
  if (!strValue) return '';
  const numeric = Number(strValue);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    return Math.trunc(numeric).toString().replace(/^0+/, '') || '0';
  }
  const digits = strValue.replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits;
};

const buildNameKey = (value: string) =>
  normalizeText(value).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const scoreToLetter = (score: number): 'A' | 'D' => (score >= PASSING_SCORE ? 'A' : 'D');

const EXCLUDED_ACTIVITY_HEADERS = new Set([
  'nombre s', 'nombres', 'apellido s', 'apellidos', 'nombre de usuario', 'usuario', 'username',
  'institucion', 'departamento', 'correo electronico', 'correo', 'email', 'ultima descarga de este curso',
]);

const BASE_COMPUTED_HEADERS = new Set(['pendientes', 'final', 'rap1', 'rap2', 'rap3', 'rap4', 'rap5']);
const normalizeHeaderKey = (value: string) => normalizeHeader(value).replace(/\s+/g, '');

const splitActivityHeader = (header: string): { baseName: string; kind: 'real' | 'letter' | 'score' } => {
  const raw = header.trim();
  if (!raw) return { baseName: raw, kind: 'score' };
  const endsWithLetra = /(\s|[\-\()])?letra\s*\)?\s*$/i.test(raw);
  const endsWithReal = /(\s|[\-\()])?(real|promedio|nota|numero|score)\s*\)?\s*$/i.test(raw);
  if (endsWithLetra && !endsWithReal) {
    const baseName = raw.replace(/\s*[\(\-\s]?letra\s*\)?\s*$/i, '').trim();
    return baseName ? { baseName, kind: 'letter' } : { baseName: raw, kind: 'score' };
  }
  if (endsWithReal) {
    const baseName = raw.replace(/\s*[\(\-\s]?(real|promedio|nota|numero|score)\s*\)?\s*$/i, '').trim();
    return baseName ? { baseName, kind: 'real' } : { baseName: raw, kind: 'score' };
  }
  const parenMatch = raw.match(/^(.+?)\s*\((real|letra)\)\s*$/i);
  if (parenMatch) {
    const kind = parenMatch[2].toLowerCase() === 'letra' ? 'letter' : 'real';
    return { baseName: parenMatch[1].trim(), kind };
  }
  return { baseName: raw, kind: 'score' };
};

const getCanonicalEvidenceKey = (baseName: string): string => {
  const trimmed = baseName.trim();
  const gaFullMatch = trimmed.match(/GA\d+-\d+-AA\d+-EV(\d+)/i);
  if (gaFullMatch) return normalizeText(gaFullMatch[0]);
  const aaEvMatch = trimmed.match(/AA\d+-EV(\d+)/i);
  if (aaEvMatch) return normalizeText(aaEvMatch[0]);
  const evMatch = trimmed.match(/ev(idencia)?\s*(\d+)/i);
  if (evMatch) return 'ev' + String(parseInt(evMatch[2], 10));
  const numMatch = trimmed.match(/(\d+)/);
  if (numMatch) return 'ev' + String(parseInt(numMatch[1], 10));
  return normalizeText(trimmed) || trimmed;
};

const getActivityShortLabel = (name: string) => {
  const match = name.match(/EV\d+/i);
  return match ? match[0].toUpperCase() : name;
};

const parseScoreValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(',', '.').replace(/[^\d.\-]/g, '');
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isNaN(numeric) ? null : numeric;
};

const PHASES = [
  'Fase Inducción',
  'Fase 1: Análisis',
  'Fase 2: Planeación',
  'Fase 3: Ejecución',
  'Fase 4: Evaluación',
];

/** Detect phase from header text for Excel column matching */
const getPhaseFromHeader = (header: string): string | null => {
  const h = (header || '').toLowerCase();
  if (h.includes('induccion') || h.includes('inducción')) return PHASES[0];
  if (h.includes('analisis') || h.includes('análisis')) return PHASES[1];
  if (h.includes('planeacion') || h.includes('planeación')) return PHASES[2];
  if (h.includes('ejecucion') || h.includes('ejecución')) return PHASES[3];
  if (h.includes('evaluacion') || h.includes('evaluación')) return PHASES[4];
  return null;
};

export const SofiaPlusView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [activities, setActivities] = useState<GradeActivity[]>([]);
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [selectedFicha, setSelectedFicha] = useState<string>('Todas');
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadInfo, setUploadInfo] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{ studentId: string; activityId: string } | null>(null);
  const [editingScore, setEditingScore] = useState<string>('');
  const [juiciosEvaluativos, setJuiciosEvaluativos] = useState<Record<string, Record<string, 'orange' | 'green'>>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'lastname' | 'firstname'>('lastname');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showFichaFilter, setShowFichaFilter] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [finalFilter, setFinalFilter] = useState<'all' | 'A' | '-'>('all');
  const [showFinalFilter, setShowFinalFilter] = useState(false);
  const ITEMS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [activityDetailModal, setActivityDetailModal] = useState<GradeActivity | null>(null);
  const [studentDetailModal, setStudentDetailModal] = useState<Student | null>(null);
  const fichaFilterRef = useRef<HTMLDivElement | null>(null);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);
  const finalFilterRef = useRef<HTMLDivElement | null>(null);

  const generateId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2);

  const handleSort = (column: 'lastname' | 'firstname') => {
    if (sortOrder === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortOrder(column);
    setSortDirection('asc');
  };

  const loadData = () => {
    setStudents(getStudents());
    setFichas(getFichas());
    setActivities(getGradeActivities());
    setGrades(getGrades());
    setJuiciosEvaluativos(getJuiciosEvaluativos());
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  const hasSearchTerm = searchTerm.trim() !== '';
  const showAllFichasColumns = selectedFicha === 'Todas' || hasSearchTerm;

  const studentsForFicha = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = students.filter(s => {
      const matchSearch = !term || (() => {
        const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
        const doc = String(s.documentNumber || '').toLowerCase();
        const email = (s.email || '').toLowerCase();
        return fullName.includes(term) || doc.includes(term) || email.includes(term);
      })();
      if (!matchSearch) return false;
      const matchStatus = filterStatus === 'Todos' || (s.status || 'Formación') === filterStatus;
      if (!matchStatus) return false;
      if (term) return true;
      return selectedFicha === 'Todas' || (s.group || 'General') === selectedFicha;
    });
    return [...filtered].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      const cmp = sortOrder === 'lastname'
        ? a.lastName.localeCompare(b.lastName, 'es') || a.firstName.localeCompare(b.firstName, 'es')
        : a.firstName.localeCompare(b.firstName, 'es') || a.lastName.localeCompare(b.lastName, 'es');
      return direction * cmp;
    });
  }, [students, selectedFicha, searchTerm, filterStatus, sortOrder, sortDirection]);

  /** Per-phase activities and optional canonical map for "Todas" */
  const activitiesPerPhase = useMemo(() => {
    return PHASES.map(phase => {
      const phaseMatch = activities.filter(a => (a.phase || PHASES[1]) === phase);
      if (selectedFicha !== 'Todas') {
        const fichaSpecific = phaseMatch.filter(a => a.group === selectedFicha);
        const result = fichaSpecific.length > 0 ? fichaSpecific : phaseMatch.filter(a => a.group === '');
        const visible = result.filter(a => {
          const normalized = normalizeHeader(a.name);
          const headerKey = normalizeHeaderKey(a.name);
          return !EXCLUDED_ACTIVITY_HEADERS.has(normalized) && !BASE_COMPUTED_HEADERS.has(headerKey);
        });
        return { phase, activities: result, visibleActivities: visible, byCanonical: null as Map<string, Map<string, GradeActivity>> | null };
      }
      const byCanonical = new Map<string, Map<string, GradeActivity>>();
      const representative = new Map<string, GradeActivity>();
      phaseMatch.forEach(a => {
        const key = getCanonicalEvidenceKey(a.detail || a.name);
        if (!byCanonical.has(key)) byCanonical.set(key, new Map());
        byCanonical.get(key)!.set(a.group, a);
        if (!representative.has(key)) representative.set(key, a);
      });
      const unified = Array.from(representative.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      );
      const visible = unified.filter(a => {
        const normalized = normalizeHeader(a.name);
        const headerKey = normalizeHeaderKey(a.name);
        return !EXCLUDED_ACTIVITY_HEADERS.has(normalized) && !BASE_COMPUTED_HEADERS.has(headerKey);
      });
      return { phase, activities: unified, visibleActivities: visible, byCanonical };
    });
  }, [activities, selectedFicha]);

  const gradeMap = useMemo(() => {
    const map = new Map<string, GradeEntry>();
    grades.forEach(g => map.set(`${g.studentId}-${g.activityId}`, g));
    return map;
  }, [grades]);

  const allVisibleActivities = useMemo(() =>
    activitiesPerPhase.flatMap(p => p.visibleActivities),
    [activitiesPerPhase]
  );

  const getRapKeyForStudent = (phase: string, studentGroup?: string) =>
    showAllFichasColumns && studentGroup ? `${studentGroup}::${phase}` : `${selectedFicha === 'Todas' ? (studentGroup || '') : selectedFicha}::${phase}`;

  const getJuicioEstado = (studentId: string, phase: string, studentGroup?: string): '-' | 'orange' | 'green' => {
    const key = getRapKeyForStudent(phase, studentGroup);
    if (!key || key.startsWith('::')) return '-';
    const v = (juiciosEvaluativos[key] || {})[studentId];
    return v === 'orange' ? 'orange' : v === 'green' ? 'green' : '-';
  };

  const toggleJuicioEvaluativo = (studentId: string, phase: string, studentGroup?: string) => {
    const key = getRapKeyForStudent(phase, studentGroup);
    if (!key || key.startsWith('::')) return;
    const byKey = juiciosEvaluativos[key] || {};
    const current = byKey[studentId];
    const nextEstado: 'orange' | 'green' | undefined =
      current === undefined ? 'orange' : current === 'orange' ? 'green' : undefined;
    const next = nextEstado === undefined ? (() => { const { [studentId]: _, ...rest } = byKey; return rest; })() : { ...byKey, [studentId]: nextEstado };
    const updated = { ...juiciosEvaluativos, [key]: next };
    setJuiciosEvaluativos(updated);
    saveJuiciosEvaluativos(updated);
  };

  const resolveActivity = (phaseData: typeof activitiesPerPhase[0], activity: GradeActivity, studentGroup?: string): GradeActivity => {
    if (!phaseData.byCanonical) return activity;
    const canonicalKey = getCanonicalEvidenceKey(activity.detail || activity.name);
    const byFicha = phaseData.byCanonical.get(canonicalKey);
    const resolved = byFicha?.get(studentGroup || '') ?? byFicha?.get('') ?? activity;
    return resolved;
  };

  const getFinalForStudent = (studentId: string, studentGroup?: string) => {
    if (allVisibleActivities.length === 0) {
      return { pending: 0, score: null as number | null, letter: null as 'A' | 'D' | null };
    }
    let missing = 0;
    let sum = 0;
    let pending = 0;
    activitiesPerPhase.forEach(phaseData => {
      phaseData.visibleActivities.forEach(activity => {
        const resolved = resolveActivity(phaseData, activity, studentGroup);
        const grade = gradeMap.get(`${studentId}-${resolved.id}`);
        if (!grade) {
          missing += 1;
          pending += 1;
          return;
        }
        sum += grade.score;
        if (grade.letter !== 'A') pending += 1;
      });
    });
    const total = allVisibleActivities.length;
    const avg = missing === total ? null : sum / total;
    const allApproved = total > 0 && missing === 0 && activitiesPerPhase.every(phaseData =>
      phaseData.visibleActivities.every(activity => {
        const resolved = resolveActivity(phaseData, activity, studentGroup);
        return gradeMap.get(`${studentId}-${resolved.id}`)?.letter === 'A';
      })
    );
    const letter: 'A' | 'D' = allApproved ? 'A' : 'D';
    return { pending, score: avg, letter };
  };

  const studentsFilteredByFinal = useMemo(() => {
    if (finalFilter === 'all') return studentsForFicha;
    return studentsForFicha.filter(s => {
      const letter = getFinalForStudent(s.id, s.group).letter;
      return finalFilter === 'A' ? letter === 'A' : letter !== 'A';
    });
  }, [studentsForFicha, finalFilter, gradeMap, allVisibleActivities.length]);

  const totalPagesFiltered = Math.ceil(studentsFilteredByFinal.length / ITEMS_PER_PAGE);
  const paginatedStudentsFiltered = useMemo(() => {
    if (showAllStudents) return studentsFilteredByFinal;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return studentsFilteredByFinal.slice(start, start + ITEMS_PER_PAGE);
  }, [studentsFilteredByFinal, currentPage, showAllStudents]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedStudents(new Set(paginatedStudentsFiltered.map(s => s.id)));
    else setSelectedStudents(new Set());
  };

  const handleSelectStudent = (id: string, checked: boolean) => {
    const updated = new Set(selectedStudents);
    if (checked) updated.add(id);
    else updated.delete(id);
    setSelectedStudents(updated);
  };

  useEffect(() => {
    setSelectedStudents(new Set());
  }, [selectedFicha, searchTerm, filterStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFicha, searchTerm, filterStatus, finalFilter, sortOrder, sortDirection]);

  const rapColumnsForFicha = useMemo(() => {
    const keys = new Set<string>();
    PHASES.forEach(phase => {
      const k = selectedFicha === 'Todas' ? '' : `${selectedFicha}::${phase}`;
      const cols = getRapColumns();
      const list = (k ? cols[k] : null) || cols[selectedFicha] || ['RAP1', 'RAP2', 'RAP3', 'RAP4', 'RAP5'];
      list.forEach((c: string) => keys.add(c));
    });
    if (keys.size === 0) return ['RAP1', 'RAP2', 'RAP3', 'RAP4', 'RAP5'];
    return ['RAP1', 'RAP2', 'RAP3', 'RAP4', 'RAP5'].filter(c => keys.has(c)).length >= 5
      ? ['RAP1', 'RAP2', 'RAP3', 'RAP4', 'RAP5']
      : Array.from(keys).sort();
  }, [selectedFicha, showAllFichasColumns]);

  const hasActivities = allVisibleActivities.length > 0;

  const totalColCount = 7
    + activitiesPerPhase.reduce((acc, p) => acc + p.visibleActivities.length + 1, 0)
    + rapColumnsForFicha.length
    + (hasActivities ? 3 : 0);

  const handleFileUpload = async (file: File) => {
    setUploadError('');
    setUploadInfo('');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
      if (rows.length < 2) {
        setUploadError('El archivo no tiene datos suficientes.');
        return;
      }
      const headers = rows[0].map(h => String(h || '').trim());
      const normalizedHeaders = headers.map(h => normalizeHeader(h));

      const docIndex = normalizedHeaders.findIndex(h =>
        h.includes('document') || h.includes('doc') || h.includes('identificacion') || h.includes('identidad')
      );
      const firstNameIndex = normalizedHeaders.findIndex(h =>
        (h === 'nombres' || h === 'nombre s' || h === 'nombre' || h.startsWith('nombre ')) && !h.includes('usuario')
      );
      const lastNameIndex = normalizedHeaders.findIndex(h => h.includes('apellido'));
      const fullNameIndex = normalizedHeaders.findIndex(h => h.includes('nombre completo') || h.includes('aprendiz'));
      const usernameIndex = normalizedHeaders.findIndex(h =>
        h.includes('nombre de usuario') || h === 'usuario' || h === 'username'
      );
      const emailIndex = normalizedHeaders.findIndex(h =>
        h.includes('correo electronico') || h.includes('correo') || h.includes('email')
      );
      const reservedIndexes = new Set(
        [docIndex, firstNameIndex, lastNameIndex, fullNameIndex, usernameIndex, emailIndex].filter(i => i >= 0)
      );
      const looksLikeEvidence = (h: string) => /ev\s*\d|evidencia\s*\d|ev\d+/i.test(h) || (/\d+/.test(h) && h.length < 80);

      const activityIndexes = headers
        .map((header, index) => ({ header: header.trim(), index }))
        .filter(item => {
          const header = normalizeHeader(item.header);
          const headerKey = normalizeHeaderKey(item.header);
          if (!item.header || reservedIndexes.has(item.index)) return false;
          if (EXCLUDED_ACTIVITY_HEADERS.has(header)) return false;
          if (looksLikeEvidence(header)) return true;
          if (BASE_COMPUTED_HEADERS.has(headerKey)) return false;
          if (rapColumnsForFicha.map(c => normalizeHeaderKey(c)).includes(headerKey)) return false;
          return true;
        });

      if (activityIndexes.length === 0) {
        setUploadError('No se encontraron columnas de actividades en el Excel.');
        return;
      }

      const evidenceMap = new Map<string, { baseName: string; realIndex?: number; letterIndex?: number; fallbackIndex?: number; phaseHint?: string }>();
      activityIndexes.forEach(({ header, index }) => {
        const { baseName, kind } = splitActivityHeader(header);
        if (!baseName?.trim()) return;
        const phaseHint = getPhaseFromHeader(header) || undefined;
        const canonicalKey = getCanonicalEvidenceKey(baseName);
        const compositeKey = phaseHint ? `${canonicalKey}::${phaseHint}` : canonicalKey;
        const entry = evidenceMap.get(compositeKey) || { baseName: baseName.trim(), phaseHint };
        if (kind === 'real') entry.realIndex = index;
        else if (kind === 'letter') entry.letterIndex = index;
        else if (entry.fallbackIndex === undefined) entry.fallbackIndex = index;
        evidenceMap.set(compositeKey, entry);
      });

      const isAllFichas = selectedFicha === 'Todas';
      const existingByKey = new Map<string, GradeActivity>();
      activities.forEach(a => {
        const key = getCanonicalEvidenceKey(a.detail || a.name);
        const phase = a.phase || PHASES[1];
        const composite = `${key}::${phase}`;
        const prefer = !isAllFichas && a.group === selectedFicha;
        const existing = existingByKey.get(composite);
        if (!existing || prefer) existingByKey.set(composite, a);
        if (!existingByKey.has(key)) existingByKey.set(key, a);
        else if (prefer) existingByKey.set(key, a);
      });

      const activityColumns = new Map<string, { activity: GradeActivity; realIndex?: number; letterIndex?: number; fallbackIndex?: number }>();
      let nextEvByPhase = new Map<string, number>();
      PHASES.forEach(phase => {
        const maxEv = activities.filter(a => (a.phase || PHASES[1]) === phase).reduce((max, a) => {
          const m = a.name.match(/EV(\d+)/i);
          return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        nextEvByPhase.set(phase, maxEv + 1);
      });

      evidenceMap.forEach((entry, compositeKey) => {
        const [canonicalKey, phaseHint] = compositeKey.includes('::') ? compositeKey.split('::') : [compositeKey, ''];
        const phase = phaseHint || PHASES[1];
        let activity = existingByKey.get(compositeKey)
          || Array.from(existingByKey.entries()).find(([k]) => k.startsWith(canonicalKey + '::') && k.endsWith(phase))?.[1];
        if (!activity) {
          const nextEv = nextEvByPhase.get(phase) ?? 1;
          nextEvByPhase.set(phase, nextEv + 1);
          activity = {
            id: generateId(),
            name: `EV${String(nextEv).padStart(2, '0')}`,
            group: isAllFichas ? '' : selectedFicha,
            phase,
            maxScore: 100,
            detail: entry.baseName,
            createdAt: new Date().toISOString(),
          };
          addGradeActivity(activity);
          existingByKey.set(compositeKey, activity);
        }
        activityColumns.set(compositeKey, {
          activity,
          realIndex: entry.realIndex,
          letterIndex: entry.letterIndex,
          fallbackIndex: entry.fallbackIndex,
        });
      });

      const studentsByDoc = new Map<string, Student>();
      const studentsByName = new Map<string, Student>();
      const toMatch = isAllFichas ? students : studentsForFicha;
      toMatch.forEach(student => {
        const docKey = normalizeDoc(student.documentNumber || '');
        if (docKey) studentsByDoc.set(docKey, student);
        const fullName = buildNameKey(`${student.firstName} ${student.lastName}`);
        const reversedName = buildNameKey(`${student.lastName} ${student.firstName}`);
        const commaName = buildNameKey(`${student.lastName}, ${student.firstName}`);
        studentsByName.set(fullName, student);
        studentsByName.set(reversedName, student);
        studentsByName.set(commaName, student);
      });

      const entries: GradeEntry[] = [];
      const unmatched: string[] = [];

      rows.slice(1).forEach((row: unknown[]) => {
        const docValue = docIndex >= 0 ? normalizeDoc(row[docIndex]) : '';
        const firstNameValue = firstNameIndex >= 0 ? String(row[firstNameIndex] || '').trim() : '';
        const lastNameValue = lastNameIndex >= 0 ? String(row[lastNameIndex] || '').trim() : '';
        const fullNameValue = fullNameIndex >= 0 ? String(row[fullNameIndex] || '').trim() : '';
        const usernameValue = usernameIndex >= 0 ? String(row[usernameIndex] || '').trim() : '';
        const emailValue = emailIndex >= 0 ? String(row[emailIndex] || '').trim() : '';
        const docFromUsername = !docValue && usernameValue ? normalizeDoc(usernameValue.replace(/\D/g, '') || usernameValue) : '';
        const effectiveDoc = docValue || docFromUsername;

        let student: Student | undefined = effectiveDoc ? studentsByDoc.get(effectiveDoc) : undefined;
        if (!student) {
          const nameToMatch = fullNameValue || `${firstNameValue} ${lastNameValue}`;
          if (nameToMatch.trim()) {
            const normalized = buildNameKey(nameToMatch);
            const reversed = buildNameKey(`${lastNameValue} ${firstNameValue}`);
            student = studentsByName.get(normalized) || studentsByName.get(reversed);
            if (!student) {
              const tokens = normalized.split(' ').filter(Boolean);
              student = toMatch.find(s => {
                const key = buildNameKey(`${s.firstName} ${s.lastName}`);
                return tokens.every(t => key.includes(t)) || key.includes(normalized) || normalized.includes(key);
              });
            }
          }
        }

        if (!student) {
          if (effectiveDoc || fullNameValue || firstNameValue || lastNameValue)
            unmatched.push(effectiveDoc || fullNameValue || `${firstNameValue} ${lastNameValue}`.trim());
          return;
        }

        if (usernameValue || emailValue) {
          const updated: Student = { ...student, username: usernameValue || student.username, email: emailValue || student.email };
          if (updated.username !== student.username || updated.email !== student.email) updateStudent(updated);
        }

        activityColumns.forEach(({ activity: act, realIndex, letterIndex, fallbackIndex }) => {
          const rawScore = realIndex !== undefined ? row[realIndex] : fallbackIndex !== undefined ? row[fallbackIndex] : undefined;
          const rawLetter = letterIndex !== undefined ? row[letterIndex] : undefined;
          let score: number | null = parseScoreValue(rawScore);
          let letter: 'A' | 'D' | null = null;
          if (score === null && typeof rawScore === 'string') {
            const t = rawScore.trim().toUpperCase();
            if (t === 'A' || t === 'D') letter = t as 'A' | 'D';
          }
          if (rawLetter !== '' && rawLetter != null) {
            const t = String(rawLetter).trim().toUpperCase();
            if (t === 'A' || t === 'D') letter = t as 'A' | 'D';
          }
          if (score === null && letter === null) return;
          if (score === null && letter) score = letter === 'A' ? 100 : 0;
          if (score === null) return;
          const finalScore = Math.max(0, Math.min(100, Math.round(score)));
          const finalLetter = letter || scoreToLetter(finalScore);
          entries.push({
            studentId: student!.id,
            activityId: act.id,
            score: finalScore,
            letter: finalLetter,
            updatedAt: new Date().toISOString(),
          });
        });
      });

      upsertGrades(entries);
      setUploadInfo(`Se actualizaron ${entries.length} calificaciones.${unmatched.length > 0 ? ` Sin coincidencia: ${unmatched.length} filas.` : ''}`);
      loadData();
    } catch {
      setUploadError('No se pudo procesar el archivo. Verifica el formato del Excel.');
    }
  };

  const openActivityDetail = (activity: GradeActivity) => setActivityDetailModal(activity);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sofia Plus</h2>
          <p className="text-gray-500">Todas las fases y evidencias en una sola vista. Carga un Excel para llenar calificaciones.</p>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar aprendiz..."
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full bg-white shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="relative" ref={fichaFilterRef}>
            <button
              type="button"
              onClick={() => setShowFichaFilter(prev => !prev)}
              className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-300 shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Filter className="w-4 h-4 text-gray-500" />
              <span>Ficha</span>
              {selectedFicha !== 'Todas' && <span className="text-indigo-600 text-xs">({selectedFicha})</span>}
            </button>
            {showFichaFilter && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFichaFilter(false)} />
                <div className="absolute left-0 mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-xl z-50 p-4">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Ficha</label>
                  <select
                    value={selectedFicha}
                    onChange={e => { setSelectedFicha(e.target.value); setShowFichaFilter(false); }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="Todas">Todas las fichas</option>
                    {fichas.map(f => (
                      <option key={f.id} value={f.code}>{f.code} - {f.program}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          <div className="relative" ref={statusFilterRef}>
            <button
              type="button"
              onClick={() => setShowStatusFilter(prev => !prev)}
              className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-300 shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Filter className="w-4 h-4 text-gray-500" />
              Estado
              {filterStatus !== 'Todos' && <span className="text-indigo-600 text-xs">({filterStatus})</span>}
            </button>
            {showStatusFilter && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowStatusFilter(false)} />
                <div className="absolute left-0 mt-2 w-52 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1">
                  {['Todos', 'Formación', 'Cancelado', 'Retiro Voluntario', 'Deserción'].map(opt => (
                    <button key={opt} type="button" onClick={() => { setFilterStatus(opt); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === opt ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>{opt === 'Todos' ? 'Todos los Estados' : opt}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <label className="cursor-pointer inline-flex items-center justify-center space-x-2 bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-lg transition-colors shadow-sm">
            <Upload className="w-4 h-4" />
            <span>Cargar Excel</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { handleFileUpload(f); e.currentTarget.value = ''; } }} />
          </label>
        </div>
      </div>

      {uploadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{uploadError}</span>
        </div>
      )}
      {uploadInfo && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{uploadInfo}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-left min-w-max border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr style={{ height: TABLE_ROW_HEIGHT_PX, minHeight: TABLE_ROW_HEIGHT_PX }}>
              <th className="px-4 py-4 font-semibold text-gray-600 text-sm w-10 min-w-10 sticky left-0 z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                <input type="checkbox" checked={paginatedStudentsFiltered.length > 0 && paginatedStudentsFiltered.every(s => selectedStudents.has(s.id))} onChange={e => handleSelectAll(e.target.checked)} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
              </th>
              <th className="px-4 py-4 font-semibold text-gray-600 text-xs w-10 min-w-10 sticky left-10 z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle" style={{ height: TABLE_ROW_HEIGHT_PX }}>No</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-32 min-w-32 sticky left-20 z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle overflow-hidden whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>Documento</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-48 min-w-48 sticky left-[208px] z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle overflow-hidden whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                <button type="button" onClick={() => handleSort('firstname')} className={`inline-flex items-center gap-1 hover:text-indigo-700 ${sortOrder === 'firstname' ? 'text-indigo-700' : ''}`}>Nombres {sortOrder === 'firstname' && (sortDirection === 'asc' ? '↑' : '↓')}</button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-48 min-w-48 sticky left-[400px] z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle overflow-hidden whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                <button type="button" onClick={() => handleSort('lastname')} className={`inline-flex items-center gap-1 hover:text-indigo-700 ${sortOrder === 'lastname' ? 'text-indigo-700' : ''}`}>Apellidos {sortOrder === 'lastname' && (sortDirection === 'asc' ? '↑' : '↓')}</button>
              </th>
              <th className="px-4 py-4 font-semibold text-gray-600 text-sm w-40 min-w-40 sticky left-[592px] z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle overflow-hidden whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>Estado</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-28 min-w-28 sticky left-[752px] z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle overflow-hidden whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>Ficha</th>
              {activitiesPerPhase.map(({ phase, visibleActivities }) => (
                <React.Fragment key={phase}>
                  {visibleActivities.map(activity => (
                    <th key={activity.id} className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX, minWidth: 90 }}>
                      <button type="button" onClick={() => openActivityDetail(activity)} className="hover:text-gray-900 underline decoration-dotted">{getActivityShortLabel(activity.name)}</button>
                    </th>
                  ))}
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center bg-indigo-50/50 whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX, minWidth: 100 }} title="Juicios Evaluativos">Juicios Eval.</th>
                </React.Fragment>
              ))}
              {rapColumnsForFicha.map(key => (
                <th key={key} className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>{key}</th>
              ))}
              {hasActivities && (
                <>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>Pend.</th>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>Prom.</th>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                    <div className="relative" ref={finalFilterRef}>
                      <button type="button" onClick={() => setShowFinalFilter(prev => !prev)} className="inline-flex items-center gap-1 hover:text-gray-900">Final {finalFilter !== 'all' && `(${finalFilter === 'A' ? 'A' : '-'})`}</button>
                      {showFinalFilter && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowFinalFilter(false)} />
                          <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1">
                            <button type="button" onClick={() => { setFinalFilter('all'); setShowFinalFilter(false); }} className="w-full text-left px-3 py-2 text-sm">Todos</button>
                            <button type="button" onClick={() => { setFinalFilter('A'); setShowFinalFilter(false); }} className="w-full text-left px-3 py-2 text-sm">Solo A</button>
                            <button type="button" onClick={() => { setFinalFilter('-'); setShowFinalFilter(false); }} className="w-full text-left px-3 py-2 text-sm">Solo -</button>
                          </div>
                        </>
                      )}
                    </div>
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {studentsForFicha.length === 0 ? (
              <tr>
                <td colSpan={totalColCount} className="px-6 py-8 text-center text-gray-500">No hay aprendices que coincidan con los filtros.</td>
              </tr>
            ) : studentsFilteredByFinal.length === 0 ? (
              <tr>
                <td colSpan={totalColCount} className="px-6 py-8 text-center text-gray-500">Ningún aprendiz coincide con el filtro Final.</td>
              </tr>
            ) : (
              paginatedStudentsFiltered.map((student, index) => {
                const final = getFinalForStudent(student.id, student.group);
                return (
                  <tr key={student.id} className="group hover:bg-gray-50" style={{ height: TABLE_ROW_HEIGHT_PX, minHeight: TABLE_ROW_HEIGHT_PX }}>
                    <td className="px-4 py-4 w-10 min-w-10 sticky left-0 z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                      <input type="checkbox" checked={selectedStudents.has(student.id)} onChange={e => handleSelectStudent(student.id, e.target.checked)} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                    </td>
                    <td className="px-4 py-4 w-10 min-w-10 text-gray-500 font-mono text-xs sticky left-10 z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle" style={{ height: TABLE_ROW_HEIGHT_PX }}>{showAllStudents ? index + 1 : (currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                    <td className="px-6 py-4 w-32 min-w-32 text-gray-600 font-mono text-xs sticky left-20 z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle overflow-hidden whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>{student.documentNumber || '-'}</td>
                    <td className="px-6 py-4 w-48 min-w-48 text-xs font-medium text-gray-900 sticky left-[208px] z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle overflow-hidden whitespace-nowrap cursor-pointer hover:text-indigo-600 hover:underline" style={{ height: TABLE_ROW_HEIGHT_PX }} onClick={() => setStudentDetailModal(student)}>{student.firstName}</td>
                    <td className="px-6 py-4 w-48 min-w-48 text-xs font-medium text-gray-900 sticky left-[400px] z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle overflow-hidden whitespace-nowrap cursor-pointer hover:text-indigo-600 hover:underline" style={{ height: TABLE_ROW_HEIGHT_PX }} onClick={() => setStudentDetailModal(student)}>{student.lastName}</td>
                    <td className="px-4 py-4 w-40 min-w-40 text-sm sticky left-[592px] z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                      <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${student.status === 'Formación' ? 'bg-green-100 text-green-800' : student.status === 'Cancelado' ? 'bg-yellow-100 text-yellow-800' : student.status === 'Retiro Voluntario' ? 'bg-orange-100 text-orange-800' : student.status === 'Deserción' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>{student.status || 'Formación'}</span>
                    </td>
                    <td className="px-6 py-4 w-28 min-w-28 text-sm text-gray-700 sticky left-[752px] z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb] align-middle overflow-hidden whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>{student.group || '-'}</td>
                    {activitiesPerPhase.map(({ phase, visibleActivities, byCanonical }) => (
                      <React.Fragment key={phase}>
                        {visibleActivities.map(activity => {
                          const resolved = byCanonical ? resolveActivity({ phase, activities: visibleActivities, visibleActivities, byCanonical }, activity, student.group) : activity;
                          const grade = gradeMap.get(`${student.id}-${resolved.id}`);
                          const isEditing = editingCell?.studentId === student.id && editingCell?.activityId === resolved.id;
                          return (
                            <td key={activity.id} className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle overflow-hidden" style={{ height: TABLE_ROW_HEIGHT_PX, minWidth: 90 }} onClick={() => { setEditingCell({ studentId: student.id, activityId: resolved.id }); setEditingScore(grade ? String(grade.score) : ''); }}>
                              {isEditing ? (
                                <input type="number" min={0} max={100} className="w-16 bg-white border border-gray-300 rounded px-2 py-1 text-sm" value={editingScore} onChange={e => setEditingScore(e.target.value)}
                                  onBlur={() => { const t = editingScore.trim(); if (!t) { deleteGradeEntry(student.id, resolved.id); setEditingCell(null); setEditingScore(''); return; } const n = Number(t); if (!Number.isNaN(n)) { const s = Math.max(0, Math.min(100, Math.round(n))); upsertGrades([{ studentId: student.id, activityId: resolved.id, score: s, letter: scoreToLetter(s), updatedAt: new Date().toISOString() }]); } setEditingCell(null); setEditingScore(''); loadData(); }}
                                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setEditingCell(null); setEditingScore(''); } }} autoFocus />
                              ) : grade ? (
                                <span className="inline-flex items-center gap-1"><span className="font-semibold">{grade.score}</span><span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${grade.letter === 'A' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{grade.letter}</span></span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-4 text-sm border-r border-gray-200 align-middle text-center bg-indigo-50/30 cursor-pointer" style={{ height: TABLE_ROW_HEIGHT_PX, minWidth: 100 }} onClick={() => toggleJuicioEvaluativo(student.id, phase, student.group)} title="Clic: ciclo Juicio">
                          {getJuicioEstado(student.id, phase, student.group) === '-' ? (
                            <span className="text-gray-400">-</span>
                          ) : (
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${getJuicioEstado(student.id, phase, student.group) === 'orange' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>
                          )}
                        </td>
                      </React.Fragment>
                    ))}
                    {rapColumnsForFicha.map(key => (
                      <td key={`${student.id}-${key}`} className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle" style={{ height: TABLE_ROW_HEIGHT_PX }}>{final.letter === 'A' ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">A</span> : <span className="text-gray-400">-</span>}</td>
                    ))}
                    {hasActivities && (
                      <>
                        <td className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX }}><span className="font-semibold">{final.pending}</span></td>
                        <td className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX }}>{final.score === null ? '-' : Number(final.score).toFixed(2)}</td>
                        <td className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX }}>{final.letter === 'A' ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">A</span> : <span className="text-gray-400">-</span>}</td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm flex-wrap gap-2">
        <span className="text-gray-500">
          {showAllStudents ? `Mostrando todos (${studentsFilteredByFinal.length})` : `Mostrando ${(currentPage - 1) * ITEMS_PER_PAGE + 1} a ${Math.min(currentPage * ITEMS_PER_PAGE, studentsFilteredByFinal.length)} de ${studentsFilteredByFinal.length}`}
        </span>
        <div className="flex items-center gap-2">
          {!showAllStudents && totalPagesFiltered > 1 && (
            <>
              <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-gray-600">Pág. {currentPage} de {totalPagesFiltered}</span>
              <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPagesFiltered, p + 1))} disabled={currentPage >= totalPagesFiltered} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"><ChevronRight className="w-4 h-4" /></button>
            </>
          )}
          <button type="button" onClick={() => setShowAllStudents(prev => !prev)} className="text-indigo-600 hover:text-indigo-700 font-medium text-sm">{showAllStudents ? 'Mostrar 15 por página' : 'Mostrar todos'}</button>
        </div>
      </div>

      {activityDetailModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setActivityDetailModal(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl border border-gray-200 p-6 z-50 max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{activityDetailModal.name}</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{activityDetailModal.detail || 'Sin descripción'}</p>
            <button type="button" onClick={() => setActivityDetailModal(null)} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm">Cerrar</button>
          </div>
        </>
      )}

      {studentDetailModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setStudentDetailModal(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl border border-gray-200 p-6 z-50 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{studentDetailModal.firstName} {studentDetailModal.lastName}</h3>
            <p className="text-sm text-gray-500">Documento: {studentDetailModal.documentNumber || '-'}</p>
            <p className="text-sm text-gray-500">Ficha: {studentDetailModal.group || '-'}</p>
            <p className="text-sm text-gray-500">Estado: {studentDetailModal.status || 'Formación'}</p>
            <button type="button" onClick={() => setStudentDetailModal(null)} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm">Cerrar</button>
          </div>
        </>
      )}
    </div>
  );
};

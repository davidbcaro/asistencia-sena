import React, { useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Filter, Pencil, Plus, Trash2, Upload, X, Search } from 'lucide-react';
import { Ficha, GradeActivity, GradeEntry, Student } from '../types';
import {
  addGradeActivity,
  deleteGradeActivity,
  deleteGradeEntry,
  getFichas,
  getGradeActivities,
  getGrades,
  getJuiciosEvaluativos,
  getRapColumns,
  getRapNotes,
  getStudentGradeObservations,
  getStudents,
  saveGradeActivities,
  saveGrades,
  saveJuiciosEvaluativos,
  saveRapColumns,
  saveRapNotes,
  saveStudentGradeObservations,
  updateGradeActivity,
  updateStudent,
  upsertGrades,
} from '../services/db';

const PASSING_SCORE = 70;
/** Altura fija de cada fila de la tabla (px) para que coincidan las dos mitades (datos + calificaciones). */
const TABLE_ROW_HEIGHT_PX = 56;

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const normalizeHeader = (value: string) =>
  normalizeText(value).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const normalizeDoc = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const numeric = Math.trunc(value).toString();
    return numeric.replace(/^0+/, '') || '0';
  }
  const strValue = String(value).trim();
  if (!strValue) return '';
  const numeric = Number(strValue);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    const num = Math.trunc(numeric).toString();
    return num.replace(/^0+/, '') || '0';
  }
  const digits = strValue.replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits;
};

const buildNameKey = (value: string) =>
  normalizeText(value).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const scoreToLetter = (score: number): 'A' | 'D' => (score >= PASSING_SCORE ? 'A' : 'D');

const EXCLUDED_ACTIVITY_HEADERS = new Set([
  'nombre s',
  'nombres',
  'nombre de usuario',
  'usuario',
  'username',
  'institucion',
  'departamento',
  'correo electronico',
  'correo',
  'email',
  'ultima descarga de este curso',
]);

const BASE_COMPUTED_HEADERS = new Set(['pendientes', 'final', 'rap1', 'rap2', 'rap3', 'rap4', 'rap5']);

const normalizeHeaderKey = (value: string) => normalizeHeader(value).replace(/\s+/g, '');

/** Detecta si la columna es de nota/promedio (real) o de letra (A/D). Cada evidencia viene en dos columnas = una sola evidencia. */
const splitActivityHeader = (header: string): { baseName: string; kind: 'real' | 'letter' | 'score' } => {
  const raw = header.trim();
  if (!raw) return { baseName: raw, kind: 'score' };

  const lower = raw.toLowerCase();
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
    const baseName = parenMatch[1].trim();
    const kind = parenMatch[2].toLowerCase() === 'letra' ? 'letter' : 'real';
    return { baseName, kind };
  }

  return { baseName: raw, kind: 'score' };
};

/** Clave canónica por número de evidencia para que "EV01", "Evidencia 01", "EV01 (real)" y "EV01 (letra)" cuenten como una sola evidencia. */
const getCanonicalEvidenceKey = (baseName: string): string => {
  const trimmed = baseName.trim();
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
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(',', '.').replace(/[^\d.\-]/g, '');
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isNaN(numeric) ? null : numeric;
};

export const CalificacionesView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [activities, setActivities] = useState<GradeActivity[]>([]);
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [selectedFicha, setSelectedFicha] = useState<string>('Todas');
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityName, setActivityName] = useState('');
  const [editingActivity, setEditingActivity] = useState<GradeActivity | null>(null);
  const [activityToDelete, setActivityToDelete] = useState<GradeActivity | null>(null);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadInfo, setUploadInfo] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{ studentId: string; activityId: string } | null>(null);
  const [editingScore, setEditingScore] = useState<string>('');
  const [rapNotes, setRapNotes] = useState<Record<string, Record<string, string>>>({});
  const [rapModal, setRapModal] = useState<{ key: string; text: string } | null>(null);
  const [rapColumns, setRapColumns] = useState<Record<string, string[]>>({});
  const [juiciosEvaluativos, setJuiciosEvaluativos] = useState<Record<string, Record<string, 'orange' | 'green'>>>({});
  const [rapManagerOpen, setRapManagerOpen] = useState(false);
  const [rapNewName, setRapNewName] = useState('');
  const [rapNewDetail, setRapNewDetail] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'lastname' | 'firstname'>('lastname');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showFichaFilter, setShowFichaFilter] = useState(false);
  const [showPhaseFilter, setShowPhaseFilter] = useState(false);
  const fichaFilterRef = useRef<HTMLDivElement | null>(null);
  const phaseFilterRef = useRef<HTMLDivElement | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [finalFilter, setFinalFilter] = useState<'all' | 'A' | '-'>('all');
  const [showFinalFilter, setShowFinalFilter] = useState(false);
  const finalFilterRef = useRef<HTMLDivElement | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);
  const ITEMS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [activityDetailModal, setActivityDetailModal] = useState<GradeActivity | null>(null);
  const [activityDetailText, setActivityDetailText] = useState('');
  const [studentDetailModal, setStudentDetailModal] = useState<Student | null>(null);
  const [studentDetailObservation, setStudentDetailObservation] = useState('');
  const activityNameRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedFichaRef = useRef<string>('');
  const phases = [
    'Fase Inducción',
    'Fase 1: Análisis',
    'Fase 2: Planeación',
    'Fase 3: Ejecución',
    'Fase 4: Evaluación',
  ];
  const [selectedPhase, setSelectedPhase] = useState(phases[1]);

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  const handleSort = (column: 'lastname' | 'firstname') => {
    if (sortOrder === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortOrder(column);
    setSortDirection('asc');
  };

  useEffect(() => {
    selectedFichaRef.current = selectedFicha;
  }, [selectedFicha]);

  const loadData = () => {
    const loadedStudents = getStudents();
    const loadedFichas = getFichas();
    const loadedActivities = getGradeActivities();
    const loadedGrades = getGrades();
    const loadedRapNotes = getRapNotes();
    const loadedRapColumns = getRapColumns();
    const loadedJuicios = getJuiciosEvaluativos();
    setStudents(loadedStudents);
    setFichas(loadedFichas);
    setActivities(loadedActivities);
    setGrades(loadedGrades);
    setRapNotes(loadedRapNotes);
    setRapColumns(loadedRapColumns);
    setJuiciosEvaluativos(loadedJuicios);
    if (loadedFichas.length > 0 && selectedFichaRef.current === '') {
      setSelectedFicha('Todas');
    }
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  useEffect(() => {
    const existing = getGradeActivities();
    const toDelete = existing.filter(activity => {
      const normalized = normalizeHeader(activity.name);
      return EXCLUDED_ACTIVITY_HEADERS.has(normalized);
    });
    if (toDelete.length > 0) {
      toDelete.forEach(activity => deleteGradeActivity(activity.id));
    }
  }, []);

  useEffect(() => {
    const existingActivities = getGradeActivities();
    if (existingActivities.length === 0) return;

    const existingGrades = getGrades();
    const groups = new Map<string, GradeActivity[]>();
    existingActivities.forEach(activity => {
      const baseName = splitActivityHeader(activity.name).baseName;
      const key = `${activity.group}::${normalizeText(baseName)}`;
      const list = groups.get(key) || [];
      list.push(activity);
      groups.set(key, list);
    });

    let activitiesChanged = false;
    let gradesChanged = false;
    const activitiesToKeep: GradeActivity[] = [];
    const activityIdMap = new Map<string, string>();

    groups.forEach(list => {
      if (list.length === 1) {
        activitiesToKeep.push(list[0]);
        return;
      }
      const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const primary = sorted[0];
      activitiesToKeep.push(primary);
      sorted.slice(1).forEach(dup => {
        activityIdMap.set(dup.id, primary.id);
      });
      activitiesChanged = true;
    });

    if (activitiesChanged) {
      const mergedGrades = new Map<string, GradeEntry>();
      existingGrades.forEach(grade => {
        const mappedActivityId = activityIdMap.get(grade.activityId) || grade.activityId;
        const key = `${grade.studentId}-${mappedActivityId}`;
        const current = mergedGrades.get(key);
        if (!current) {
          mergedGrades.set(key, { ...grade, activityId: mappedActivityId });
          return;
        }
        const currentDate = new Date(current.updatedAt).getTime();
        const nextDate = new Date(grade.updatedAt).getTime();
        if (nextDate >= currentDate) {
          mergedGrades.set(key, { ...grade, activityId: mappedActivityId });
        }
      });
      const mergedList = Array.from(mergedGrades.values());
      saveGradeActivities(activitiesToKeep);
      saveGrades(mergedList);
      gradesChanged = true;
    }

    if (activitiesChanged || gradesChanged) {
      loadData();
    }
  }, []);

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
      // Si hay búsqueda, mostrar aprendices de todas las fichas; si no, filtrar por ficha seleccionada
      if (term) return true;
      return selectedFicha === 'Todas' || (s.group || 'General') === selectedFicha;
    });
    return [...filtered].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      let cmp = 0;
      if (sortOrder === 'lastname') {
        cmp = a.lastName.localeCompare(b.lastName, 'es');
        if (cmp === 0) cmp = a.firstName.localeCompare(b.firstName, 'es');
      } else {
        cmp = a.firstName.localeCompare(b.firstName, 'es');
        if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName, 'es');
      }
      return direction * cmp;
    });
  }, [students, selectedFicha, searchTerm, filterStatus, sortOrder, sortDirection]);


  useEffect(() => {
    setSelectedStudents(new Set());
  }, [selectedFicha, selectedPhase, searchTerm, filterStatus]);

  useEffect(() => {
    if (!showFichaFilter) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (fichaFilterRef.current && !fichaFilterRef.current.contains(event.target as Node)) {
        setShowFichaFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFichaFilter]);

  useEffect(() => {
    if (!showPhaseFilter) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (phaseFilterRef.current && !phaseFilterRef.current.contains(event.target as Node)) {
        setShowPhaseFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPhaseFilter]);

  useEffect(() => {
    if (studentDetailModal) {
      setStudentDetailObservation(getStudentGradeObservations()[studentDetailModal.id] ?? '');
    }
  }, [studentDetailModal]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFicha, selectedPhase, searchTerm, finalFilter, filterStatus, sortOrder, sortDirection]);

  useEffect(() => {
    if (!showFinalFilter) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (finalFilterRef.current && !finalFilterRef.current.contains(event.target as Node)) {
        setShowFinalFilter(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFinalFilter]);

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

  const activitiesForFicha = useMemo(() => {
    return activities.filter(a => (a.phase || phases[1]) === selectedPhase && (selectedFicha === 'Todas' || a.group === selectedFicha));
  }, [activities, selectedFicha, selectedPhase]);

  const visibleActivities = useMemo(
    () =>
      activitiesForFicha.filter(activity => {
        const normalized = normalizeHeader(activity.name);
        const headerKey = normalizeHeaderKey(activity.name);
        return !EXCLUDED_ACTIVITY_HEADERS.has(normalized) && !BASE_COMPUTED_HEADERS.has(headerKey);
      }),
    [activitiesForFicha]
  );

  const rapKey = selectedFicha === 'Todas' ? '' : `${selectedFicha}::${selectedPhase}`;

  const getRapKeyForStudent = (studentGroup: string | undefined) =>
    selectedFicha === 'Todas' && studentGroup ? `${studentGroup}::${selectedPhase}` : rapKey || `${studentGroup || ''}::${selectedPhase}`;

  const rapColumnsForFicha = useMemo(() => {
    if (activitiesForFicha.length === 0) return [];
    if (selectedFicha === 'Todas') {
      const allKeys = new Set<string>();
      fichas.forEach(f => {
        const key = `${f.code}::${selectedPhase}`;
        const cols = rapColumns[key] || rapColumns[f.code] || ['RAP1', 'RAP2', 'RAP3', 'RAP4', 'RAP5'];
        cols.forEach((c: string) => allKeys.add(c));
      });
      if (allKeys.size === 0) return ['RAP1', 'RAP2', 'RAP3', 'RAP4', 'RAP5'];
      return ['RAP1', 'RAP2', 'RAP3', 'RAP4', 'RAP5'].filter(c => allKeys.has(c)).length >= 5
        ? ['RAP1', 'RAP2', 'RAP3', 'RAP4', 'RAP5']
        : Array.from(allKeys).sort();
    }
    const existing = rapColumns[rapKey] || rapColumns[selectedFicha];
    if (existing && existing.length > 0) return existing;
    return ['RAP1', 'RAP2', 'RAP3', 'RAP4', 'RAP5'];
  }, [rapColumns, rapKey, selectedFicha, activitiesForFicha.length, fichas, selectedPhase]);

  const gradeMap = useMemo(() => {
    const map = new Map<string, GradeEntry>();
    grades.forEach(grade => {
      map.set(`${grade.studentId}-${grade.activityId}`, grade);
    });
    return map;
  }, [grades]);

  const getFinalForStudent = (studentId: string, studentGroup?: string) => {
    const activitiesForStudent = selectedFicha === 'Todas' && studentGroup
      ? visibleActivities.filter(a => a.group === studentGroup)
      : visibleActivities;
    const totalActivities = activitiesForStudent.length;
    if (totalActivities === 0) {
      return { pending: 0, score: null as number | null, letter: null as 'A' | 'D' | null };
    }
    let missing = 0;
    let sum = 0;
    let pending = 0;
    activitiesForStudent.forEach(activity => {
      const grade = gradeMap.get(`${studentId}-${activity.id}`);
      if (!grade) {
        missing += 1;
        pending += 1;
        sum += 0;
        return;
      }
      sum += grade.score;
      if (grade.letter !== 'A') pending += 1;
    });

    const avg = missing === totalActivities ? null : sum / totalActivities;
    const delivered = totalActivities - missing;
    const allApproved = delivered === totalActivities && activitiesForStudent.every(
      activity => gradeMap.get(`${studentId}-${activity.id}`)?.letter === 'A'
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
  }, [studentsForFicha, finalFilter, gradeMap, visibleActivities, selectedFicha]);

  const totalPagesFiltered = Math.ceil(studentsFilteredByFinal.length / ITEMS_PER_PAGE);
  const paginatedStudentsFiltered = useMemo(() => {
    if (showAllStudents) return studentsFilteredByFinal;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return studentsFilteredByFinal.slice(start, start + ITEMS_PER_PAGE);
  }, [studentsFilteredByFinal, currentPage, showAllStudents]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudents(new Set(paginatedStudentsFiltered.map(s => s.id)));
    } else {
      setSelectedStudents(new Set());
    }
  };

  const handleSelectStudent = (id: string, checked: boolean) => {
    const updated = new Set(selectedStudents);
    if (checked) {
      updated.add(id);
    } else {
      updated.delete(id);
    }
    setSelectedStudents(updated);
  };

  const toggleJuicioEvaluativo = (studentId: string, studentGroup?: string) => {
    const key = getRapKeyForStudent(studentGroup);
    if (!key) return;
    const byKey = juiciosEvaluativos[key] || {};
    const current = byKey[studentId];
    const nextEstado: 'orange' | 'green' | undefined =
      current === undefined ? 'orange' : current === 'orange' ? 'green' : undefined;
    const next = nextEstado === undefined ? (() => { const { [studentId]: _, ...rest } = byKey; return rest; })() : { ...byKey, [studentId]: nextEstado };
    const updated = { ...juiciosEvaluativos, [key]: next };
    setJuiciosEvaluativos(updated);
    saveJuiciosEvaluativos(updated);
  };

  const getJuicioEstado = (studentId: string, studentGroup?: string): '-' | 'orange' | 'green' => {
    const key = getRapKeyForStudent(studentGroup);
    if (!key) return '-';
    const v = (juiciosEvaluativos[key] || {})[studentId];
    return v === 'orange' ? 'orange' : v === 'green' ? 'green' : '-';
  };

  const buildReportData = () => {
    if (!selectedFicha) return null;
    const headers = [
      'Documento',
      'Apellidos',
      'Nombres',
      'Estado',
      'Ficha',
      'Juicios Evaluativos',
      ...visibleActivities.map(a => a.name),
      ...rapColumnsForFicha,
      ...(hasActivities ? ['Pendientes', 'Promedio', 'FINAL'] : []),
    ];

    const studentsToExport = selectedStudents.size > 0
      ? studentsForFicha.filter(student => selectedStudents.has(student.id))
      : studentsForFicha;

    const rows = studentsToExport.map((student) => {
      const activityScores = visibleActivities.map(activity => {
        const grade = gradeMap.get(`${student.id}-${activity.id}`);
        return grade ? grade.score : '';
      });
      const final = getFinalForStudent(student.id, student.group);
      const rapLetter = final.letter === 'A' ? 'A' : '';
      const rapValues = rapColumnsForFicha.map(() => rapLetter);
      const finalValues = hasActivities
        ? [final.pending, final.score != null ? Number(final.score).toFixed(2) : '', final.letter === 'A' ? 'A' : '-']
        : [];
      const juicioKey = getRapKeyForStudent(student.group);
      const juicioVal = (juiciosEvaluativos[juicioKey] || {})[student.id];
      const juicioLabel = juicioVal === 'green' ? 'Sí' : juicioVal === 'orange' ? 'En proceso' : '-';
      return [
        student.documentNumber || '',
        student.lastName || '',
        student.firstName || '',
        student.status || 'Formación',
        student.group || '',
        juicioLabel,
        ...activityScores,
        ...rapValues,
        ...finalValues,
      ];
    });

    return { headers, rows };
  };

  const exportToExcel = async () => {
    const data = buildReportData();
    if (!data) return;

    const { headers, rows } = data;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Calificaciones');
    sheet.addRow(headers);
    rows.forEach(row => sheet.addRow(row));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    sheet.eachRow((row, rowNumber) => {
      row.alignment = { vertical: 'middle', horizontal: rowNumber === 1 ? 'center' : 'left', wrapText: true };
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
      });
    });

    sheet.columns = headers.map(() => ({ width: 20 }));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `reporte_calificaciones_${selectedFicha}_${selectedPhase.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPdf = () => {
    const data = buildReportData();
    if (!data) return;

    const { headers, rows } = data;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(12);
    doc.text(`Calificaciones - ${selectedFicha} - ${selectedPhase}`, 40, 30);
    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 45,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
    });
    doc.save(
      `reporte_calificaciones_${selectedFicha}_${selectedPhase.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
    );
  };

  const openAddActivity = () => {
    setEditingActivity(null);
    setActivityName('');
    setIsActivityModalOpen(true);
  };

  const openEditActivity = (activity: GradeActivity) => {
    setEditingActivity(activity);
    setActivityName(activity.name);
    setIsActivityModalOpen(true);
    setTimeout(() => {
      if (activityNameRef.current) {
        activityNameRef.current.style.height = 'auto';
        activityNameRef.current.style.height = `${activityNameRef.current.scrollHeight}px`;
      }
    }, 0);
  };

  const openActivityDetail = (activity: GradeActivity) => {
    setActivityDetailModal(activity);
    setActivityDetailText(activity.detail || '');
  };

  const handleSaveActivity = () => {
    if (!activityName.trim() || !selectedFicha) return;
    if (editingActivity) {
      updateGradeActivity({ ...editingActivity, name: activityName.trim() });
    } else {
      addGradeActivity({
        id: generateId(),
        name: activityName.trim(),
        group: selectedFicha,
        phase: selectedPhase,
        detail: editingActivity?.detail || undefined,
        maxScore: 100,
        createdAt: new Date().toISOString(),
      });
    }
    setIsActivityModalOpen(false);
    setActivityName('');
    setEditingActivity(null);
  };

  const handleFileUpload = async (file: File) => {
    setUploadError('');
    setUploadInfo('');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
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
        (h === 'nombres' || h === 'nombre' || h.startsWith('nombre ')) && !h.includes('usuario')
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
          const dynamicRap = (rapColumns[rapKey] || rapColumns[selectedFicha] || []).map(col =>
            normalizeHeaderKey(col)
          );
          if (dynamicRap.includes(headerKey)) return false;
          return true;
        });

      if (activityIndexes.length === 0) {
        setUploadError('No se encontraron columnas de actividades en el Excel.');
        return;
      }

      const evidenceMap = new Map<
        string,
        { baseName: string; realIndex?: number; letterIndex?: number; fallbackIndex?: number }
      >();

      activityIndexes.forEach(({ header, index }) => {
        const { baseName, kind } = splitActivityHeader(header);
        if (!baseName || !baseName.trim()) return;
        const canonicalKey = getCanonicalEvidenceKey(baseName);
        const entry = evidenceMap.get(canonicalKey);
        if (entry) {
          if (kind === 'real') {
            entry.realIndex = index;
          } else if (kind === 'letter') {
            entry.letterIndex = index;
          } else if (entry.fallbackIndex === undefined) {
            entry.fallbackIndex = index;
          }
        } else {
          const newEntry: { baseName: string; realIndex?: number; letterIndex?: number; fallbackIndex?: number } = { baseName: baseName.trim() };
          if (kind === 'real') newEntry.realIndex = index;
          else if (kind === 'letter') newEntry.letterIndex = index;
          else newEntry.fallbackIndex = index;
          evidenceMap.set(canonicalKey, newEntry);
        }
      });

      const isAllFichas = selectedFicha === 'Todas';
      const activitiesInPhase = activities.filter(a => (a.phase || phases[1]) === selectedPhase);

      const existingByDetailByGroup = new Map<string, Map<string, GradeActivity>>();
      const nextEvNumberByGroup = new Map<string, number>();
      activitiesInPhase.forEach(activity => {
        const group = activity.group || '';
        const canonKey = getCanonicalEvidenceKey(activity.detail || activity.name);
        if (!existingByDetailByGroup.has(group)) {
          existingByDetailByGroup.set(group, new Map());
        }
        existingByDetailByGroup.get(group)!.set(canonKey, activity);
        const match = activity.name.match(/EV(\d+)/i);
        const num = match ? parseInt(match[1], 10) : 0;
        const current = nextEvNumberByGroup.get(group) ?? 0;
        nextEvNumberByGroup.set(group, Math.max(current, num));
      });

      const newActivities: GradeActivity[] = [];
      const activityColumnsCache = new Map<
        string,
        Map<string, { activity: GradeActivity; realIndex?: number; letterIndex?: number; fallbackIndex?: number; detail: string }>
      >();

      const getActivityColumnsForGroup = (group: string) => {
        let cols = activityColumnsCache.get(group);
        if (cols) return cols;
        cols = new Map();
        let nextEv = (nextEvNumberByGroup.get(group) ?? 0) + 1;
        evidenceMap.forEach((entry, canonicalKey) => {
          const byGroup = existingByDetailByGroup.get(group);
          let activity = byGroup?.get(canonicalKey);
          if (!activity) {
            activity = {
              id: generateId(),
              name: `EV${String(nextEv).padStart(2, '0')}`,
              group,
              phase: selectedPhase,
              maxScore: 100,
              detail: entry.baseName,
              createdAt: new Date().toISOString(),
            };
            nextEv += 1;
            newActivities.push(activity);
            if (!existingByDetailByGroup.has(group)) {
              existingByDetailByGroup.set(group, new Map());
            }
            existingByDetailByGroup.get(group)!.set(canonicalKey, activity);
          } else if (!activity.detail) {
            updateGradeActivity({ ...activity, detail: entry.baseName });
          }
          cols.set(canonicalKey, {
            activity,
            realIndex: entry.realIndex,
            letterIndex: entry.letterIndex,
            fallbackIndex: entry.fallbackIndex,
            detail: entry.baseName,
          });
        });
        nextEvNumberByGroup.set(group, nextEv - 1);
        activityColumnsCache.set(group, cols);
        return cols;
      };

      const activityColumns = new Map<
        string,
        { activity: GradeActivity; realIndex?: number; letterIndex?: number; fallbackIndex?: number; detail: string }
      >();

      if (!isAllFichas) {
        const existingByDetail = new Map<string, GradeActivity>(
          activitiesForFicha.map(activity => {
            const nameOrDetail = activity.detail || activity.name;
            const key = getCanonicalEvidenceKey(nameOrDetail);
            return [key, activity];
          })
        );
        const existingEvNumbers = activitiesForFicha
          .map(activity => {
            const match = activity.name.match(/EV(\d+)/i);
            return match ? Number(match[1]) : null;
          })
          .filter((value): value is number => value !== null);
        let nextEvNumber = existingEvNumbers.length > 0 ? Math.max(...existingEvNumbers) + 1 : 1;

        evidenceMap.forEach((entry, canonicalKey) => {
          const existing = existingByDetail.get(canonicalKey);
          let activity = existing;
          if (!activity) {
            activity = {
              id: generateId(),
              name: `EV${String(nextEvNumber).padStart(2, '0')}`,
              group: selectedFicha,
              phase: selectedPhase,
              maxScore: 100,
              detail: entry.baseName,
              createdAt: new Date().toISOString(),
            };
            nextEvNumber += 1;
            newActivities.push(activity);
          } else if (!activity.detail) {
            updateGradeActivity({ ...activity, detail: entry.baseName });
          }
          activityColumns.set(canonicalKey, {
            activity,
            realIndex: entry.realIndex,
            letterIndex: entry.letterIndex,
            fallbackIndex: entry.fallbackIndex,
            detail: entry.baseName,
          });
        });
      }

      newActivities.forEach(addGradeActivity);

      const studentsByDoc = new Map<string, Student>();
      const studentsByName = new Map<string, Student>();
      const studentsToMatch = isAllFichas ? students : studentsForFicha;
      studentsToMatch.forEach(student => {
        const docKey = normalizeDoc(student.documentNumber || '');
        if (docKey) {
          studentsByDoc.set(docKey, student);
        }
        const fullName = buildNameKey(`${student.firstName} ${student.lastName}`);
        const reversedName = buildNameKey(`${student.lastName} ${student.firstName}`);
        const commaName = buildNameKey(`${student.lastName}, ${student.firstName}`);
        studentsByName.set(fullName, student);
        studentsByName.set(reversedName, student);
        studentsByName.set(commaName, student);
      });

      const entries: GradeEntry[] = [];
      const unmatched: string[] = [];

      rows.slice(1).forEach(row => {
        const docValue = docIndex >= 0 ? normalizeDoc(row[docIndex]) : '';
        const firstNameValue = firstNameIndex >= 0 ? String(row[firstNameIndex] || '').trim() : '';
        const lastNameValue = lastNameIndex >= 0 ? String(row[lastNameIndex] || '').trim() : '';
        const fullNameValue = fullNameIndex >= 0 ? String(row[fullNameIndex] || '').trim() : '';
        const usernameValue = usernameIndex >= 0 ? String(row[usernameIndex] || '').trim() : '';
        const emailValue = emailIndex >= 0 ? String(row[emailIndex] || '').trim() : '';

        let student: Student | undefined;
        if (docValue) {
          student = studentsByDoc.get(docValue);
        }
        if (!student) {
          const nameToMatch = fullNameValue || `${firstNameValue} ${lastNameValue}`;
          if (nameToMatch.trim()) {
            const normalized = buildNameKey(nameToMatch);
            const reversed = buildNameKey(`${lastNameValue} ${firstNameValue}`);
            student = studentsByName.get(normalized) || studentsByName.get(reversed);

            if (!student) {
              const normalizedTokens = normalized.split(' ').filter(Boolean);
              student = studentsToMatch.find(s => {
                const key = buildNameKey(`${s.firstName} ${s.lastName}`);
                return normalizedTokens.every(token => key.includes(token)) ||
                  key.includes(normalized) || normalized.includes(key);
              });
            }
          }
        }

        if (!student) {
          if (docValue || fullNameValue || firstNameValue || lastNameValue) {
            unmatched.push(docValue || fullNameValue || `${firstNameValue} ${lastNameValue}`.trim());
          }
          return;
        }

        if (usernameValue || emailValue) {
          const updatedStudent: Student = {
            ...student,
            username: usernameValue || student.username,
            email: emailValue || student.email,
          };
          if (updatedStudent.username !== student.username || updatedStudent.email !== student.email) {
            updateStudent(updatedStudent);
          }
        }

        const columnsToUse = isAllFichas ? getActivityColumnsForGroup(student.group || '') : activityColumns;
        columnsToUse.forEach(({ activity, realIndex, letterIndex, fallbackIndex }) => {
          const rawScoreValue =
            realIndex !== undefined ? row[realIndex] : fallbackIndex !== undefined ? row[fallbackIndex] : undefined;
          const rawLetterValue = letterIndex !== undefined ? row[letterIndex] : undefined;

          let score: number | null = null;
          let letter: 'A' | 'D' | null = null;

          score = parseScoreValue(rawScoreValue);
          if (score === null && typeof rawScoreValue === 'string') {
            const trimmed = rawScoreValue.trim().toUpperCase();
            if (trimmed === 'A' || trimmed === 'D') {
              letter = trimmed as 'A' | 'D';
            }
          }

          if (rawLetterValue !== '' && rawLetterValue !== null && rawLetterValue !== undefined) {
            const trimmed = String(rawLetterValue).trim().toUpperCase();
            if (trimmed === 'A' || trimmed === 'D') {
              letter = trimmed as 'A' | 'D';
            }
          }

          if (score === null && letter === null) return;

          if (score === null && letter) {
            score = letter === 'A' ? 100 : 0;
          }

          if (score === null) return;

          const finalScore = Math.max(0, Math.min(100, Math.round(score)));
          const finalLetter = letter || scoreToLetter(finalScore);
          entries.push({
            studentId: student.id,
            activityId: activity.id,
            score: finalScore,
            letter: finalLetter,
            updatedAt: new Date().toISOString(),
          });
        });
      });

      upsertGrades(entries);
      const infoParts = [];
      infoParts.push(`Se cargaron ${entries.length} calificaciones.`);
      if (newActivities.length > 0) {
        infoParts.push(`Se crearon ${newActivities.length} actividades nuevas.`);
      }
      if (unmatched.length > 0) {
        infoParts.push(`Sin coincidencia: ${unmatched.length} filas.`);
      }
      setUploadInfo(infoParts.join(' '));
    } catch (error) {
      setUploadError('No se pudo procesar el archivo. Verifica el formato del Excel.');
    }
  };

  const hasActivities = visibleActivities.length > 0;

  return (
    <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Calificaciones</h2>
          <p className="text-gray-500">Gestiona actividades y notas por ficha.</p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex flex-col sm:flex-row items-stretch gap-3 flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar aprendiz..."
                  className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full bg-white shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="relative flex items-center gap-2">
                <div className="relative" ref={fichaFilterRef}>
                  <button
                    type="button"
                    onClick={() => { setShowFichaFilter(prev => !prev); setShowPhaseFilter(false); }}
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
                          onChange={(e) => {
                            setSelectedFicha(e.target.value);
                            setShowFichaFilter(false);
                          }}
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
                <div className="relative" ref={phaseFilterRef}>
                  <button
                    type="button"
                    onClick={() => { setShowPhaseFilter(prev => !prev); setShowFichaFilter(false); }}
                    className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-300 shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Filter className="w-4 h-4 text-gray-500" />
                    <span>Fase</span>
                    <span className="text-indigo-600 text-xs max-w-[120px] truncate" title={selectedPhase}>{selectedPhase.replace(/^Fase \d+:?\s*/, '')}</span>
                  </button>
                  {showPhaseFilter && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowPhaseFilter(false)} />
                      <div className="absolute left-0 mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-xl z-50 p-4">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Fase</label>
                        <select
                          value={selectedPhase}
                          onChange={(e) => {
                            setSelectedPhase(e.target.value);
                            setShowPhaseFilter(false);
                          }}
                          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          {phases.map(phase => (
                            <option key={phase} value={phase}>{phase}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch gap-2">
              <button
                onClick={openAddActivity}
                className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Actividad</span>
              </button>

              <button
                onClick={() => setRapManagerOpen(true)}
                className="flex items-center justify-center space-x-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg transition-colors shadow-sm border border-indigo-200"
              >
                <Plus className="w-4 h-4" />
                <span>RAP</span>
              </button>


              <label className="cursor-pointer inline-flex items-center justify-center space-x-2 bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-lg transition-colors shadow-sm">
                <Upload className="w-4 h-4" />
                <span>Cargar</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(file);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </label>
              
              <div className="relative">
                <button
                  onClick={() => setShowExport(prev => !prev)}
                  className="flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Exportar</span>
                </button>
                {showExport && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />
                    <div className="absolute right-0 mt-2 w-40 rounded-lg border border-gray-200 bg-white shadow-xl z-50 p-2">
                      <button
                        onClick={() => {
                          setShowExport(false);
                          exportToExcel();
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                      >
                        Excel
                      </button>
                      <button
                        onClick={() => {
                          setShowExport(false);
                          exportToPdf();
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                      >
                        PDF
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{uploadError}</span>
        </div>
      )}

      {uploadInfo && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
          {uploadInfo}
        </div>
      )}

      {/* Una sola tabla con columnas sticky: misma fila para datos y calificaciones, así las alturas siempre coinciden al hacer scroll */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-left min-w-[900px] border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr style={{ height: TABLE_ROW_HEIGHT_PX, minHeight: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
              <th className="px-4 py-4 font-semibold text-gray-600 text-sm w-10 min-w-10 max-w-10 sticky left-0 z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] align-middle overflow-hidden" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                <input
                  type="checkbox"
                  checked={paginatedStudentsFiltered.length > 0 && paginatedStudentsFiltered.every(s => selectedStudents.has(s.id))}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
              </th>
              <th className="px-4 py-4 font-semibold text-gray-600 text-xs font-mono w-10 min-w-10 max-w-10 sticky left-10 z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] align-middle overflow-hidden" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>No</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-32 min-w-32 max-w-32 sticky left-20 z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] overflow-hidden text-ellipsis whitespace-nowrap align-middle" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>Documento</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-48 min-w-48 max-w-48 sticky left-[208px] z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] overflow-hidden text-ellipsis whitespace-nowrap align-middle" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                <button
                  type="button"
                  onClick={() => handleSort('lastname')}
                  className={`inline-flex items-center gap-1 hover:text-indigo-700 ${
                    sortOrder === 'lastname' ? 'text-indigo-700' : ''
                  }`}
                >
                  Apellidos
                  {sortOrder === 'lastname' && (
                    <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-48 min-w-48 max-w-48 sticky left-[400px] z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] overflow-hidden text-ellipsis whitespace-nowrap align-middle" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                <button
                  type="button"
                  onClick={() => handleSort('firstname')}
                  className={`inline-flex items-center gap-1 hover:text-indigo-700 ${
                    sortOrder === 'firstname' ? 'text-indigo-700' : ''
                  }`}
                >
                  Nombres
                  {sortOrder === 'firstname' && (
                    <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
              <th className={`px-4 py-4 font-semibold text-gray-600 text-sm w-40 min-w-40 max-w-40 sticky left-[592px] bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] overflow-visible align-middle ${showStatusFilter ? 'z-[100]' : 'z-30'}`} style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                <div className="relative inline-flex items-center gap-1" ref={statusFilterRef}>
                  <button
                    type="button"
                    onClick={() => setShowStatusFilter(prev => !prev)}
                    className="inline-flex items-center gap-1 hover:text-gray-900 focus:outline-none whitespace-nowrap"
                    title="Filtrar por estado"
                  >
                    Estado
                    <Filter className="w-3.5 h-3.5 text-gray-400" />
                    {filterStatus !== 'Todos' && (
                      <span className="text-indigo-600 text-xs">({filterStatus})</span>
                    )}
                  </button>
                  {showStatusFilter && (
                    <>
                      <div className="fixed inset-0 z-[99]" onClick={() => setShowStatusFilter(false)} />
                      <div className="absolute left-0 top-full mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-xl z-[100] py-1">
                        <button type="button" onClick={() => { setFilterStatus('Todos'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Todos' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Todos los Estados</button>
                        <button type="button" onClick={() => { setFilterStatus('Formación'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Formación' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Formación</button>
                        <button type="button" onClick={() => { setFilterStatus('Cancelado'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Cancelado' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Cancelado</button>
                        <button type="button" onClick={() => { setFilterStatus('Retiro Voluntario'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Retiro Voluntario' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Retiro Voluntario</button>
                        <button type="button" onClick={() => { setFilterStatus('Deserción'); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Deserción' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Deserción</button>
                      </div>
                    </>
                  )}
                </div>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-28 min-w-28 max-w-28 sticky left-[752px] z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] overflow-hidden text-ellipsis whitespace-nowrap align-middle" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>Ficha</th>
              <th className="px-4 py-4 font-semibold text-gray-600 text-sm w-24 min-w-24 max-w-24 sticky left-[864px] z-30 bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[6px_0_8px_-6px_rgba(0,0,0,0.15)] overflow-hidden text-ellipsis whitespace-nowrap align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }} title="Clic para marcar como evaluado">Juicios Evaluativos</th>
              {visibleActivities.map(activity => (
                <th key={activity.id} className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => openActivityDetail(activity)} className="hover:text-gray-900 underline decoration-dotted">{getActivityShortLabel(activity.name)}</button>
                    <button onClick={() => openEditActivity(activity)} className="text-gray-400 hover:text-indigo-600" title="Editar actividad"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setActivityToDelete(activity)} className="text-gray-400 hover:text-red-600" title="Eliminar actividad"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </th>
              ))}
              {rapColumnsForFicha.map(key => (
                <th key={key} className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                  <button type="button" onClick={() => { const fichaNotes = rapNotes[rapKey] || rapNotes[selectedFicha] || {}; setRapModal({ key, text: fichaNotes[key] || '' }); }} className="hover:text-gray-900 underline decoration-dotted">{key}</button>
                </th>
              ))}
              {hasActivities && (
                <>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>Pendientes</th>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>Promedio</th>
                  <th className="px-4 py-4 font-semibold text-gray-600 text-sm border-r border-gray-200 align-middle text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                    <div className="relative inline-block" ref={finalFilterRef}>
                      <button
                        type="button"
                        onClick={() => setShowFinalFilter(prev => !prev)}
                        className="inline-flex items-center gap-1 hover:text-gray-900 focus:outline-none"
                        title="Aprobado (A) solo cuando el aprendiz entrega y aprueba todas las actividades. Clic para filtrar."
                      >
                        Final
                        <Filter className="w-3.5 h-3.5 text-gray-400" />
                        {finalFilter !== 'all' && <span className="text-indigo-600 text-xs">({finalFilter === 'A' ? 'A' : '-'})</span>}
                      </button>
                      {showFinalFilter && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowFinalFilter(false)} />
                          <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1">
                            <button type="button" onClick={() => { setFinalFilter('all'); setShowFinalFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${finalFilter === 'all' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Todos</button>
                            <button type="button" onClick={() => { setFinalFilter('A'); setShowFinalFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${finalFilter === 'A' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Solo A (aprobados)</button>
                            <button type="button" onClick={() => { setFinalFilter('-'); setShowFinalFilter(false); }} className={`w-full text-left px-3 py-2 text-sm ${finalFilter === '-' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Solo - (resto)</button>
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
                <td colSpan={8 + visibleActivities.length + rapColumnsForFicha.length + (hasActivities ? 3 : 0)} className="px-6 py-8 text-center text-gray-500">
                  {filterStatus !== 'Todos' ? 'Ningún aprendiz coincide con el filtro de estado seleccionado.' : selectedFicha === 'Todas' ? 'No hay aprendices.' : 'No hay aprendices en esta ficha.'}
                </td>
              </tr>
            ) : studentsFilteredByFinal.length === 0 ? (
              <tr>
                <td colSpan={8 + visibleActivities.length + rapColumnsForFicha.length + (hasActivities ? 3 : 0)} className="px-6 py-8 text-center text-gray-500">
                  Ningún aprendiz coincide con el filtro FINAL seleccionado.
                </td>
              </tr>
            ) : (
              paginatedStudentsFiltered.map((student, index) => (
                <tr key={student.id} className="group hover:bg-gray-50" style={{ height: TABLE_ROW_HEIGHT_PX, minHeight: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                  <td className="px-4 py-4 w-10 min-w-10 max-w-10 sticky left-0 z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] align-middle overflow-hidden transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                    <input type="checkbox" checked={selectedStudents.has(student.id)} onChange={(e) => handleSelectStudent(student.id, e.target.checked)} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                  </td>
                  <td className="px-4 py-4 w-10 min-w-10 max-w-10 text-gray-500 font-mono text-xs sticky left-10 z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] align-middle overflow-hidden transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>{showAllStudents ? index + 1 : (currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                  <td className="px-6 py-4 w-32 min-w-32 max-w-32 text-gray-600 font-mono text-xs sticky left-20 z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] overflow-hidden text-ellipsis whitespace-nowrap align-middle transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>{student.documentNumber || '-'}</td>
                  <td className="px-6 py-4 w-48 min-w-48 max-w-48 text-xs font-medium text-gray-900 sticky left-[208px] z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] overflow-hidden text-ellipsis whitespace-nowrap align-middle transition-colors cursor-pointer hover:text-indigo-600 hover:underline" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }} title={`Ver detalle de ${student.lastName} ${student.firstName}`} onClick={() => setStudentDetailModal(student)}>{student.lastName}</td>
                  <td className="px-6 py-4 w-48 min-w-48 max-w-48 text-xs font-medium text-gray-900 sticky left-[400px] z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] overflow-hidden text-ellipsis whitespace-nowrap align-middle transition-colors cursor-pointer hover:text-indigo-600 hover:underline" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }} title={`Ver detalle de ${student.lastName} ${student.firstName}`} onClick={() => setStudentDetailModal(student)}>{student.firstName}</td>
                  <td className="px-4 py-4 w-40 min-w-40 max-w-40 text-sm sticky left-[592px] z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] overflow-hidden align-middle transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                    <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                      student.status === 'Formación' ? 'bg-green-100 text-green-800' :
                      student.status === 'Cancelado' ? 'bg-yellow-100 text-yellow-800' :
                      student.status === 'Retiro Voluntario' ? 'bg-orange-100 text-orange-800' :
                      student.status === 'Deserción' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {student.status || 'Formación'}
                    </span>
                  </td>
                  <td className="px-6 py-4 w-28 min-w-28 max-w-28 text-sm text-gray-700 sticky left-[752px] z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[4px_0_6px_-4px_rgba(0,0,0,0.12)] overflow-hidden text-ellipsis whitespace-nowrap align-middle transition-colors" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>{student.group || <span className="text-gray-400">-</span>}</td>
                  <td
                    className="px-4 py-4 w-24 min-w-24 max-w-24 sticky left-[864px] z-20 bg-white group-hover:bg-gray-50 shadow-[inset_1px_0_0_0_#e5e7eb,inset_-1px_0_0_0_#e5e7eb] shadow-[6px_0_8px_-6px_rgba(0,0,0,0.15)] align-middle transition-colors cursor-pointer text-center overflow-hidden"
                    style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX, minHeight: TABLE_ROW_HEIGHT_PX }}
                    onClick={() => toggleJuicioEvaluativo(student.id, student.group)}
                    title={
                      getJuicioEstado(student.id, student.group) === '-'
                        ? 'Clic: en proceso (naranja)'
                        : getJuicioEstado(student.id, student.group) === 'orange'
                          ? 'Clic: evaluado (verde)'
                          : 'Clic: quitar (guión)'
                    }
                  >
                    {getJuicioEstado(student.id, student.group) === '-' ? (
                      <span className="text-gray-400">-</span>
                    ) : (
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${
                          getJuicioEstado(student.id, student.group) === 'orange'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </td>
                  {visibleActivities.map(activity => {
                    const isOtherFicha = selectedFicha === 'Todas' && activity.group !== (student.group || '');
                    if (isOtherFicha) {
                      return <td key={activity.id} className="px-4 py-4 text-sm text-gray-400 border-r border-gray-200 align-middle overflow-hidden" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>-</td>;
                    }
                    const grade = gradeMap.get(`${student.id}-${activity.id}`);
                    const isEditing = editingCell?.studentId === student.id && editingCell?.activityId === activity.id;
                    return (
                      <td key={activity.id} className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle overflow-hidden" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }} onClick={() => { setEditingCell({ studentId: student.id, activityId: activity.id }); setEditingScore(grade ? String(grade.score) : ''); }}>
                        {isEditing ? (
                          <input type="number" min={0} max={100} className="w-20 bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={editingScore} onChange={(e) => setEditingScore(e.target.value)}
                            onBlur={() => { const trimmed = editingScore.trim(); if (!trimmed) { deleteGradeEntry(student.id, activity.id); setEditingCell(null); setEditingScore(''); return; } const numeric = Number(trimmed); if (!Number.isNaN(numeric)) { const finalScore = Math.max(0, Math.min(100, Math.round(numeric))); upsertGrades([{ studentId: student.id, activityId: activity.id, score: finalScore, letter: scoreToLetter(finalScore), updatedAt: new Date().toISOString() }]); } setEditingCell(null); setEditingScore(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); if (e.key === 'Escape') { setEditingCell(null); setEditingScore(''); } }} autoFocus />
                        ) : grade ? (
                          <span className="inline-flex items-center gap-2"><span className="font-semibold">{grade.score}</span><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${grade.letter === 'A' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{grade.letter}</span></span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    );
                  })}
                  {(() => {
                    const final = getFinalForStudent(student.id, student.group);
                    const allApproved = final.letter === 'A';
                    const rapLetter = allApproved ? 'A' : '-';
                    return (
                      <>
                        {rapColumnsForFicha.map(key => (
                          <td key={`${student.id}-${key}`} className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle overflow-hidden" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                            {rapLetter === '-' ? <span className="text-gray-400">-</span> : <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rapLetter === 'A' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{rapLetter}</span>}
                          </td>
                        ))}
                        {hasActivities && (
                          <>
                            <td className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle overflow-hidden text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}><span className="font-semibold">{final.pending}</span></td>
                            <td className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle overflow-hidden text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                              {final.score === null ? <span className="text-gray-400">-</span> : <span className="font-semibold">{Number(final.score).toFixed(2)}</span>}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-700 border-r border-gray-200 align-middle overflow-hidden text-center" style={{ height: TABLE_ROW_HEIGHT_PX, maxHeight: TABLE_ROW_HEIGHT_PX }}>
                              {final.letter === 'A' ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">A</span> : <span className="text-gray-400">-</span>}
                            </td>
                          </>
                        )}
                      </>
                    );
                  })()}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm flex-wrap gap-2">
        <span className="text-gray-500">
          {showAllStudents
            ? `Mostrando todos (${studentsFilteredByFinal.length} aprendices)`
            : `Mostrando ${(currentPage - 1) * ITEMS_PER_PAGE + 1} a ${Math.min(currentPage * ITEMS_PER_PAGE, studentsFilteredByFinal.length)} de ${studentsFilteredByFinal.length} resultados`}
        </span>
        <div className="flex items-center gap-3">
          {showAllStudents ? (
            <button
              type="button"
              onClick={() => setShowAllStudents(false)}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Mostrar 15 por página
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowAllStudents(true)}
                className="text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Mostrar todos
              </button>
              {totalPagesFiltered > 1 && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <span className="text-gray-700 font-medium min-w-[6rem] text-center">
                    Página {currentPage} de {totalPagesFiltered}
                  </span>
                  <button
onClick={() => setCurrentPage(p => Math.min(totalPagesFiltered, p + 1))}
                     disabled={currentPage === totalPagesFiltered}
                    className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {selectedStudents.size > 0 && (
          <span className="text-gray-500">Seleccionados: {selectedStudents.size}</span>
        )}
      </div>

      {isActivityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setIsActivityModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {editingActivity ? 'Editar Actividad' : 'Nueva Actividad'}
              </h3>
              <button onClick={() => setIsActivityModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <textarea
                  ref={activityNameRef}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none overflow-hidden"
                  rows={2}
                  value={activityName}
                  onChange={(e) => {
                    setActivityName(e.target.value);
                    if (activityNameRef.current) {
                      activityNameRef.current.style.height = 'auto';
                      activityNameRef.current.style.height = `${activityNameRef.current.scrollHeight}px`;
                    }
                  }}
                  onInput={() => {
                    if (activityNameRef.current) {
                      activityNameRef.current.style.height = 'auto';
                      activityNameRef.current.style.height = `${activityNameRef.current.scrollHeight}px`;
                    }
                  }}
                  onFocus={() => {
                    if (activityNameRef.current) {
                      activityNameRef.current.style.height = 'auto';
                      activityNameRef.current.style.height = `${activityNameRef.current.scrollHeight}px`;
                    }
                  }}
                />
              </div>
              <div className="pt-2 flex space-x-3">
                <button
                  onClick={() => setIsActivityModalOpen(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveActivity}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activityToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setActivityToDelete(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar actividad?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Se eliminarán las calificaciones asociadas a esta actividad.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setActivityToDelete(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  deleteGradeActivity(activityToDelete.id);
                  setActivityToDelete(null);
                }}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {activityDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setActivityDetailModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Detalle actividad</h3>
              <button onClick={() => setActivityDetailModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="text-sm text-gray-700 font-medium">{activityDetailModal.name}</div>
              {activityDetailText && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{activityDetailText}</p>
              )}
              <div className="pt-2">
                <button
                  onClick={() => setActivityDetailModal(null)}
                  className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {studentDetailModal && (() => {
        const sid = studentDetailModal.id;
        const final = getFinalForStudent(sid, studentDetailModal.group);
        const rapLetter = final.letter === 'A' ? 'A' : '-';
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setStudentDetailModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Detalle del aprendiz</h3>
              <button onClick={() => setStudentDetailModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm flex-shrink-0">
              <div><span className="font-medium text-gray-500">Documento:</span> <span className="text-gray-900 font-mono">{studentDetailModal.documentNumber || '-'}</span></div>
              <div><span className="font-medium text-gray-500">Apellidos:</span> <span className="text-gray-900">{studentDetailModal.lastName}</span></div>
              <div><span className="font-medium text-gray-500">Nombres:</span> <span className="text-gray-900">{studentDetailModal.firstName}</span></div>
              <div><span className="font-medium text-gray-500">Correo:</span> <span className="text-gray-900">{studentDetailModal.email || '-'}</span></div>
              <div><span className="font-medium text-gray-500">Ficha:</span> <span className="text-gray-900">{studentDetailModal.group || 'General'}</span></div>
            </div>
            <div className="mt-4 flex-shrink-0">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Calificaciones</h4>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-medium text-gray-600">Actividad</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-right w-20">Nota</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-center w-14">Letra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleActivities.map(activity => {
                      const grade = gradeMap.get(`${sid}-${activity.id}`);
                      return (
                        <tr key={activity.id}>
                          <td className="px-3 py-2 text-gray-900">{getActivityShortLabel(activity.name)}</td>
                          <td className="px-3 py-2 text-right font-medium">{grade ? grade.score : '-'}</td>
                          <td className="px-3 py-2 text-center">
                            {grade ? (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${grade.letter === 'A' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{grade.letter}</span>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                    {rapColumnsForFicha.map(key => (
                      <tr key={key}>
                        <td className="px-3 py-2 text-gray-900">{key}</td>
                        <td className="px-3 py-2 text-right">-</td>
                        <td className="px-3 py-2 text-center">
                          {rapLetter === '-' ? '-' : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">A</span>}
                        </td>
                      </tr>
                    ))}
                    {visibleActivities.length > 0 && (
                      <>
                        <tr className="bg-gray-50 font-medium">
                          <td className="px-3 py-2 text-gray-900">Pendientes</td>
                          <td className="px-3 py-2 text-center" colSpan={2}>{final.pending}</td>
                        </tr>
                        <tr className="bg-gray-50 font-medium">
                          <td className="px-3 py-2 text-gray-900">Promedio</td>
                          <td className="px-3 py-2 text-center font-medium" colSpan={2}>{final.score !== null ? Number(final.score).toFixed(2) : '-'}</td>
                        </tr>
                        <tr className="bg-gray-50 font-medium">
                          <td className="px-3 py-2 text-gray-900">FINAL</td>
                          <td className="px-3 py-2 text-center" colSpan={2}>
                            {final.letter === 'A' ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">A</span> : '-'}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 flex-shrink-0">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Observaciones</h4>
              <textarea
                value={studentDetailObservation}
                onChange={(e) => setStudentDetailObservation(e.target.value)}
                placeholder="Escribe aquí observaciones sobre el aprendiz..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y min-h-[80px] max-h-32"
                rows={3}
              />
              <button
                type="button"
                onClick={() => {
                  if (!studentDetailModal) return;
                  const prev = getStudentGradeObservations();
                  saveStudentGradeObservations({ ...prev, [studentDetailModal.id]: studentDetailObservation });
                }}
                className="mt-2 w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
              >
                Guardar observaciones
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {rapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setRapModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Detalle {rapModal.key}</h3>
              <button onClick={() => setRapModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <textarea
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                rows={4}
                placeholder="Escribe el texto para este RAP..."
                value={rapModal.text}
                onChange={(e) => setRapModal({ ...rapModal, text: e.target.value })}
              />
              <div className="pt-2 flex space-x-3">
                <button
                  onClick={() => setRapModal(null)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const updated = { ...rapNotes };
                    const fichaNotes = { ...(updated[rapKey] || updated[selectedFicha] || {}) };
                    fichaNotes[rapModal.key] = rapModal.text.trim();
                    updated[rapKey] = fichaNotes;
                    setRapNotes(updated);
                    saveRapNotes(updated);
                    setRapModal(null);
                  }}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rapManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setRapManagerOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Columnas RAP</h3>
              <button onClick={() => setRapManagerOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="Ej: RAP6"
                  value={rapNewName}
                  onChange={(e) => setRapNewName(e.target.value)}
                />
                <button
                  onClick={() => {
                    const name = rapNewName.trim();
                    if (!name) return;
                    const updated = { ...rapColumns };
                    const list = [...(updated[rapKey] || rapColumnsForFicha)];
                    if (!list.includes(name)) {
                      list.push(name);
                      updated[rapKey] = list;
                      setRapColumns(updated);
                      saveRapColumns(updated);
                      if (rapNewDetail.trim()) {
                        const notesUpdated = { ...rapNotes };
                        const fichaNotes = { ...(notesUpdated[rapKey] || {}) };
                        fichaNotes[name] = rapNewDetail.trim();
                        notesUpdated[rapKey] = fichaNotes;
                        setRapNotes(notesUpdated);
                        saveRapNotes(notesUpdated);
                      }
                    }
                    setRapNewName('');
                    setRapNewDetail('');
                  }}
                  className="bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700"
                >
                  Agregar
                </button>
              </div>
              <textarea
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                rows={3}
                placeholder="Detalle del RAP (opcional)"
                value={rapNewDetail}
                onChange={(e) => setRapNewDetail(e.target.value)}
              />
              <div className="space-y-2">
                {rapColumnsForFicha.map(col => (
                  <div key={col} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700">{col}</span>
                    <button
                      onClick={() => {
                        const updated = { ...rapColumns };
                        const list = (updated[rapKey] || rapColumnsForFicha).filter(item => item !== col);
                        updated[rapKey] = list;
                        setRapColumns(updated);
                        saveRapColumns(updated);
                        const notesUpdated = { ...rapNotes };
                        if (notesUpdated[rapKey]) {
                          const { [col]: _removed, ...rest } = notesUpdated[rapKey];
                          notesUpdated[rapKey] = rest;
                          setRapNotes(notesUpdated);
                          saveRapNotes(notesUpdated);
                        }
                      }}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

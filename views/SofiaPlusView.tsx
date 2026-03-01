import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Filter,
  History, Search, Upload, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Ficha, JuicioRapEntry, JuicioRapHistoryEntry, RapDefinition, Student } from '../types';
import {
  appendSofiaJuicioHistory,
  getFichas,
  getSofiaJuicioEntries,
  getSofiaJuicioHistory,
  getSofiaRapDefs,
  getStudents,
  saveSofiaRapDefs,
  upsertSofiaJuicioEntries,
} from '../services/db';

// ---------------------------------------------------------------------------
// Competencia ordering from Planeacion_PedagogicaGRD.xlsx (Fases 1-4)
// Keywords are normalized (no accents, lowercase) unique fragments per competencia
// ---------------------------------------------------------------------------
const COMPETENCIA_KEYWORDS_ORDERED: Array<{ kw: string; fase: string; ap: string }> = [
  { kw: 'resultado de aprendizaje de la induccion', fase: 'Fase Inducción', ap: '' },
  { kw: 'enrique low murtra', fase: 'Fase Inducción', ap: '' },
  { kw: 'administrar hardware y software de seguridad en la red', fase: 'Fase 1: Análisis', ap: 'AP1' },
  { kw: 'utilizar herramientas informaticas de acuerdo con las necesidades de manejo', fase: 'Fase 1: Análisis', ap: 'AP1' },
  { kw: 'interactuar en lengua inglesa de forma oral y escrita', fase: 'Fase 1: Análisis', ap: 'AP1' },
  { kw: 'configurar dispositivos activos de interconexion segun especificaciones del diseno', fase: 'Fase 2: Planeación', ap: 'AP2' },
  { kw: 'implementar red inalambrica local segun especificaciones del diseno', fase: 'Fase 2: Planeación', ap: 'AP2' },
  { kw: 'razonar cuantitativamente frente a situaciones susceptibles', fase: 'Fase 2: Planeación', ap: 'AP2' },
  { kw: 'implementar tecnologias de voz sobre ip de acuerdo con el diseno', fase: 'Fase 2: Planeación', ap: 'AP2' },
  { kw: 'administrar infraestructura tecnologica de red segun modelos de referencia', fase: 'Fase 2: Planeación', ap: 'AP2' },
  { kw: 'aplicacion de conocimientos de las ciencias naturales de acuerdo con situaciones', fase: 'Fase 2: Planeación', ap: 'AP2' },
  { kw: 'desarrollar procesos de comunicacion eficaces y efectivos teniendo en cuenta situaciones de orden', fase: 'Fase 3: Ejecución', ap: 'AP3' },
  { kw: 'configurar dispositivos de computo de acuerdo con especificaciones del diseno', fase: 'Fase 3: Ejecución', ap: 'AP3' },
  { kw: 'orientar investigacion formativa segun referentes tecnicos', fase: 'Fase 3: Ejecución', ap: 'AP3' },
  { kw: 'generar habitos saludables de vida mediante la aplicacion de programas de actividad fisica', fase: 'Fase 3: Ejecución', ap: 'AP3' },
  { kw: 'aplicar practicas de proteccion ambiental seguridad y salud en el trabajo', fase: 'Fase 4: Evaluación', ap: 'AP4' },
  { kw: 'gestionar procesos propios de la cultura emprendedora y empresarial', fase: 'Fase 4: Evaluación', ap: 'AP4' },
  { kw: 'ejercer derechos fundamentales del trabajo en el marco de la constitucion', fase: 'Fase 4: Evaluación', ap: 'AP4' },
  { kw: 'resultados de aprendizaje etapa practica', fase: 'Etapa Práctica', ap: '' },
];

const normalizeText = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Strip leading code prefix: "35848 - TEXT" → "text" */
const stripCodePrefix = (s: string) => {
  const m = s.match(/^[\d][\d\-]*\s*[-–]\s*/);
  return m ? s.slice(m[0].length) : s;
};

const getCompetenciaOrder = (competenciaName: string): number => {
  const norm = normalizeText(stripCodePrefix(competenciaName));
  const idx = COMPETENCIA_KEYWORDS_ORDERED.findIndex(({ kw }) => norm.includes(kw) || kw.includes(norm.substring(0, 40)));
  return idx >= 0 ? idx : 998;
};

const getCompetenciaFaseInfo = (competenciaName: string): { fase: string; ap: string } => {
  const norm = normalizeText(stripCodePrefix(competenciaName));
  const found = COMPETENCIA_KEYWORDS_ORDERED.find(({ kw }) => norm.includes(kw) || kw.includes(norm.substring(0, 40)));
  return found ? { fase: found.fase, ap: found.ap } : { fase: '', ap: '' };
};

/** Abbreviate competencia name: show code + first significant words */
const abbreviateCompetencia = (name: string, maxWords = 5): string => {
  const codeMatch = name.match(/^[\d][\d\-]*\s*[-–]\s*/);
  const code = codeMatch ? name.slice(0, codeMatch[0].length).trim().replace(/\s*[-–]\s*$/, '') : '';
  const rest = stripCodePrefix(name).split(' ').slice(0, maxWords).join(' ');
  return code ? `${code} · ${rest}` : rest;
};

/** Convert Excel serial date number to ISO string */
const excelSerialToIso = (serial: number): string => {
  if (!serial || !Number.isFinite(serial)) return '';
  try {
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return d.toISOString();
  } catch {
    return '';
  }
};

const formatFecha = (iso: string): string => {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

const cleanFuncionario = (raw: string): string => {
  if (!raw || raw.trim() === '-' || raw.trim() === '  -  ' || raw.trim() === '  -   ') return '-';
  return raw.trim();
};

const normalizeDoc = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return Math.trunc(value).toString().replace(/^0+/, '') || '0';
  }
  const str = String(value).trim();
  if (!str) return '';
  const numeric = Number(str);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    return Math.trunc(numeric).toString().replace(/^0+/, '') || '0';
  }
  return str.replace(/\D/g, '').replace(/^0+/, '') || str;
};

const buildNameKey = (value: string) =>
  normalizeText(value).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2);

const JUICIO_BADGE: Record<string, { label: string; cls: string }> = {
  'APROBADO':    { label: 'A',  cls: 'bg-green-100 text-green-700 border border-green-200' },
  'NO APROBADO': { label: 'NA', cls: 'bg-red-100 text-red-700 border border-red-200' },
  'POR EVALUAR': { label: 'PE', cls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
};

const TABLE_ROW_HEIGHT_PX = 52;
const ITEMS_PER_PAGE = 15;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const SofiaPlusView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [rapDefs, setRapDefs] = useState<Record<string, RapDefinition>>({});
  const [juicioEntries, setJuicioEntries] = useState<Record<string, JuicioRapEntry>>({});
  const [juicioHistory, setJuicioHistory] = useState<JuicioRapHistoryEntry[]>([]);

  // Filters
  const [selectedFicha, setSelectedFicha] = useState('Todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [filterJuicio, setFilterJuicio] = useState<'all' | 'APROBADO' | 'NO APROBADO' | 'POR EVALUAR'>('all');
  const [showFichaFilter, setShowFichaFilter] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showJuicioFilter, setShowJuicioFilter] = useState(false);

  // Sort
  const [sortOrder, setSortOrder] = useState<'lastname' | 'firstname'>('lastname');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllStudents, setShowAllStudents] = useState(false);

  // Upload feedback
  const [uploadError, setUploadError] = useState('');
  const [uploadInfo, setUploadInfo] = useState('');

  // History panel
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFicha, setHistoryFicha] = useState('Todas');
  const [historyPage, setHistoryPage] = useState(1);

  // Cell detail
  const [cellDetail, setCellDetail] = useState<{
    student: Student;
    rap: RapDefinition;
    entry: JuicioRapEntry | null;
  } | null>(null);

  const fichaFilterRef = useRef<HTMLDivElement>(null);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  const juicioFilterRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------
  const loadData = () => {
    setStudents(getStudents());
    setFichas(getFichas());
    setRapDefs(getSofiaRapDefs());
    setJuicioEntries(getSofiaJuicioEntries());
    setJuicioHistory(getSofiaJuicioHistory());
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [selectedFicha, searchTerm, filterStatus, filterJuicio, sortOrder, sortDirection]);

  // ---------------------------------------------------------------------------
  // Computed: sorted RAP columns
  // ---------------------------------------------------------------------------
  const rapColumns = useMemo(() => {
    return (Object.values(rapDefs) as RapDefinition[]).sort((a, b) => {
      const oa = getCompetenciaOrder(a.competenciaName);
      const ob = getCompetenciaOrder(b.competenciaName);
      if (oa !== ob) return oa - ob;
      return parseInt(a.rapId, 10) - parseInt(b.rapId, 10);
    });
  }, [rapDefs]);

  // Grouped by competencia for double header row
  const competenciaGroups = useMemo(() => {
    const groups: Array<{ competenciaId: string; competenciaName: string; raps: RapDefinition[]; fase: string; ap: string }> = [];
    let current: typeof groups[0] | null = null;
    rapColumns.forEach(rap => {
      if (!current || current.competenciaId !== rap.competenciaId) {
        const info = getCompetenciaFaseInfo(rap.competenciaName);
        current = { competenciaId: rap.competenciaId, competenciaName: rap.competenciaName, raps: [], ...info };
        groups.push(current);
      }
      current.raps.push(rap);
    });
    return groups;
  }, [rapColumns]);

  // ---------------------------------------------------------------------------
  // Computed: filtered + sorted students
  // ---------------------------------------------------------------------------
  const studentsForFicha = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = students.filter(s => {
      const matchFicha = selectedFicha === 'Todas' || (s.group || 'General') === selectedFicha;
      const matchStatus = filterStatus === 'Todos' || (s.status || 'Formación') === filterStatus;
      const matchSearch = !term || (
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(term) ||
        String(s.documentNumber || '').includes(term)
      );
      return matchFicha && matchStatus && matchSearch;
    });

    const filteredByJuicio = filterJuicio === 'all' ? filtered : filtered.filter(s =>
      rapColumns.some(rap => juicioEntries[`${s.id}-${rap.rapId}`]?.juicio === filterJuicio)
    );

    return [...filteredByJuicio].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      const cmp = sortOrder === 'lastname'
        ? a.lastName.localeCompare(b.lastName, 'es') || a.firstName.localeCompare(b.firstName, 'es')
        : a.firstName.localeCompare(b.firstName, 'es') || a.lastName.localeCompare(b.lastName, 'es');
      return dir * cmp;
    });
  }, [students, selectedFicha, filterStatus, searchTerm, filterJuicio, rapColumns, juicioEntries, sortOrder, sortDirection]);

  const totalPages = Math.ceil(studentsForFicha.length / ITEMS_PER_PAGE);
  const paginatedStudents = useMemo(() => {
    if (showAllStudents) return studentsForFicha;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return studentsForFicha.slice(start, start + ITEMS_PER_PAGE);
  }, [studentsForFicha, currentPage, showAllStudents]);

  const handleSort = (col: 'lastname' | 'firstname') => {
    if (sortOrder === col) setSortDirection(p => p === 'asc' ? 'desc' : 'asc');
    else { setSortOrder(col); setSortDirection('asc'); }
  };

  // ---------------------------------------------------------------------------
  // Computed: history
  // ---------------------------------------------------------------------------
  const filteredHistory = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    return [...juicioHistory]
      .filter(e => {
        if (historyFicha !== 'Todas' && e.fichaCode !== historyFicha) return false;
        if (!term) return true;
        const s = students.find(st => st.id === e.studentId);
        const name = s ? `${s.firstName} ${s.lastName}`.toLowerCase() : '';
        const doc = s ? String(s.documentNumber || '').toLowerCase() : '';
        return (
          name.includes(term) || doc.includes(term) ||
          e.rapId.toLowerCase().includes(term) ||
          normalizeText(e.funcionario).includes(normalizeText(term)) ||
          normalizeText(rapDefs[e.rapId]?.competenciaName || '').includes(normalizeText(term))
        );
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [juicioHistory, historySearch, historyFicha, students, rapDefs]);

  const HIST_PER_PAGE = 20;
  const historyTotalPages = Math.ceil(filteredHistory.length / HIST_PER_PAGE);
  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * HIST_PER_PAGE;
    return filteredHistory.slice(start, start + HIST_PER_PAGE);
  }, [filteredHistory, historyPage]);

  useEffect(() => { setHistoryPage(1); }, [historySearch, historyFicha]);

  // ---------------------------------------------------------------------------
  // Upload handler
  // ---------------------------------------------------------------------------
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

      // Extract ficha code from row 2 (index 2), column 2
      const fichaCode = String(rows[2]?.[2] || '').trim();

      // Find header row
      const headerRowIndex = rows.findIndex(r => String(r[0]).includes('Tipo de Documento'));
      if (headerRowIndex < 0) {
        setUploadError('No se encontró la fila de encabezados. Verifica que sea un "Reporte de Juicios Evaluativos".');
        return;
      }

      const dataRows = rows.slice(headerRowIndex + 1).filter(r => r.some(c => c !== ''));

      // Build student lookup maps
      const studentsByDoc = new Map<string, Student>();
      const studentsByName = new Map<string, Student>();
      students.forEach(s => {
        const docKey = normalizeDoc(s.documentNumber || '');
        if (docKey) studentsByDoc.set(docKey, s);
        const fullName = buildNameKey(`${s.firstName} ${s.lastName}`);
        studentsByName.set(fullName, s);
        studentsByName.set(buildNameKey(`${s.lastName} ${s.firstName}`), s);
      });

      // Columns: 0=tipodoc, 1=numdoc, 2=nombre, 3=apellidos, 4=estado, 5=competencia, 6=rap, 7=juicio, 8=(empty), 9=fecha, 10=funcionario
      const newEntries: JuicioRapEntry[] = [];
      const newRapDefs: Record<string, RapDefinition> = { ...rapDefs };
      const unmatched: string[] = [];

      dataRows.forEach(row => {
        const docRaw = normalizeDoc(row[1]);
        const firstName = String(row[2] || '').trim();
        const lastName = String(row[3] || '').trim();
        const competenciaRaw = String(row[5] || '').trim();
        const rapRaw = String(row[6] || '').trim();
        const juicioRaw = String(row[7] || '').trim().toUpperCase();
        const fechaRaw = row[9];
        const funcionarioRaw = String(row[10] || '').trim();

        if (!rapRaw || !competenciaRaw) return;

        // Match student
        let student: Student | undefined = docRaw ? studentsByDoc.get(docRaw) : undefined;
        if (!student && (firstName || lastName)) {
          const nameKey = buildNameKey(`${firstName} ${lastName}`);
          student = studentsByName.get(nameKey) || studentsByName.get(buildNameKey(`${lastName} ${firstName}`));
          if (!student) {
            const tokens = nameKey.split(' ').filter(Boolean);
            student = students.find(s => {
              const key = buildNameKey(`${s.firstName} ${s.lastName}`);
              return tokens.every(t => key.includes(t));
            });
          }
        }
        if (!student) {
          if (docRaw || firstName || lastName)
            unmatched.push(docRaw || `${firstName} ${lastName}`.trim());
          return;
        }

        // Extract RAP and competencia IDs
        const rapIdMatch = rapRaw.match(/^(\d+)\s*[-–]/);
        const rapId = rapIdMatch ? rapIdMatch[1] : rapRaw.substring(0, 10);
        const rapName = rapIdMatch ? rapRaw.slice(rapIdMatch[0].length).trim() : rapRaw;

        const compIdMatch = competenciaRaw.match(/^(\d+)\s*[-–]/);
        const competenciaId = compIdMatch ? compIdMatch[1] : competenciaRaw.substring(0, 10);
        const competenciaName = competenciaRaw;

        if (!newRapDefs[rapId]) {
          newRapDefs[rapId] = { rapId, rapName, competenciaId, competenciaName };
        }

        const juicio = (['APROBADO', 'NO APROBADO', 'POR EVALUAR'] as const).find(j => j === juicioRaw) || 'POR EVALUAR';
        const fecha = typeof fechaRaw === 'number' && fechaRaw > 0 ? excelSerialToIso(fechaRaw) : '';
        const funcionario = cleanFuncionario(funcionarioRaw);

        newEntries.push({
          studentId: student.id,
          rapId,
          juicio,
          fecha,
          funcionario,
          fichaCode,
          updatedAt: new Date().toISOString(),
        });
      });

      // Save RAP definitions
      saveSofiaRapDefs(newRapDefs);

      // Save juicio entries (upsert)
      upsertSofiaJuicioEntries(newEntries);

      // Append APROBADO entries to history
      const historyEntries: JuicioRapHistoryEntry[] = newEntries
        .filter(e => e.juicio === 'APROBADO' && e.fecha)
        .map(e => ({ ...e, historyId: generateId() }));
      appendSofiaJuicioHistory(historyEntries);

      const uniqueUnmatched = [...new Set(unmatched)];
      setUploadInfo(
        `Se actualizaron ${newEntries.length} juicios.` +
        (historyEntries.length > 0 ? ` ${historyEntries.length} registros APROBADOS en historial.` : '') +
        (uniqueUnmatched.length > 0 ? ` Sin coincidencia: ${uniqueUnmatched.length} aprendices.` : '')
      );
      loadData();
    } catch (err) {
      console.error(err);
      setUploadError('No se pudo procesar el archivo. Verifica que sea un "Reporte de Juicios Evaluativos" válido.');
    }
  };

  // ---------------------------------------------------------------------------
  // Stats for info bar
  // ---------------------------------------------------------------------------
  const stats = useMemo(() => {
    const aprobados = studentsForFicha.filter(s =>
      rapColumns.every(rap => juicioEntries[`${s.id}-${rap.rapId}`]?.juicio === 'APROBADO')
      && rapColumns.length > 0
    ).length;
    return { total: studentsForFicha.length, aprobados };
  }, [studentsForFicha, rapColumns, juicioEntries]);

  const hasData = rapColumns.length > 0;
  const totalColCount = 7 + rapColumns.length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* -------- Header -------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sofia Plus · Juicios Evaluativos</h2>
          <p className="text-gray-500 text-sm">
            Carga el "Reporte de Juicios Evaluativos" diariamente para actualizar el estado por RAP de cada aprendiz.
          </p>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar aprendiz..."
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-sm w-56"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Ficha filter */}
          <div className="relative" ref={fichaFilterRef}>
            <button
              type="button"
              onClick={() => setShowFichaFilter(p => !p)}
              className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-300 shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Filter className="w-4 h-4 text-gray-500" />
              Ficha {selectedFicha !== 'Todas' && <span className="text-indigo-600">({selectedFicha})</span>}
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
                    {fichas.map(f => <option key={f.id} value={f.code}>{f.code} - {f.program}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Status filter */}
          <div className="relative" ref={statusFilterRef}>
            <button
              type="button"
              onClick={() => setShowStatusFilter(p => !p)}
              className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-300 shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Filter className="w-4 h-4 text-gray-500" />
              Estado {filterStatus !== 'Todos' && <span className="text-indigo-600">({filterStatus})</span>}
            </button>
            {showStatusFilter && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowStatusFilter(false)} />
                <div className="absolute left-0 mt-2 w-52 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1">
                  {['Todos', 'Formación', 'Cancelado', 'Retiro Voluntario', 'Deserción'].map(opt => (
                    <button key={opt} type="button"
                      onClick={() => { setFilterStatus(opt); setShowStatusFilter(false); }}
                      className={`w-full text-left px-3 py-2 text-sm ${filterStatus === opt ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      {opt === 'Todos' ? 'Todos los estados' : opt}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Juicio filter */}
          <div className="relative" ref={juicioFilterRef}>
            <button
              type="button"
              onClick={() => setShowJuicioFilter(p => !p)}
              className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-300 shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Filter className="w-4 h-4 text-gray-500" />
              Juicio {filterJuicio !== 'all' && <span className="text-indigo-600">({JUICIO_BADGE[filterJuicio]?.label})</span>}
            </button>
            {showJuicioFilter && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowJuicioFilter(false)} />
                <div className="absolute left-0 mt-2 w-52 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1">
                  {(['all', 'APROBADO', 'NO APROBADO', 'POR EVALUAR'] as const).map(opt => (
                    <button key={opt} type="button"
                      onClick={() => { setFilterJuicio(opt); setShowJuicioFilter(false); }}
                      className={`w-full text-left px-3 py-2 text-sm ${filterJuicio === opt ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      {opt === 'all' ? 'Todos los juicios' : opt}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* History toggle */}
          <button
            type="button"
            onClick={() => setShowHistory(p => !p)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm text-sm font-medium transition-colors ${showHistory ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
          >
            <History className="w-4 h-4" />
            Historial APROBADOS
            {juicioHistory.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${showHistory ? 'bg-white/20' : 'bg-green-100 text-green-700'}`}>
                {juicioHistory.length}
              </span>
            )}
          </button>

          {/* Upload */}
          <label className="cursor-pointer inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-lg transition-colors shadow-sm text-sm">
            <Upload className="w-4 h-4" />
            Cargar Reporte
            <input
              type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { handleFileUpload(f); e.currentTarget.value = ''; } }}
            />
          </label>
        </div>
      </div>

      {/* -------- Feedback banners -------- */}
      {uploadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{uploadError}</span>
        </div>
      )}
      {uploadInfo && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{uploadInfo}</div>
      )}

      {/* -------- Stats bar -------- */}
      {hasData && (
        <div className="flex items-center gap-6 px-4 py-2 bg-indigo-50 rounded-lg border border-indigo-100 text-sm">
          <span className="text-indigo-700 font-medium">{stats.total} aprendices</span>
          <span className="text-green-700 font-medium">{stats.aprobados} con todos los RAPs aprobados</span>
          <span className="text-gray-600">{rapColumns.length} resultados de aprendizaje</span>
          <span className="text-gray-600">{juicioHistory.length} aprobaciones en historial</span>
        </div>
      )}

      {/* -------- Main table -------- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-left min-w-max border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            {/* Row 1: student info headers (rowspan=2) + competencia group headers */}
            <tr style={{ height: 40 }}>
              <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-sm w-10 min-w-10 sticky left-0 z-30 bg-gray-50 border-r border-gray-200 align-middle">
                <span className="sr-only">Sel</span>
              </th>
              <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-xs w-10 min-w-10 sticky left-10 z-30 bg-gray-50 border-r border-gray-200 align-middle">No</th>
              <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-sm w-32 min-w-32 sticky left-20 z-30 bg-gray-50 border-r border-gray-200 align-middle whitespace-nowrap">Documento</th>
              <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-sm w-40 min-w-40 sticky left-[128px] z-30 bg-gray-50 border-r border-gray-200 align-middle">
                <button type="button" onClick={() => handleSort('firstname')} className={`inline-flex items-center gap-1 hover:text-indigo-700 whitespace-nowrap ${sortOrder === 'firstname' ? 'text-indigo-700' : ''}`}>
                  Nombres {sortOrder === 'firstname' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-sm w-40 min-w-40 sticky left-[308px] z-30 bg-gray-50 border-r border-gray-200 align-middle">
                <button type="button" onClick={() => handleSort('lastname')} className={`inline-flex items-center gap-1 hover:text-indigo-700 whitespace-nowrap ${sortOrder === 'lastname' ? 'text-indigo-700' : ''}`}>
                  Apellidos {sortOrder === 'lastname' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-sm w-32 min-w-32 sticky left-[488px] z-30 bg-gray-50 border-r border-gray-200 align-middle whitespace-nowrap">Estado</th>
              <th rowSpan={2} className="px-4 font-semibold text-gray-600 text-sm w-24 min-w-24 sticky left-[620px] z-30 bg-gray-50 border-r border-gray-200 align-middle">Ficha</th>
              {!hasData && <th rowSpan={2} className="px-4 font-semibold text-gray-400 text-sm align-middle">Carga un reporte para ver los RAPs</th>}
              {competenciaGroups.map(g => (
                <th
                  key={g.competenciaId}
                  colSpan={g.raps.length}
                  className="px-2 py-1 text-xs font-semibold text-center border-l border-gray-300 bg-indigo-50/70 align-middle"
                  title={g.competenciaName}
                >
                  <span className="block truncate max-w-[160px] mx-auto text-indigo-700" style={{ maxWidth: Math.max(80, g.raps.length * 52) }}>
                    {g.ap && <span className="font-bold mr-1">{g.ap}</span>}
                    {abbreviateCompetencia(g.competenciaName, 4)}
                  </span>
                  {g.fase && <span className="block text-indigo-400 font-normal text-[10px]">{g.fase}</span>}
                </th>
              ))}
            </tr>
            {/* Row 2: RAP ID columns */}
            <tr style={{ height: 32 }}>
              {rapColumns.map(rap => (
                <th
                  key={rap.rapId}
                  className="px-1 py-1 text-xs font-semibold text-gray-500 border-l border-gray-200 text-center align-middle whitespace-nowrap"
                  style={{ minWidth: 52 }}
                  title={rap.rapName}
                >
                  {rap.rapId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.length === 0 ? (
              <tr>
                <td colSpan={totalColCount} className="px-6 py-8 text-center text-gray-500">
                  No hay aprendices registrados.
                </td>
              </tr>
            ) : studentsForFicha.length === 0 ? (
              <tr>
                <td colSpan={totalColCount} className="px-6 py-8 text-center text-gray-500">
                  Ningún aprendiz coincide con los filtros.
                </td>
              </tr>
            ) : (
              paginatedStudents.map((student, index) => {
                const rowIndex = showAllStudents ? index + 1 : (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                return (
                  <tr key={student.id} className="group hover:bg-gray-50" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                    {/* Checkbox */}
                    <td className="px-4 w-10 min-w-10 sticky left-0 z-20 bg-white group-hover:bg-gray-50 border-r border-gray-100 align-middle" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                      <div className="w-2 h-2 rounded-full bg-gray-300 mx-auto" />
                    </td>
                    {/* No */}
                    <td className="px-4 w-10 min-w-10 text-gray-500 font-mono text-xs sticky left-10 z-20 bg-white group-hover:bg-gray-50 border-r border-gray-100 align-middle" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                      {rowIndex}
                    </td>
                    {/* Documento */}
                    <td className="px-4 w-32 min-w-32 text-gray-600 font-mono text-xs sticky left-20 z-20 bg-white group-hover:bg-gray-50 border-r border-gray-100 align-middle overflow-hidden whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                      {student.documentNumber || '-'}
                    </td>
                    {/* Nombres */}
                    <td className="px-4 w-40 min-w-40 text-xs font-medium text-gray-900 sticky left-[128px] z-20 bg-white group-hover:bg-gray-50 border-r border-gray-100 align-middle overflow-hidden whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                      {student.firstName}
                    </td>
                    {/* Apellidos */}
                    <td className="px-4 w-40 min-w-40 text-xs font-medium text-gray-900 sticky left-[308px] z-20 bg-white group-hover:bg-gray-50 border-r border-gray-100 align-middle overflow-hidden whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                      {student.lastName}
                    </td>
                    {/* Estado */}
                    <td className="px-4 w-32 min-w-32 sticky left-[488px] z-20 bg-white group-hover:bg-gray-50 border-r border-gray-100 align-middle" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                        student.status === 'Formación' ? 'bg-green-100 text-green-800' :
                        student.status === 'Cancelado' ? 'bg-yellow-100 text-yellow-800' :
                        student.status === 'Retiro Voluntario' ? 'bg-orange-100 text-orange-800' :
                        student.status === 'Deserción' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {student.status || 'Formación'}
                      </span>
                    </td>
                    {/* Ficha */}
                    <td className="px-4 w-24 min-w-24 text-xs text-gray-600 sticky left-[620px] z-20 bg-white group-hover:bg-gray-50 border-r border-gray-100 align-middle whitespace-nowrap" style={{ height: TABLE_ROW_HEIGHT_PX }}>
                      {student.group || '-'}
                    </td>
                    {/* RAP juicio cells */}
                    {rapColumns.map(rap => {
                      const entry = juicioEntries[`${student.id}-${rap.rapId}`];
                      const badge = entry ? JUICIO_BADGE[entry.juicio] : null;
                      return (
                        <td
                          key={rap.rapId}
                          className="px-1 text-center border-l border-gray-100 align-middle cursor-pointer hover:bg-indigo-50/50 transition-colors"
                          style={{ height: TABLE_ROW_HEIGHT_PX, minWidth: 52 }}
                          onClick={() => setCellDetail({ student, rap, entry: entry || null })}
                          title={`${rap.rapId} · Click para ver detalles`}
                        >
                          {badge ? (
                            <span className={`inline-flex items-center justify-center text-xs font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>
                              {badge.label}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* -------- Pagination -------- */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl text-sm flex-wrap gap-2">
        <span className="text-gray-500">
          {showAllStudents
            ? `Mostrando todos (${studentsForFicha.length})`
            : `Mostrando ${(currentPage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(currentPage * ITEMS_PER_PAGE, studentsForFicha.length)} de ${studentsForFicha.length}`}
        </span>
        <div className="flex items-center gap-2">
          {!showAllStudents && totalPages > 1 && (
            <>
              <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-gray-600">Pág. {currentPage} de {totalPages}</span>
              <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          <button type="button" onClick={() => setShowAllStudents(p => !p)} className="text-indigo-600 hover:text-indigo-700 font-medium">
            {showAllStudents ? 'Mostrar 15 por página' : 'Mostrar todos'}
          </button>
        </div>
      </div>

      {/* -------- Legend -------- */}
      <div className="flex items-center gap-4 text-xs text-gray-500 px-1">
        {Object.entries(JUICIO_BADGE).map(([key, val]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`inline-flex items-center justify-center text-xs font-bold px-1.5 py-0.5 rounded ${val.cls}`}>{val.label}</span>
            {key}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="text-gray-300 font-bold">-</span> Sin dato
        </span>
      </div>

      {/* -------- History Panel -------- */}
      {showHistory && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 bg-green-50 border-b border-green-100">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-green-700" />
              <div>
                <h3 className="font-semibold text-gray-900">Historial de Juicios APROBADOS</h3>
                <p className="text-xs text-gray-500">Registro completo de aprobaciones por RAP. Se actualiza al cargar nuevos reportes.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* History ficha filter */}
              <select
                value={historyFicha}
                onChange={e => setHistoryFicha(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
              >
                <option value="Todas">Todas las fichas</option>
                {fichas.map(f => <option key={f.id} value={f.code}>{f.code}</option>)}
              </select>
              {/* History search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white w-44"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                />
              </div>
              <button type="button" onClick={() => setShowHistory(false)} className="p-1.5 rounded-lg hover:bg-green-100 text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">
              {juicioHistory.length === 0
                ? 'No hay aprobaciones registradas. Carga un reporte con juicios APROBADOS.'
                : 'Ningún registro coincide con los filtros.'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse min-w-max">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-xs whitespace-nowrap">Fecha y Hora</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-xs whitespace-nowrap">Ficha</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-xs whitespace-nowrap">Aprendiz</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-xs whitespace-nowrap">Documento</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-xs whitespace-nowrap">Competencia</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-xs whitespace-nowrap">RAP</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 text-xs whitespace-nowrap">Funcionario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedHistory.map(entry => {
                      const s = students.find(st => st.id === entry.studentId);
                      const rap = rapDefs[entry.rapId];
                      return (
                        <tr key={entry.historyId} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-gray-400" />
                              {formatFecha(entry.fecha)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{entry.fichaCode || '-'}</td>
                          <td className="px-4 py-3 text-xs font-medium text-gray-900 whitespace-nowrap">
                            {s ? `${s.firstName} ${s.lastName}` : entry.studentId}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-600 whitespace-nowrap">
                            {s?.documentNumber || '-'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700 max-w-xs">
                            <span className="block truncate" title={rap?.competenciaName}>
                              {rap ? abbreviateCompetencia(rap.competenciaName, 6) : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700 max-w-xs">
                            <span className="block truncate" title={rap?.rapName}>
                              <span className="font-mono mr-1">{entry.rapId}</span>
                              <span className="text-gray-500">{rap?.rapName?.substring(0, 60) || ''}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{entry.funcionario || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* History pagination */}
              {historyTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
                  <span className="text-gray-500">
                    {(historyPage - 1) * HIST_PER_PAGE + 1}–{Math.min(historyPage * HIST_PER_PAGE, filteredHistory.length)} de {filteredHistory.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage <= 1} className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-gray-600">Pág. {historyPage} de {historyTotalPages}</span>
                    <button type="button" onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))} disabled={historyPage >= historyTotalPages} className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* -------- Cell detail modal -------- */}
      {cellDetail && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setCellDetail(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl border border-gray-200 p-6 z-50 max-w-lg w-full">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Detalle del RAP</h3>
              <button type="button" onClick={() => setCellDetail(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Aprendiz</span>
                <p className="text-gray-900 font-medium">{cellDetail.student.firstName} {cellDetail.student.lastName}</p>
                <p className="text-gray-500 text-xs">{cellDetail.student.documentNumber} · Ficha {cellDetail.student.group || '-'}</p>
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Competencia</span>
                <p className="text-gray-700">{cellDetail.rap.competenciaName}</p>
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Resultado de Aprendizaje (RAP {cellDetail.rap.rapId})</span>
                <p className="text-gray-700">{cellDetail.rap.rapName}</p>
              </div>
              {cellDetail.entry ? (
                <>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Juicio:</span>
                    <span className={`inline-flex items-center gap-1 text-sm font-bold px-3 py-1 rounded-full ${JUICIO_BADGE[cellDetail.entry.juicio]?.cls || ''}`}>
                      {cellDetail.entry.juicio === 'APROBADO' && <Check className="w-3.5 h-3.5" />}
                      {cellDetail.entry.juicio}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fecha y Hora del Juicio</span>
                    <p className="text-gray-700">{formatFecha(cellDetail.entry.fecha)}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Funcionario que registró</span>
                    <p className="text-gray-700">{cellDetail.entry.funcionario || '-'}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ficha del reporte</span>
                    <p className="text-gray-700">{cellDetail.entry.fichaCode || '-'}</p>
                  </div>
                </>
              ) : (
                <div className="py-2 text-gray-400 italic text-sm">Sin juicio registrado para este RAP.</div>
              )}
            </div>
            <button type="button" onClick={() => setCellDetail(null)} className="mt-5 w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors">
              Cerrar
            </button>
          </div>
        </>
      )}
    </div>
  );
};

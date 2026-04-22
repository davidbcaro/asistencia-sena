import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Download, Eye, EyeOff, GripVertical, X } from 'lucide-react';
import { Ficha, GradeActivity, GuiaColumn, PlaneacionSemanalFichaData } from '../types';
import { deleteGradeActivity, getFichas, getGradeActivities, getPlaneacionSemanal, savePlaneacionSemanal } from '../services/db';

// ─── Phase structure (matches PLANEACION SEMANAL GRD.xlsx exactly) ──────────
// Inducción=3  Análisis=10  Planeación=24  Ejecución=40  Evaluación=30  → 107 total (3 evidencias EEF en inducción)
const PHASE_SEGMENTS = [
  { phase: 'Fase Inducción',     count: 3,  color: '#f59e0b', text: '#ffffff' },
  { phase: 'Fase 1: Análisis',   count: 10, color: '#0d9488', text: '#ffffff' },
  { phase: 'Fase 2: Planeación', count: 24, color: '#3b82f6', text: '#ffffff' },
  { phase: 'Fase 3: Ejecución',  count: 40, color: '#8b5cf6', text: '#ffffff' },
  { phase: 'Fase 4: Evaluación', count: 30, color: '#ef4444', text: '#ffffff' },
] as const;

const TOTAL_WEEKS = PHASE_SEGMENTS.reduce((s, p) => s + p.count, 0); // 106

// Pre-build weekIndex → phase segment
const WEEK_PHASE_MAP: typeof PHASE_SEGMENTS[number][] = [];
for (const seg of PHASE_SEGMENTS) for (let i = 0; i < seg.count; i++) WEEK_PHASE_MAP.push(seg);

type ColDesc = { type: 'week'; idx: number } | { type: 'guia'; g: GuiaColumn };

// Week dates: base 29/09/2025.
// All arithmetic uses UTC milliseconds (86 400 000 ms/day exactly) so DST
// clock changes never shift a week boundary.
const MS_PER_DAY = 86_400_000;
const BASE_DATE_UTC = Date.UTC(2025, 8, 29); // Sep 29 2025 — month is 0-indexed

/** Format a UTC timestamp as DD/MM/YYYY */
const fmtUtc = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

/** Format a UTC timestamp as YYYY-MM-DD (for <input type="date">) */
const isoFromUtc = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

/** Parse YYYY-MM-DD (from <input type="date">) → UTC midnight ms */
const parseIso = (iso: string): number => {
  const [y, m, day] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
};

/** Build effective start & end dates, honouring overrides.
 *  Uses pure UTC arithmetic — immune to DST transitions. */
const buildWeekDates = (overrides: Record<number, string> = {}, totalWeeks = TOTAL_WEEKS): { starts: string[]; ends: string[]; isos: string[] } => {
  const starts: string[] = [];
  const ends:   string[] = [];
  const isos:   string[] = [];
  let curMs = BASE_DATE_UTC;
  for (let w = 0; w < totalWeeks; w++) {
    if (overrides[w]) curMs = parseIso(overrides[w]);
    isos.push(isoFromUtc(curMs));
    starts.push(fmtUtc(curMs));
    ends.push(fmtUtc(curMs + 6 * MS_PER_DAY));
    curMs += 7 * MS_PER_DAY;
  }
  return { starts, ends, isos };
};

// ─── Transversal rows (colors match PLANEACION SEMANAL GRD legend) ──────────
const TECNICA_COLOR = '#FFE600'; // Amarillo brillante — Técnica row

const TRANSVERSAL_ROWS = [
  { key: 'TICs',              label: "TIC's",              color: '#8CC63F', textColor: '#2E4A0E' },
  { key: 'Bilingüismo',       label: 'Bilingüismo',        color: '#FF1E1E', textColor: '#8B0000' },
  { key: 'Matemáticas',       label: 'Matemáticas',        color: '#D9C4B8', textColor: '#4A3728' },
  { key: 'Comunicación',      label: 'Comunicación / Ética / Derechos', color: '#3F6A94', textColor: '#1E3A5F' },
  { key: 'Investigación',     label: 'Investigación',      color: '#C04A00', textColor: '#7A2E00' },
  { key: 'Ambiente',          label: 'Ambiente',           color: '#3FA9D6', textColor: '#1A5A78' },
  { key: 'Emprendimiento',    label: 'Emprendimiento',     color: '#C9C9C9', textColor: '#3A3A3A' },
  { key: 'EducaciónFísica',   label: 'Edu. Física',        color: '#1A1A1A', textColor: '#1A1A1A' },
  { key: 'CienciasNaturales', label: 'Ciencias Naturales', color: '#9E9E9E', textColor: '#333333' },
] as const;

// ─── Default data seeded from the Excel ─────────────────────────────────────
// Técnica labels: weekIndex → label (descriptive text without GA code)
const DEFAULT_TECNICA: Record<number, string> = {
   2: 'Cuestionario técnicas levantamiento de información y plan de seguridad',
   5: 'Informe inventario y dispositivos de la red',
  12: 'Taller interpretación de planos',
  13: 'Lista de chequeo inspección infraestructura física',
  15: 'Video expositivo topologías',
  24: 'Listado dispositivos y recursos VoIP',
  25: 'Lista de chequeo plataforma de monitoreo',
  27: 'Informe soluciones VoIP',
  36: 'Archivo simulación subredes IPv4/IPv6',
  37: 'Video config. componentes inalámbricos',
  38: 'Informe laboratorio subredes',
  39: 'Video config. parámetros integración',
  40: 'Simulación config. WAN, VLAN',
  41: 'Lista verificación canales inalámbricos',
  42: 'Informe laboratorio WAN, VLAN',
  43: 'Video funcionamiento red inalámbrica',
  48: 'Video config. sistemas operativos',
  51: 'Informe técnico equipos y SO',
  60: 'Video implementación mecanismos comunicación',
  62: 'Video config. equipos y software VoIP',
  68: 'Video config. plataforma gestión y monitoreo',
  69: 'Informe práctica hardware/software seguridad',
  70: 'Informe laboratorio plataforma monitoreo',
  71: 'Informe implementación políticas y controles',
  76: 'Taller indicadores desempeño red',
  77: 'Lista verificación parámetros calidad',
  78: 'Informe pruebas conectividad',
  80: 'Informe detección fallas red',
  84: 'Informe detección fallos rendimiento',
  86: 'Bitácora eventos infraestructura',
  88: 'Informe actualización hardware/software',
  90: 'Lista chequeo verificación VoIP',
  92: 'Bitácora actividades VoIP',
  96: 'Informe análisis alertas detección intrusos',
  97: 'Informe hallazgos vulnerabilidades',
  98: 'Lista chequeo supervisión infraestructura',
  99: 'Informe monitoreo estado de la red',
 102: 'Lista verificación plataforma gestión',
};

// Transversal default cells: `${rowKey}::${weekIndex}` → label
const DEFAULT_TRANSVERSAL: Record<string, string> = {
  // TICs – Guía 1
  'TICs::3':  'Mapa mental - Software y servicios de Internet',
  'TICs::4':  'Taller utilización herramientas de ofimática',
  'TICs::6':  'Informe pertinencia recursos TIC',
  'TICs::8':  'Plan de mejora productos y procesos con TIC',
  // Matemáticas – Guía 2
  'Matemáticas::14': 'Cuestionario procedimientos aritméticos',
  'Matemáticas::16': 'Informe planteamiento de ecuación',
  'Matemáticas::18': 'Video sustentación matemáticas',
  'Matemáticas::20': 'Algoritmo cálculo áreas y volúmenes',
  // Ciencias Naturales – Guía 3
  'CienciasNaturales::26': 'Cuestionario ciencias naturales',
  'CienciasNaturales::28': 'Video expositivo experimento',
  'CienciasNaturales::30': 'Informe de laboratorio',
  'CienciasNaturales::32': 'Video expositivo experimento aplicación',
  'CienciasNaturales::34': 'Bitácora de procesos',
  // Comunicación – Guía 4
  'Comunicación::37': 'Video ¿Cómo nos comunicamos?',
  'Comunicación::39': 'Video comunicación expresión humana',
  'Comunicación::41': 'Infografía interpretación del entorno',
  'Comunicación::43': 'Informe creación contenidos comunicativos',
  // Investigación – Guía 5
  'Investigación::49': 'Mapa mental investigación',
  'Investigación::52': 'Propuesta de investigación',
  // Bilingüismo – Guías 1, 2, 4, 5, 6, 7
  'Bilingüismo::9':  'Cuestionario bilingüismo G1',
  'Bilingüismo::10': 'Video presentación G1',
  'Bilingüismo::17': 'Cuestionario G2-AA1',
  'Bilingüismo::19': 'Vídeo entrevista virtual G2',
  'Bilingüismo::21': 'Cuestionario G2-AA2',
  'Bilingüismo::23': 'Video presentación lugar turístico G2',
  'Bilingüismo::44': 'Cuestionario G4-AA1',
  'Bilingüismo::45': 'Audio G4',
  'Bilingüismo::46': 'Cuestionario G4-AA2',
  'Bilingüismo::54': 'Cuestionario G5-AA1',
  'Bilingüismo::56': 'Mapa mental G5',
  'Bilingüismo::58': 'Blog G5',
  'Bilingüismo::64': 'Diagrama de flujo G6',
  'Bilingüismo::65': 'Ensayo G6',
  'Bilingüismo::67': 'Vídeo G6',
  'Bilingüismo::73': 'Documento escrito G7',
  'Bilingüismo::74': 'Video G7',
  'Bilingüismo::75': 'Foro G7',
  // Educación Física – Guía 7
  'EducaciónFísica::72': 'Foro técnicas coordinación motriz',
  'EducaciónFísica::73': 'Infografía estilos vida saludable',
  'EducaciónFísica::74': 'Ficha antropométrica condición física',
  'EducaciónFísica::75': 'Folleto lesiones y pausas activas',
  // Ambiente – Guía 8
  'Ambiente::79': 'Análisis caso contexto ambiental y SST',
  'Ambiente::81': 'Diagrama Ishikawa impactos ambientales',
  'Ambiente::82': 'Mapa mental planes ambiente y SST',
  'Ambiente::83': 'Video oportunidades mejora ambiente',
  // Emprendimiento – Guía 10
  'Emprendimiento::91': 'Conociendo mi visión',
  'Emprendimiento::93': 'Taller identificación problema',
  'Emprendimiento::94': 'Prototipo de la solución',
  'Emprendimiento::95': 'Taller negociación y modelo negocio',
  // Derechos Trabajo – Guía 11 (parte de Comunicación / Ética / Derechos)
  'Comunicación::96':  'Taller derechos trabajo',
  'Comunicación::97':  'Informe trabajo decente',
  'Comunicación::98':  'Infografía sobre la huelga',
  'Comunicación::99':  'Cuadro comparativo derecho de petición',
  'Comunicación::100': 'Presentación derechos trabajo',
  // Ética – Guía 12 (parte de Comunicación / Ética / Derechos)
  'Comunicación::102': 'Presentación proyecto de vida',
  'Comunicación::103': 'Diagrama de sistemas',
  'Comunicación::104': 'Estrategia uso racional recursos',
  'Comunicación::105': 'Solución del caso. Cultura de paz',
};

/** Build the default seeded data for a ficha that has no planeación yet — starts empty */
const buildDefaultData = (): PlaneacionSemanalFichaData => EMPTY_DATA;

/** Keys that were auto-seeded by the old buildDefaultData — used to detect and clear legacy data */
const DEFAULT_SEEDED_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(DEFAULT_TECNICA).map(wk => `Técnica::${wk}`),
  ...Object.keys(DEFAULT_TRANSVERSAL),
]);

const EMPTY_DATA: PlaneacionSemanalFichaData = { tecnicaAssignments: {}, transversalAssignments: {}, transversalCells: {}, cardDurations: {}, hiddenCards: [], weekDateOverrides: {}, phaseWeekCounts: {} };

// ─── Card key helpers ────────────────────────────────────────────────────────
const actKey = (id: string)                   => `act::${id}`;
const lblKey = (rowKey: string, text: string) => `lbl::${rowKey}::${text}`;
const CELL_W  = 200; // px per week column (fixed)
const DATE_H  = 22;  // px for the date header sub-row
const PHASE_H = 28;  // px for phase header row
const LABEL_W = 150; // px for row label column

// ─── Competency code → area type (mirrors CronogramaGeneralView) ─────────────
const COMPETENCY_TO_AREA: Record<string, string> = {
  '220501014': 'Técnica',
  '220501104': 'Técnica',
  '220501107': 'Técnica',
  '220501091': 'Técnica',
  '220501105': 'Técnica',
  '220501106': 'Técnica',
  '220501046': 'TICs',
  '240202501': 'Bilingüismo',
  '240201528': 'Matemáticas',
  '240201524': 'Comunicación',
  '210201501': 'Comunicación',
  '240201526': 'Comunicación',
  '240201064': 'Investigación',
  '220601501': 'Ambiente',
  '240201529': 'Emprendimiento',
  '230101507': 'EducaciónFísica',
  '220201501': 'CienciasNaturales',
};

/** Color + text color per area, using the official palette.
 *  Cards use `color+'33'` (~20% opacity) so text must be dark enough to contrast. */
const AREA_STYLES: Record<string, { color: string; text: string }> = {
  Técnica:           { color: '#FFE600', text: '#7A6C00' },
  TICs:              { color: '#8CC63F', text: '#2E4A0E' },
  Bilingüismo:       { color: '#FF1E1E', text: '#8B0000' },
  Matemáticas:       { color: '#D9C4B8', text: '#4A3728' },
  Comunicación:      { color: '#3F6A94', text: '#1E3A5F' },
  Investigación:     { color: '#C04A00', text: '#7A2E00' },
  Ambiente:          { color: '#3FA9D6', text: '#1A5A78' },
  Emprendimiento:    { color: '#C9C9C9', text: '#3A3A3A' },
  EducaciónFísica:   { color: '#1A1A1A', text: '#1A1A1A' },
  CienciasNaturales: { color: '#9E9E9E', text: '#333333' },
};

/** Derive the area key (e.g. 'TICs', 'Bilingüismo', 'Técnica') from a SENA activity code */
const getActivityArea = (activityName: string): string => {
  const match = activityName.match(/[A-Z]+\d*-(\d+)-/);
  return match ? (COMPETENCY_TO_AREA[match[1]] ?? 'Técnica') : 'Técnica';
};

/** Derive area color from activity.name (which holds the SENA code, e.g. GA1-220501046-AA1-EV01) */
const getActivityAreaStyle = (activityName: string): { color: string; text: string } => {
  const area = getActivityArea(activityName);
  return AREA_STYLES[area] ?? AREA_STYLES['Técnica'];
};

// ─── Evidence type → badge color ─────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  'Infografía':  '#0ea5e9',
  'Cuestionario':'#f59e0b',
  'Video':       '#8b5cf6',
  'Informe':     '#10b981',
  'Taller':      '#f97316',
  'Lista':       '#06b6d4',
  'Bitácora':    '#6366f1',
  'Mapa':        '#84cc16',
  'Propuesta':   '#ec4899',
  'Algoritmo':   '#14b8a6',
  'Audio':       '#a855f7',
  'Blog':        '#f43f5e',
  'Diagrama':    '#3b82f6',
  'Ensayo':      '#8b5cf6',
  'Folleto':     '#22c55e',
  'Foro':        '#f97316',
  'Archivo':     '#0891b2',
  'Simulación':  '#64748b',
  'Plan':        '#0d9488',
};

const getTypeColor = (text: string, fallback: string): string => {
  const first = text.split(/[\s.]/)[0];
  return TYPE_COLORS[first] ?? fallback;
};

/** Strip "Evidencia de producto:", "Evidencia de conocimiento:", etc. prefixes */
const stripEvidenciaPrefix = (text: string): string =>
  text.replace(/^evidencia\s+(?:de\s+)?(?:producto|conocimiento|desempe[nñ]o)\s*:\s*/i, '').trim();

// ─── Component ───────────────────────────────────────────────────────────────
export const PlaneacionSemanalView: React.FC = () => {
  const { fichaId } = useParams<{ fichaId: string }>();
  const navigate    = useNavigate();

  const [ficha,      setFicha]      = useState<{ id: string; code: string; program: string } | null>(null);
  const [activities, setActivities] = useState<GradeActivity[]>([]);
  const [planeacion, setPlaneacion] = useState<PlaneacionSemanalFichaData>(EMPTY_DATA);

  const [hoveredRow,     setHoveredRow]     = useState<string | null>(null);
  const [dragActivityId, setDragActivityId] = useState<string | null>(null);
  const [dragLabel,      setDragLabel]      = useState<{ rowKey: string; weekIdx: number; labelIdx: number; text: string } | null>(null);
  const [dragOverCell,   setDragOverCell]   = useState<string | null>(null);
  // Refs mirror the drag state so event handlers always read the latest value
  // even if React hasn't re-rendered between dragstart and the first dragover.
  const dragActivityIdRef = useRef<string | null>(null);
  const dragLabelRef      = useRef<{ rowKey: string; weekIdx: number; labelIdx: number; text: string } | null>(null);

  const [editingCell,       setEditingCell]       = useState<string | null>(null);
  const [editingValue,      setEditingValue]      = useState('');
  const [openDurationCard,  setOpenDurationCard]  = useState<string | null>(null);
  const [datePickerWeek,    setDatePickerWeek]    = useState<number | null>(null);
  const [editingPhase,      setEditingPhase]      = useState<string | null>(null);

  // ── Columnas Guía ─────────────────────────────────────────────────────────
  const [showAddGuia, setShowAddGuia] = useState(false);
  const [addGuiaName, setAddGuiaName] = useState('Guía 1');
  // composite "insertAfterWeekIdx::phaseName" — decouples position from phase color
  const [addGuiaPos,  setAddGuiaPos]  = useState<string>(`-1::${PHASE_SEGMENTS[0].phase}`);

  // ── Copiar planeación a otras fichas ──────────────────────────────────────
  const [copyModalOpen,   setCopyModalOpen]   = useState(false);
  const [copyTargetIds,   setCopyTargetIds]   = useState<Set<string>>(new Set());
  const [copyAllFichas,   setCopyAllFichas]   = useState<Ficha[]>([]);
  const [copyStatus,      setCopyStatus]      = useState<'idle' | 'saving' | 'done'>('idle');
  const editInputRef    = useRef<HTMLInputElement>(null);
  const dateInputRef    = useRef<HTMLInputElement>(null);
  const datePopoverRef  = useRef<HTMLDivElement>(null);
  const phasePopoverRef = useRef<HTMLDivElement>(null);

  // ── Effective phase segments (custom counts override PHASE_SEGMENTS defaults) ─
  const effectiveSegments = useMemo(() =>
    PHASE_SEGMENTS.map(seg => ({
      ...seg,
      count: (planeacion.phaseWeekCounts ?? {})[seg.phase] ?? seg.count,
    })),
  [planeacion.phaseWeekCounts]);

  const effectiveTotalWeeks = useMemo(() =>
    effectiveSegments.reduce((s, p) => s + p.count, 0),
  [effectiveSegments]);

  const effectiveWeekPhaseMap = useMemo(() => {
    const map: (typeof effectiveSegments)[number][] = [];
    for (const seg of effectiveSegments) for (let i = 0; i < seg.count; i++) map.push(seg);
    return map;
  }, [effectiveSegments]);

  // ── Ordered columns: interleaves real weeks with Guía columns ───────────────
  const orderedCols = useMemo((): ColDesc[] => {
    const result: ColDesc[] = [];
    const guias = planeacion.guiaColumns ?? [];
    guias.filter(g => g.insertAfterWeekIdx === -1)
         .sort((a, b) => a.vIdx - b.vIdx)
         .forEach(g => result.push({ type: 'guia', g }));
    for (let w = 0; w < effectiveTotalWeeks; w++) {
      result.push({ type: 'week', idx: w });
      guias.filter(g => g.insertAfterWeekIdx === w)
           .sort((a, b) => a.vIdx - b.vIdx)
           .forEach(g => result.push({ type: 'guia', g }));
    }
    return result;
  }, [effectiveTotalWeeks, planeacion.guiaColumns]);

  // ── Computed week dates (recalculate whenever overrides or phase counts change) ─
  const weekDates = useMemo(
    () => buildWeekDates(planeacion.weekDateOverrides ?? {}, effectiveTotalWeeks),
    [planeacion.weekDateOverrides, effectiveTotalWeeks],
  );

  // ── Load ────────────────────────────────────────────────────────────────
  const loadData = useCallback(() => {
    const fichas = getFichas();
    const f = fichas.find(x => x.id === fichaId);
    if (f) setFicha({ id: f.id, code: f.code, program: f.program });

    const all = getGradeActivities();
    // Incluir seeds globales (group === '') + actividades propias del ficha; deduplicar por nombre+grupo
    const filtered = f ? all.filter(a => a.group === f.code || a.group === '') : [];
    // Excluir evidencias obsoletas que ya no deben aparecer en Inducción
    const OBSOLETE_INDUCTION_CODES = /GI1-240201530-AA2-EV03|AA3-EV01/i;
    const OBSOLETE_INDUCTION_TEXT = /alternativas\s+de\s+etapa\s+productiva\s*\(\s*3\s*\)/i;
    const withoutObsolete = filtered.filter(a => {
      if (a.id === 'seed-GI1-240201530-AA2-EV03') return false;
      if (a.phase === 'Fase Inducción' && (OBSOLETE_INDUCTION_CODES.test(a.name) || OBSOLETE_INDUCTION_TEXT.test(a.detail ?? ''))) return false;
      return true;
    });
    const seen = new Set<string>();
    const deduped = withoutObsolete.filter(a => {
      const key = `${a.name.trim().toLowerCase()}::${a.group}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setActivities(deduped);

    const allPlan = getPlaneacionSemanal();
    if (!allPlan[fichaId ?? '']) {
      // First visit: seed with defaults
      const def = { ...buildDefaultData(), updatedAt: new Date().toISOString() };
      allPlan[fichaId ?? ''] = def;
      savePlaneacionSemanal(allPlan);
      setPlaneacion(def);
    } else {
      // Migrate legacy DerechosTrabajo:: and Ética:: keys → Comunicación::
      const fichaData = allPlan[fichaId ?? ''];
      if (fichaData) {
        let migrated = false;
        const cells = { ...fichaData.transversalCells };
        Object.keys(cells).forEach(k => {
          if (k.startsWith('DerechosTrabajo::') || k.startsWith('Ética::')) {
            const newKey = k.replace(/^(DerechosTrabajo|Ética)::/, 'Comunicación::');
            if (!cells[newKey]) cells[newKey] = cells[k];
            else cells[newKey] = [...cells[newKey], ...cells[k]];
            delete cells[k];
            migrated = true;
          }
        });
        // Remove any auto-seeded default labels that are still in the cells
        const cellKeysArr = Object.keys(cells);
        const hasSeededCells = cellKeysArr.some(k => DEFAULT_SEEDED_KEYS.has(k));
        if (hasSeededCells) {
          cellKeysArr.forEach(k => { if (DEFAULT_SEEDED_KEYS.has(k)) delete cells[k]; });
          migrated = true;
        }

        if (migrated) {
          allPlan[fichaId ?? ''] = { ...fichaData, transversalCells: cells };
          savePlaneacionSemanal(allPlan);
        }
      }
      setPlaneacion(allPlan[fichaId ?? ''] ?? EMPTY_DATA);
    }
  }, [fichaId]);

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, [loadData]);

  useEffect(() => {
    if (editingCell && editInputRef.current) editInputRef.current.focus();
  }, [editingCell]);

  useEffect(() => {
    if (datePickerWeek !== null && dateInputRef.current) {
      dateInputRef.current.focus();
    }
  }, [datePickerWeek]);

  // Close date picker on any click outside the popover.
  // Guard: skip if the native date-input calendar is still open (input focused).
  useEffect(() => {
    if (datePickerWeek === null) return;
    const handler = (e: MouseEvent) => {
      // Native browser calendar clicks land outside the DOM — don't close while input is focused
      if (dateInputRef.current && dateInputRef.current === document.activeElement) return;
      if (datePopoverRef.current && datePopoverRef.current.contains(e.target as Node)) return;
      setDatePickerWeek(null);
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [datePickerWeek]);

  // Close phase editor on any click outside its popover
  useEffect(() => {
    if (editingPhase === null) return;
    const handler = (e: MouseEvent) => {
      if (phasePopoverRef.current && phasePopoverRef.current.contains(e.target as Node)) return;
      setEditingPhase(null);
    };
    const t = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', handler); };
  }, [editingPhase]);

  // ── Persist ─────────────────────────────────────────────────────────────
  const persist = useCallback((updated: PlaneacionSemanalFichaData) => {
    const stamped = { ...updated, updatedAt: new Date().toISOString() };
    setPlaneacion(stamped);
    const all = getPlaneacionSemanal();
    all[fichaId ?? ''] = stamped;
    savePlaneacionSemanal(all);
  }, [fichaId]);

  // ── Abrir modal de copia ────────────────────────────────────────────────
  const openCopyModal = useCallback(() => {
    // Cargar todas las fichas excepto la actual
    const all = getFichas();
    const others = all.filter(f => f.id !== fichaId);
    setCopyAllFichas(others);
    setCopyTargetIds(new Set());
    setCopyStatus('idle');
    setCopyModalOpen(true);
  }, [fichaId]);

  const toggleCopyTarget = useCallback((id: string) => {
    setCopyTargetIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleCopyAll = useCallback(() => {
    setCopyTargetIds(prev =>
      prev.size === copyAllFichas.length
        ? new Set()
        : new Set(copyAllFichas.map(f => f.id)),
    );
  }, [copyAllFichas]);

  // ── Ejecutar copia ──────────────────────────────────────────────────────
  const handleCopyPlaneacion = useCallback(() => {
    if (copyTargetIds.size === 0 || !fichaId) return;
    setCopyStatus('saving');
    const allPlan = getPlaneacionSemanal();
    const now = new Date().toISOString();
    // Snapshot profundo de la planeación actual (se reutiliza para cada destino)
    const snapshot: PlaneacionSemanalFichaData = JSON.parse(JSON.stringify(planeacion));
    copyTargetIds.forEach(targetId => {
      allPlan[targetId] = { ...JSON.parse(JSON.stringify(snapshot)), updatedAt: now };
    });
    savePlaneacionSemanal(allPlan);
    setCopyStatus('done');
  }, [copyTargetIds, fichaId, planeacion]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const unassigned = useMemo(
    () => activities.filter(a =>
      planeacion.tecnicaAssignments[a.id] === undefined &&
      !(planeacion.transversalAssignments ?? {})[a.id]
    ),
    [activities, planeacion.tecnicaAssignments, planeacion.transversalAssignments],
  );

  const unassignedByPhase = useMemo(() => {
    const map = new Map<string, GradeActivity[]>();
    for (const seg of PHASE_SEGMENTS) map.set(seg.phase, []);
    unassigned.forEach(a => {
      if (!map.has(a.phase)) map.set(a.phase, []);
      map.get(a.phase)!.push(a);
    });
    return map;
  }, [unassigned]);

  // ── DnD ─────────────────────────────────────────────────────────────────
  const onDragStartActivity = (id: string) => {
    dragActivityIdRef.current = id;
    dragLabelRef.current = null;
    setDragActivityId(id);
    setDragLabel(null);
  };
  const onDragStartLabel = (rowKey: string, weekIdx: number, labelIdx: number, text: string) => {
    const v = { rowKey, weekIdx, labelIdx, text };
    dragLabelRef.current = v;
    dragActivityIdRef.current = null;
    setDragLabel(v);
    setDragActivityId(null);
  };
  const onDragLeave = () => setDragOverCell(null);

  const onDragOverCell = (e: React.DragEvent, rowKey: string, weekIdx: number) => {
    const ck = cellKey(rowKey, weekIdx);
    if (dragActivityIdRef.current) {
      const act = activities.find(a => a.id === dragActivityIdRef.current);
      const area = act ? getActivityArea(act.name) : 'Técnica';
      // Activity drops only on its matching row (Técnica area → Técnica row, TICs area → TICs row, etc.)
      if (area === rowKey) { e.preventDefault(); setDragOverCell(ck); return; }
    }
    if (dragLabelRef.current && dragLabelRef.current.rowKey === rowKey) { e.preventDefault(); setDragOverCell(ck); return; }
  };

  const onDropToCell = (e: React.DragEvent, rowKey: string, toWeekIdx: number) => {
    e.preventDefault();
    setDragOverCell(null);
    const actId = dragActivityIdRef.current;
    const lbl   = dragLabelRef.current;
    dragActivityIdRef.current = null;
    dragLabelRef.current = null;
    // Activity drop → to its matching row
    if (actId) {
      const act = activities.find(a => a.id === actId);
      const area = act ? getActivityArea(act.name) : 'Técnica';
      if (area === rowKey) {
        if (area === 'Técnica') {
          persist({ ...planeacion, tecnicaAssignments: { ...planeacion.tecnicaAssignments, [actId]: toWeekIdx } });
        } else {
          const tra = { ...(planeacion.transversalAssignments ?? {}) };
          tra[actId] = { rowKey, weekIdx: toWeekIdx };
          persist({ ...planeacion, transversalAssignments: tra });
        }
        setDragActivityId(null);
        return;
      }
    }
    // Label drop → same row, different week
    if (lbl && lbl.rowKey === rowKey) {
      if (lbl.weekIdx === toWeekIdx) { setDragLabel(null); return; }
      const fromCk = cellKey(lbl.rowKey, lbl.weekIdx);
      const toCk   = cellKey(rowKey, toWeekIdx);
      const fromArr = [...(planeacion.transversalCells[fromCk] ?? [])];
      fromArr.splice(lbl.labelIdx, 1);
      const toArr = [...(planeacion.transversalCells[toCk] ?? []), lbl.text];
      const cells = { ...planeacion.transversalCells };
      if (fromArr.length === 0) delete cells[fromCk]; else cells[fromCk] = fromArr;
      cells[toCk] = toArr;
      persist({ ...planeacion, transversalCells: cells });
      setDragLabel(null);
    }
  };

  const onDropToPanel = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCell(null);
    const actId = dragActivityIdRef.current;
    dragActivityIdRef.current = null;
    dragLabelRef.current = null;
    if (!actId) return;
    const ta = { ...planeacion.tecnicaAssignments };
    delete ta[actId];
    const tra = { ...(planeacion.transversalAssignments ?? {}) };
    delete tra[actId];
    persist({ ...planeacion, tecnicaAssignments: ta, transversalAssignments: tra });
    setDragActivityId(null);
  };

  const unassignActivity = (id: string) => {
    const ta = { ...planeacion.tecnicaAssignments };
    delete ta[id];
    const tra = { ...(planeacion.transversalAssignments ?? {}) };
    delete tra[id];
    persist({ ...planeacion, tecnicaAssignments: ta, transversalAssignments: tra });
  };

  // ── Cell text editing ────────────────────────────────────────────────────
  const cellKey        = (rowKey: string, w: number) => `${rowKey}::${w}`;
  const getLabels      = (rowKey: string, w: number) => planeacion.transversalCells[cellKey(rowKey, w)] ?? [];
  const startEditCell  = (rowKey: string, w: number) => { setEditingCell(cellKey(rowKey, w)); setEditingValue(''); };
  const commitEdit     = () => {
    if (!editingCell) return;
    const v = editingValue.trim();
    if (v) {
      const ex = planeacion.transversalCells[editingCell] ?? [];
      persist({ ...planeacion, transversalCells: { ...planeacion.transversalCells, [editingCell]: [...ex, v] } });
    }
    setEditingCell(null);
    setEditingValue('');
  };
  const removeLabel = (rowKey: string, w: number, idx: number) => {
    const k = cellKey(rowKey, w);
    const arr = (planeacion.transversalCells[k] ?? []).filter((_, i) => i !== idx);
    const cells = { ...planeacion.transversalCells };
    if (arr.length === 0) delete cells[k]; else cells[k] = arr;
    persist({ ...planeacion, transversalCells: cells });
  };

  // ── Week date overrides ──────────────────────────────────────────────────
  const setWeekDateOverride = useCallback((weekIdx: number, isoDate: string) => {
    const overrides = { ...(planeacion.weekDateOverrides ?? {}), [weekIdx]: isoDate };
    persist({ ...planeacion, weekDateOverrides: overrides });
    // Do NOT close the picker here — let the user close it manually so the
    // native calendar doesn't get dismissed mid-interaction.
  }, [planeacion, persist]);

  const clearWeekDateOverride = useCallback((weekIdx: number) => {
    const overrides = { ...(planeacion.weekDateOverrides ?? {}) };
    delete overrides[weekIdx];
    persist({ ...planeacion, weekDateOverrides: overrides });
    setDatePickerWeek(null);
  }, [planeacion, persist]);

  // ── Phase week count ─────────────────────────────────────────────────────
  const setPhaseWeekCount = useCallback((phase: string, count: number) => {
    const clamped = Math.max(1, Math.min(200, Math.round(count)));
    const counts = { ...(planeacion.phaseWeekCounts ?? {}), [phase]: clamped };
    persist({ ...planeacion, phaseWeekCounts: counts });
  }, [planeacion, persist]);

  const clearPhaseWeekCount = useCallback((phase: string) => {
    const counts = { ...(planeacion.phaseWeekCounts ?? {}) };
    delete counts[phase];
    persist({ ...planeacion, phaseWeekCounts: counts });
  }, [planeacion, persist]);

  // ── Duration & visibility ────────────────────────────────────────────────
  const getDuration = useCallback((key: string): 1 | 2 =>
    (planeacion.cardDurations?.[key] ?? 1) as 1 | 2, [planeacion.cardDurations]);

  const setCardDuration = useCallback((key: string, d: 1 | 2) => {
    persist({ ...planeacion, cardDurations: { ...(planeacion.cardDurations ?? {}), [key]: d } });
  }, [planeacion, persist]);

  const isHidden = useCallback((key: string): boolean =>
    (planeacion.hiddenCards ?? []).includes(key), [planeacion.hiddenCards]);

  const toggleHidden = useCallback((key: string) => {
    const arr = planeacion.hiddenCards ?? [];
    const next = arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];
    persist({ ...planeacion, hiddenCards: next });
  }, [planeacion, persist]);

  // ── Row span plan ────────────────────────────────────────────────────────
  // For each row, compute which cells render with colspan=1 or colspan=2.
  // A cell at weekIdx W gets span=2 if any of its cards has duration=2 AND W+1 < TOTAL_WEEKS.
  // The following week (W+1) is then "consumed" and skipped.
  const planRow = useCallback((rowKey: string, isTecnica: boolean): Array<{ weekIdx: number; span: 1 | 2 }> => {
    const result: Array<{ weekIdx: number; span: 1 | 2 }> = [];
    const consumed = new Set<number>();
    const durations = planeacion.cardDurations ?? {};
    const tvAssign = planeacion.transversalAssignments ?? {};
    for (const col of orderedCols) {
      if (col.type === 'guia') {
        result.push({ weekIdx: col.g.vIdx, span: 1 });
        continue;
      }
      const w = col.idx;
      if (consumed.has(w)) continue;
      const labels   = planeacion.transversalCells[`${rowKey}::${w}`] ?? [];
      const assigned = isTecnica
        ? activities.filter(a => planeacion.tecnicaAssignments[a.id] === w)
        : activities.filter(a => tvAssign[a.id]?.rowKey === rowKey && tvAssign[a.id]?.weekIdx === w);
      const hasSpan2 = w + 1 < effectiveTotalWeeks && (
        labels.some(lbl => (durations[`lbl::${rowKey}::${lbl}`] ?? 1) === 2) ||
        assigned.some(a  => (durations[`act::${a.id}`]          ?? 1) === 2)
      );
      const span: 1 | 2 = hasSpan2 ? 2 : 1;
      result.push({ weekIdx: w, span });
      if (span === 2) consumed.add(w + 1);
    }
    return result;
  }, [planeacion, activities, effectiveTotalWeeks, orderedCols]);

  // ── Derived geometry (based on effective segments) ───────────────────────
  const weeks = useMemo(
    () => Array.from({ length: effectiveTotalWeeks }, (_, i) => i),
    [effectiveTotalWeeks],
  );
  const phaseSpans = useMemo(() => {
    const guias = planeacion.guiaColumns ?? [];
    let idx = 0;
    return effectiveSegments.map(seg => {
      const guiaCount = guias.filter(g => g.phase === seg.phase).length;
      const colSpan = seg.count + guiaCount;
      const span = { ...seg, start: idx, colSpan };
      idx += colSpan;
      return span;
    });
  }, [effectiveSegments, planeacion.guiaColumns]);

  // Week label within its phase: S1, S2, …
  const weekLabel = useCallback((w: number): string => {
    let offset = w;
    for (const seg of effectiveSegments) {
      if (offset < seg.count) return `S${offset + 1}`;
      offset -= seg.count;
    }
    return `W${w + 1}`;
  }, [effectiveSegments]);

  const phaseForActivity = (a: GradeActivity) =>
    PHASE_SEGMENTS.find(s => s.phase === a.phase) ?? PHASE_SEGMENTS[1];

  // ── Excel Export ─────────────────────────────────────────────────────────────
  const exportToExcel = useCallback(async () => {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AsistenciaPro';
    const ws = wb.addWorksheet('Planeación Semanal', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 },
    });

    // hex → ExcelJS ARGB (opaque)
    const toARGB = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();

    // Lighten hex by mixing with white (amount 0–1, higher = lighter)
    const lighten = (hex: string, amount = 0.75) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return 'FF' +
        Math.round(r + (255 - r) * amount).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(g + (255 - g) * amount).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(b + (255 - b) * amount).toString(16).padStart(2, '0').toUpperCase();
    };

    // WCAG relative luminance → pick white or dark text for guaranteed contrast
    const contrastARGB = (hex: string): string => {
      const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      const r = toLinear(parseInt(hex.slice(1, 3), 16) / 255);
      const g = toLinear(parseInt(hex.slice(3, 5), 16) / 255);
      const b = toLinear(parseInt(hex.slice(5, 7), 16) / 255);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return lum > 0.23 ? 'FF1F2937' : 'FFFFFFFF'; // dark text on light bg, white on dark
    };

    const WEEK_OFFSET = 2; // col 1 = label, cols 2..N = weeks
    const durations = planeacion.cardDurations ?? {};
    const hidden = new Set(planeacion.hiddenCards ?? []);

    // Replicate planRow span logic to know which weeks are merged
    const buildSpans = (rowKey: string, isTecnica: boolean) => {
      const consumedW = new Set<number>();
      const cells: Array<{ weekIdx: number; span: 1 | 2 }> = [];
      for (const w of weeks) {
        if (consumedW.has(w)) continue;
        const labels = planeacion.transversalCells[`${rowKey}::${w}`] ?? [];
        const assigned = isTecnica
          ? activities.filter(a => planeacion.tecnicaAssignments[a.id] === w)
          : activities.filter(a => (planeacion.transversalAssignments ?? {})[a.id]?.rowKey === rowKey && (planeacion.transversalAssignments ?? {})[a.id]?.weekIdx === w);
        const hasSpan2 =
          labels.some(lbl => (durations[`lbl::${rowKey}::${lbl}`] ?? 1) === 2) ||
          assigned.some(a => (durations[`act::${a.id}`] ?? 1) === 2);
        const span: 1 | 2 = hasSpan2 ? 2 : 1;
        cells.push({ weekIdx: w, span });
        if (span === 2) consumedW.add(w + 1);
      }
      return cells;
    };

    // Parse "DD/MM/YYYY" string → UTC Date for Excel
    const parseDdMmYyyy = (full: string): Date => {
      const [dd, mm, yyyy] = full.split('/').map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    };
    // Column number (1-based) → Excel column letter (A, B, … AA, AB, …)
    const colLetter = (n: number): string => {
      let s = '';
      while (n > 0) { s = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + s; n = Math.floor((n - 1) / 26); }
      return s;
    };

    // ── ROW 1: Phase headers ──────────────────────────────────────────────────
    const r1 = ws.addRow([null]);
    r1.height = 22;
    r1.getCell(1).value = 'Fase / Semana';
    r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    r1.getCell(1).font = { bold: true, size: 9, color: { argb: 'FF374151' } };
    r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    let colCursor = WEEK_OFFSET;
    for (const span of phaseSpans) {
      const startCol = colCursor;
      const endCol = colCursor + span.count - 1;
      if (span.count > 1) ws.mergeCells(1, startCol, 1, endCol);
      const cell = r1.getCell(startCol);
      cell.value = span.phase.replace('Fase Inducción', 'Inducción').replace('Fase ', '') + ` (${span.count}s)`;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(span.color) } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      colCursor += span.count;
    }

    // ── ROW 2: Week labels ────────────────────────────────────────────────────
    const r2 = ws.addRow(['Semana']);
    r2.height = 18;
    r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    r2.getCell(1).font = { bold: true, size: 8, color: { argb: 'FF374151' } };
    r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    weeks.forEach(w => {
      const cell = r2.getCell(w + WEEK_OFFSET);
      const seg = effectiveWeekPhaseMap[w];
      cell.value = weekLabel(w);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lighten(seg?.color ?? '#E5E7EB', 0.78) } };
      cell.font = { bold: true, size: 7, color: { argb: 'FF374151' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // ── ROW 3: Start dates ────────────────────────────────────────────────────
    const r3dates = ws.addRow(['Fecha inicio']);
    r3dates.height = 18;
    r3dates.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    r3dates.getCell(1).font = { bold: true, size: 8, color: { argb: 'FF374151' } };
    r3dates.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    const overrides = planeacion.weekDateOverrides ?? {};
    weeks.forEach((w, i) => {
      const col = w + WEEK_OFFSET;
      const cell = r3dates.getCell(col);
      const seg = effectiveWeekPhaseMap[w];
      // First week or explicit override → fixed date; otherwise formula =PREV_START+7
      if (i === 0 || overrides[w]) {
        cell.value = parseDdMmYyyy(weekDates.starts[w]);
      } else {
        cell.value = { formula: `=${colLetter(col - 1)}3+7` };
      }
      cell.numFmt = 'DD/MM/YYYY';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lighten(seg?.color ?? '#E5E7EB', 0.78) } };
      cell.font = { size: 7, color: { argb: 'FF374151' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // ── ROW 4: End dates (start + 6) ─────────────────────────────────────────
    const r4dates = ws.addRow(['Fecha fin']);
    r4dates.height = 18;
    r4dates.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    r4dates.getCell(1).font = { bold: true, size: 8, color: { argb: 'FF374151' } };
    r4dates.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    weeks.forEach(w => {
      const col = w + WEEK_OFFSET;
      const cell = r4dates.getCell(col);
      const seg = effectiveWeekPhaseMap[w];
      cell.value = { formula: `=${colLetter(col)}3+6` };
      cell.numFmt = 'DD/MM/YYYY';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lighten(seg?.color ?? '#E5E7EB', 0.85) } };
      cell.font = { size: 7, color: { argb: 'FF374151' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // ── ROW 5: Técnica ────────────────────────────────────────────────────────
    const r3 = ws.addRow([null]);
    r3.height = 40;
    r3.getCell(1).value = 'Técnica';
    r3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(TECNICA_COLOR) } };
    r3.getCell(1).font = { bold: true, size: 9, color: { argb: contrastARGB(TECNICA_COLOR) } };
    r3.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    for (const { weekIdx: w, span } of buildSpans('Técnica', true)) {
      const startCol = w + WEEK_OFFSET;
      if (span === 2 && w + 1 < effectiveTotalWeeks) ws.mergeCells(5, startCol, 5, startCol + 1);
      const assigned = activities.filter(a => planeacion.tecnicaAssignments[a.id] === w);
      const textLabels = (planeacion.transversalCells[`Técnica::${w}`] ?? []).filter(lbl => !hidden.has(`lbl::Técnica::${lbl}`));
      const allContent = [
        ...assigned.map(a => stripEvidenciaPrefix(a.detail?.trim() || a.name)),
        ...textLabels,
      ];
      const cell = r3.getCell(startCol);
      if (allContent.length > 0) {
        cell.value = allContent.join('\n');
        const { color } = assigned.length > 0 ? getActivityAreaStyle(assigned[0].name) : { color: TECNICA_COLOR };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(color) } };
        cell.font = { bold: true, color: { argb: contrastARGB(color) }, size: 8 };
      }
      // Empty cells: no fill — leave white
      cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };
    }

    // ── ROWS 4+: Transversal rows ─────────────────────────────────────────────
    for (const row of TRANSVERSAL_ROWS) {
      const exRow = ws.addRow([null]);
      exRow.height = 28;
      const rowNum = exRow.number;
      // Label cell: full color with proper contrast text
      exRow.getCell(1).value = row.label;
      exRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(row.color) } };
      exRow.getCell(1).font = { bold: true, color: { argb: contrastARGB(row.color) }, size: 9 };
      exRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      for (const { weekIdx: w, span } of buildSpans(row.key, false)) {
        const startCol = w + WEEK_OFFSET;
        if (span === 2 && w + 1 < effectiveTotalWeeks) ws.mergeCells(rowNum, startCol, rowNum, startCol + 1);
        const assignedToRow = activities.filter(a => (planeacion.transversalAssignments ?? {})[a.id]?.rowKey === row.key && (planeacion.transversalAssignments ?? {})[a.id]?.weekIdx === w && !hidden.has(`act::${a.id}`));
        const labels = (planeacion.transversalCells[`${row.key}::${w}`] ?? []).filter(lbl => !hidden.has(`lbl::${row.key}::${lbl}`));
        const allContent = [
          ...assignedToRow.map(a => stripEvidenciaPrefix(a.detail?.trim() || a.name)),
          ...labels,
        ];
        const cell = exRow.getCell(startCol);
        if (allContent.length > 0) {
          cell.value = allContent.join('\n');
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toARGB(row.color) } };
          cell.font = { size: 8, color: { argb: contrastARGB(row.color) } };
        }
        // Empty cells: no fill — leave white
        cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      }
    }

    // ── Column widths ─────────────────────────────────────────────────────────
    ws.getColumn(1).width = 24;
    weeks.forEach((_, idx) => { ws.getColumn(idx + WEEK_OFFSET).width = 10; });

    // ── Borders ───────────────────────────────────────────────────────────────
    ws.eachRow(row => {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right:  { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
      });
    });

    // ── Freeze phase row + week row + label column ────────────────────────────
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];

    // ── Download ──────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `planeacion_semanal_${ficha.code}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [ficha, weeks, phaseSpans, effectiveWeekPhaseMap, effectiveTotalWeeks, activities, planeacion, weekLabel, weekDates]);

  // ── Guía column management ────────────────────────────────────────────────
  const addGuiaColumn = (name: string, posStr: string) => {
    const sep = posStr.indexOf('::');
    const insertAfterWeekIdx = Number(posStr.slice(0, sep));
    const phase = posStr.slice(sep + 2);
    const vIdx = planeacion.guiaVIdxCounter ?? 2000;
    const newGuia: GuiaColumn = { id: `guia_${Date.now()}`, name, vIdx, insertAfterWeekIdx, phase };
    persist({
      ...planeacion,
      guiaColumns: [...(planeacion.guiaColumns ?? []), newGuia],
      guiaVIdxCounter: vIdx + 1,
    });
    setShowAddGuia(false);
    setAddGuiaName('Guía 1');
    setAddGuiaPos(`-1::${PHASE_SEGMENTS[0].phase}`);
  };

  const deleteGuiaColumn = (guiaId: string) => {
    const guia = (planeacion.guiaColumns ?? []).find(g => g.id === guiaId);
    if (!guia) return;
    const vIdx = guia.vIdx;
    const tecnica = { ...planeacion.tecnicaAssignments };
    Object.keys(tecnica).forEach(k => { if (tecnica[k] === vIdx) delete tecnica[k]; });
    const tvAssign = { ...(planeacion.transversalAssignments ?? {}) };
    Object.keys(tvAssign).forEach(k => { if (tvAssign[k].weekIdx === vIdx) delete tvAssign[k]; });
    const cells = { ...planeacion.transversalCells };
    Object.keys(cells).forEach(k => { if (k.endsWith(`::${vIdx}`)) delete cells[k]; });
    persist({
      ...planeacion,
      guiaColumns: (planeacion.guiaColumns ?? []).filter(g => g.id !== guiaId),
      tecnicaAssignments: tecnica,
      transversalAssignments: tvAssign,
      transversalCells: cells,
    });
  };

  if (!ficha) return <div className="flex items-center justify-center h-64 text-gray-400">Cargando…</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <button onClick={() => navigate('/instructor/fichas')}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900 leading-tight">
            Planeación Semanal — Ficha {ficha.code}
          </h2>
          <p className="text-xs text-gray-500">
            {ficha.program} · {effectiveTotalWeeks} semanas · {activities.length} evidencia(s) técnica(s)
          </p>
        </div>
        <button
          onClick={() => { setAddGuiaName(`Guía ${(planeacion.guiaColumns ?? []).length + 1}`); setShowAddGuia(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors shadow-sm"
          title="Insertar columna Guía"
        >
          + Guía
        </button>
        <button
          onClick={openCopyModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-sm"
          title="Copiar esta planeación a otras fichas"
        >
          <Copy className="w-3.5 h-3.5" />
          Copiar a otras fichas
        </button>
        <button
          onClick={exportToExcel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors shadow-sm"
          title="Exportar planeación a Excel"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar Excel
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside
          className={`w-52 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto transition-colors ${dragOverCell === 'panel' ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''}`}
          onDragOver={e => { if (dragActivityId) { e.preventDefault(); setDragOverCell('panel'); } }}
          onDragLeave={onDragLeave}
          onDrop={onDropToPanel}
        >
          <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Sin asignar</p>
            <p className="text-[10px] text-gray-400">{unassigned.length} evidencia(s)</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {Array.from(unassignedByPhase.entries()).map(([phase, acts]) => {
              if (acts.length === 0) return null;
              const seg = PHASE_SEGMENTS.find(s => s.phase === phase);
              if (!seg) return null;
              return (
                <div key={phase}>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1 px-1 flex items-center justify-between" style={{ color: seg.color }}>
                    <span>{phase.replace('Fase ', '')}</span>
                    <span className="font-normal opacity-70">({acts.length})</span>
                  </p>
                  <div className="space-y-1">
                    {acts.map(a => (
                      <SidebarCard key={a.id} activity={a}
                        onDragStart={() => onDragStartActivity(a.id)} isDragging={dragActivityId === a.id}
                        onDelete={() => {
                          if (!window.confirm(`¿Eliminar "${a.detail?.trim() || a.name}" de la base de datos?`)) return;
                          deleteGradeActivity(a.id);
                        }} />
                    ))}
                  </div>
                </div>
              );
            })}
            {unassigned.length === 0 && activities.length > 0 && (
              <p className="text-xs text-gray-400 text-center pt-4">Todas asignadas</p>
            )}
            {activities.length === 0 && (
              <p className="text-xs text-gray-400 text-center pt-4 leading-relaxed">
                Crea evidencias en <strong>Calificaciones</strong> para esta ficha y aparecerán aquí.
              </p>
            )}
          </div>
        </aside>

        {/* ── Grid ── */}
        <div className="flex-1 overflow-auto" onClick={() => { setOpenDurationCard(null); if (dateInputRef.current !== document.activeElement) setDatePickerWeek(null); }}>
          <table className="border-collapse text-xs select-none"
            style={{ minWidth: CELL_W * orderedCols.length + LABEL_W }}>
            <colgroup>
              <col style={{ width: LABEL_W, minWidth: LABEL_W }} />
              {orderedCols.map(col => <col key={col.type === 'week' ? col.idx : col.g.id} style={{ width: CELL_W, minWidth: CELL_W }} />)}
            </colgroup>

            <thead>
              {/* ── Phase row ── */}
              <tr>
                <th className="sticky left-0 z-30 bg-gray-100 border-b border-r border-gray-300 text-left px-2 text-[10px] font-bold uppercase text-gray-500 tracking-wide"
                  style={{ height: PHASE_H }}>
                  Fase / Semana
                </th>
                {phaseSpans.map(span => {
                  const isEditingThis = editingPhase === span.phase;
                  const defaultCount  = PHASE_SEGMENTS.find(s => s.phase === span.phase)?.count ?? span.count;
                  const hasOverride   = (planeacion.phaseWeekCounts ?? {})[span.phase] !== undefined;
                  return (
                    <th key={span.phase} colSpan={span.colSpan}
                      className="border-b border-r border-gray-400 text-center font-bold text-[11px] tracking-wide relative cursor-pointer select-none"
                      style={{ backgroundColor: span.color, color: span.text, height: PHASE_H }}
                      onClick={e => { e.stopPropagation(); setEditingPhase(isEditingThis ? null : span.phase); }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {span.phase.replace('Fase ', '').replace('Fase Inducción', 'Inducción')}
                        <span className="opacity-80">({span.count}s)</span>
                        <span className="text-[10px] opacity-60">✏</span>
                      </span>

                      {/* Phase week count popover */}
                      {isEditingThis && (
                        <div
                          ref={phasePopoverRef}
                          className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-3 flex flex-col gap-2 min-w-[210px]"
                          style={{ color: '#374151' }}
                          onClick={e => e.stopPropagation()}
                        >
                          <p className="text-[11px] font-bold text-center" style={{ color: span.color }}>
                            {span.phase}
                          </p>
                          <div className="flex items-center gap-2 justify-center">
                            <button
                              className="w-7 h-7 rounded-full border flex items-center justify-center text-base font-bold hover:bg-gray-100 transition-colors"
                              style={{ borderColor: span.color, color: span.color }}
                              onClick={() => setPhaseWeekCount(span.phase, span.count - 1)}
                            >−</button>
                            <input
                              type="number" min={1} max={200}
                              value={span.count}
                              onChange={e => setPhaseWeekCount(span.phase, parseInt(e.target.value) || 1)}
                              className="w-14 text-center text-sm font-bold border rounded px-1 py-0.5 outline-none"
                              style={{ borderColor: span.color, color: span.color }}
                              onClick={e => e.stopPropagation()}
                            />
                            <button
                              className="w-7 h-7 rounded-full border flex items-center justify-center text-base font-bold hover:bg-gray-100 transition-colors"
                              style={{ borderColor: span.color, color: span.color }}
                              onClick={() => setPhaseWeekCount(span.phase, span.count + 1)}
                            >+</button>
                          </div>
                          <p className="text-[10px] text-gray-400 text-center">semanas en esta fase</p>
                          {hasOverride && (
                            <button
                              className="text-[10px] text-red-500 hover:text-red-700 underline text-center"
                              onClick={() => { clearPhaseWeekCount(span.phase); setEditingPhase(null); }}
                            >
                              Restablecer ({defaultCount}s por defecto)
                            </button>
                          )}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>

              {/* ── Week number + date row ── */}
              <tr>
                <th className="sticky left-0 z-30 bg-gray-50 border-b border-r border-gray-300 px-2 text-[9px] font-semibold text-gray-400 uppercase"
                  style={{ height: DATE_H + 18 }}>
                  Fecha semanal
                </th>
                {orderedCols.map(col => {
                  if (col.type === 'guia') {
                    const { g } = col;
                    const phaseColor = PHASE_SEGMENTS.find(p => p.phase === g.phase)?.color ?? '#6b7280';
                    return (
                      <th key={g.id} className="border-b border-r border-gray-200 text-center px-1 relative group"
                        style={{ backgroundColor: phaseColor + '14' }}>
                        <div className="flex flex-col items-center leading-none gap-1 py-1">
                          <span className="font-bold text-[11px]" style={{ color: phaseColor }}>{g.name.toUpperCase()}</span>
                          <span className="text-[9px] text-gray-400">—</span>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); if (window.confirm(`¿Eliminar columna "${g.name}"? Se perderán las asignaciones en esta columna.`)) deleteGuiaColumn(g.id); }}
                          className="absolute top-0.5 right-0.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-500 hover:bg-red-200 text-[10px] leading-none"
                          title={`Eliminar ${g.name}`}
                        >×</button>
                      </th>
                    );
                  }
                  const w = col.idx;
                  const seg      = effectiveWeekPhaseMap[w];
                  const hasOverride = !!(planeacion.weekDateOverrides ?? {})[w];
                  const isOpen   = datePickerWeek === w;
                  return (
                    <th key={w} className="border-b border-r border-gray-200 text-center px-1 relative"
                      style={{ backgroundColor: seg.color + '14' }}>
                      <div className="flex flex-col items-center leading-none gap-1 py-1">
                        <span className="font-bold text-[11px]" style={{ color: seg.color }}>{weekLabel(w)}</span>
                        {/* Clickable date — opens datepicker */}
                        <button
                          className="text-[10px] font-normal whitespace-nowrap rounded px-0.5 transition-colors hover:bg-black/10"
                          style={{ color: hasOverride ? seg.color : '#6b7280', fontWeight: hasOverride ? 700 : 400 }}
                          title="Cambiar fecha de inicio"
                          onClick={e => { e.stopPropagation(); setDatePickerWeek(isOpen ? null : w); }}
                        >
                          {weekDates.starts[w]} — {weekDates.ends[w]}
                        </button>
                      </div>
                      {/* Datepicker popover */}
                      {isOpen && (
                        <div
                          ref={datePopoverRef}
                          className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-3 flex flex-col gap-2 min-w-[200px]"
                          onClick={e => e.stopPropagation()}
                        >
                          <p className="text-[10px] font-bold text-gray-600 text-center">Inicio semana {weekLabel(w)}</p>
                          <input
                            ref={dateInputRef}
                            type="date"
                            className="text-xs border border-gray-300 rounded px-2 py-1 w-full outline-none focus:border-blue-400"
                            defaultValue={weekDates.isos[w]}
                            onChange={e => e.target.value && setWeekDateOverride(w, e.target.value)}
                          />
                          {hasOverride && (
                            <button
                              className="text-[10px] text-red-500 hover:text-red-700 underline text-center"
                              onClick={() => clearWeekDateOverride(w)}
                            >
                              Restablecer fecha automática
                            </button>
                          )}
                          <button
                            className="text-[10px] text-gray-400 hover:text-gray-600 text-center"
                            onClick={() => setDatePickerWeek(null)}
                          >
                            Cerrar
                          </button>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* ── Técnica row ── */}
              <tr onMouseEnter={() => setHoveredRow('Técnica')} onMouseLeave={() => setHoveredRow(null)}>
                <td className="sticky left-0 z-20 border-b border-r border-gray-200 font-bold px-2 text-[11px] align-middle transition-colors"
                  style={{ color: '#7A6C00', minHeight: 60, backgroundColor: hoveredRow === 'Técnica' ? TECNICA_COLOR + '28' : 'white' }}>
                  Técnica
                </td>
                {planRow('Técnica', true).map(({ weekIdx: w, span }) => {
                  const ck     = cellKey('Técnica', w);
                  const isOver = dragOverCell === ck;
                  const assigned   = activities.filter(a => planeacion.tecnicaAssignments[a.id] === w);
                  const textLabels = getLabels('Técnica', w);
                  return (
                    <td key={w} colSpan={span}
                      className="border-b border-r border-gray-200 align-top p-1 cursor-pointer transition-colors"
                      style={{
                        minHeight: 60,
                        backgroundColor: isOver ? TECNICA_COLOR + '44' : hoveredRow === 'Técnica' ? TECNICA_COLOR + '20' : 'white',
                        outline: isOver ? `2px dashed ${TECNICA_COLOR}` : undefined,
                        outlineOffset: -2,
                      }}
                      onDragOver={e => onDragOverCell(e, 'Técnica', w)}
                      onDragLeave={onDragLeave}
                      onDrop={e => onDropToCell(e, 'Técnica', w)}
                      onClick={() => { if (!editingCell) startEditCell('Técnica', w); }}
                    >
                      <div className="flex flex-col gap-1">
                        {assigned.map(a => {
                          const aSeg = phaseForActivity(a);
                          const key = actKey(a.id);
                          return <GridCard key={a.id} activity={a} color={getActivityAreaStyle(a.name).color}
                            textColor={getActivityAreaStyle(a.name).text}
                            cardKey={key}
                            duration={getDuration(key)}
                            hidden={isHidden(key)}
                            durationOpen={openDurationCard === key}
                            weekIdx={w}
                            weekStarts={weekDates.starts}
                            weekEnds={weekDates.ends}
                            onDragStart={() => { setOpenDurationCard(null); onDragStartActivity(a.id); }}
                            isDragging={dragActivityId === a.id}
                            onRemove={() => unassignActivity(a.id)}
                            onToggleHidden={() => toggleHidden(key)}
                            onSetDuration={d => setCardDuration(key, d)}
                            onToggleDurationPicker={() => setOpenDurationCard(openDurationCard === key ? null : key)}
                          />;
                        })}
                        {textLabels.map((lbl, idx) => {
                          const key = lblKey('Técnica', lbl);
                          return <TransLabel key={idx} label={lbl} color={TECNICA_COLOR} textColor="#7A6C00"
                            cardKey={key}
                            duration={getDuration(key)}
                            hidden={isHidden(key)}
                            durationOpen={openDurationCard === key}
                            isDragging={dragLabel?.rowKey === 'Técnica' && dragLabel.weekIdx === w && dragLabel.labelIdx === idx}
                            weekIdx={w}
                            weekStarts={weekDates.starts}
                            weekEnds={weekDates.ends}
                            onDragStart={() => { setOpenDurationCard(null); onDragStartLabel('Técnica', w, idx, lbl); }}
                            onRemove={e => { e.stopPropagation(); removeLabel('Técnica', w, idx); }}
                            onToggleHidden={() => toggleHidden(key)}
                            onSetDuration={d => setCardDuration(key, d)}
                            onToggleDurationPicker={() => setOpenDurationCard(openDurationCard === key ? null : key)}
                          />;
                        })}
                        {editingCell === ck && (
                          <input ref={editInputRef}
                            className="w-full text-[10px] rounded border px-1 py-0.5 outline-none"
                            style={{ borderColor: TECNICA_COLOR }}
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditingCell(null); setEditingValue(''); } }}
                            onBlur={commitEdit}
                            onClick={e => e.stopPropagation()} />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* ── Transversal rows ── */}
              {TRANSVERSAL_ROWS.map(row => (
                <tr key={row.key} onMouseEnter={() => setHoveredRow(row.key)} onMouseLeave={() => setHoveredRow(null)}>
                  <td className="sticky left-0 z-20 border-b border-r border-gray-200 font-semibold px-2 text-[11px] align-middle transition-colors"
                    style={{ minHeight: 60, color: row.textColor, backgroundColor: hoveredRow === row.key ? row.color + '28' : 'white' }}>
                    {row.label}
                  </td>
                  {planRow(row.key, false).map(({ weekIdx: w, span }) => {
                    const ck     = cellKey(row.key, w);
                    const labels = getLabels(row.key, w);
                    const isOver = dragOverCell === ck;
                    const isEdit = editingCell === ck;
                    return (
                      <td key={w} colSpan={span}
                        className="border-b border-r border-gray-200 align-top p-1 cursor-pointer transition-colors"
                        style={{
                          minHeight: 60,
                          backgroundColor: isOver ? row.color + '44' : hoveredRow === row.key ? row.color + '20' : 'white',
                          outline: isOver ? `2px dashed ${row.color}` : undefined,
                          outlineOffset: -2,
                        }}
                        onDragOver={e => onDragOverCell(e, row.key, w)}
                        onDragLeave={onDragLeave}
                        onDrop={e => onDropToCell(e, row.key, w)}
                        onClick={() => { if (!isEdit) startEditCell(row.key, w); }}
                      >
                        <div className="flex flex-col gap-1">
                          {/* Activities assigned to this transversal row */}
                          {activities.filter(a => (planeacion.transversalAssignments ?? {})[a.id]?.rowKey === row.key && (planeacion.transversalAssignments ?? {})[a.id]?.weekIdx === w).map(a => {
                            const key = actKey(a.id);
                            return <GridCard key={a.id} activity={a} color={getActivityAreaStyle(a.name).color}
                              textColor={getActivityAreaStyle(a.name).text}
                              cardKey={key}
                              duration={getDuration(key)}
                              hidden={isHidden(key)}
                              durationOpen={openDurationCard === key}
                              weekIdx={w}
                              weekStarts={weekDates.starts}
                              weekEnds={weekDates.ends}
                              onDragStart={() => { setOpenDurationCard(null); onDragStartActivity(a.id); }}
                              isDragging={dragActivityId === a.id}
                              onRemove={() => unassignActivity(a.id)}
                              onToggleHidden={() => toggleHidden(key)}
                              onSetDuration={d => setCardDuration(key, d)}
                              onToggleDurationPicker={() => setOpenDurationCard(openDurationCard === key ? null : key)}
                            />;
                          })}
                          {labels.map((lbl, idx) => {
                            const key = lblKey(row.key, lbl);
                            return <TransLabel key={idx} label={lbl} color={row.color} textColor={row.textColor}
                              cardKey={key}
                              duration={getDuration(key)}
                              hidden={isHidden(key)}
                              durationOpen={openDurationCard === key}
                              isDragging={dragLabel?.rowKey === row.key && dragLabel.weekIdx === w && dragLabel.labelIdx === idx}
                              weekIdx={w}
                              weekStarts={weekDates.starts}
                              weekEnds={weekDates.ends}
                              onDragStart={() => { setOpenDurationCard(null); onDragStartLabel(row.key, w, idx, lbl); }}
                              onRemove={e => { e.stopPropagation(); removeLabel(row.key, w, idx); }}
                              onToggleHidden={() => toggleHidden(key)}
                              onSetDuration={d => setCardDuration(key, d)}
                              onToggleDurationPicker={() => setOpenDurationCard(openDurationCard === key ? null : key)}
                            />;
                          })}
                          {isEdit && (
                            <input ref={editInputRef}
                              className="w-full text-[10px] rounded border px-1 py-0.5 outline-none"
                              style={{ borderColor: row.color }}
                              value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditingCell(null); setEditingValue(''); } }}
                              onBlur={commitEdit}
                              onClick={e => e.stopPropagation()} />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal: Nueva columna Guía ── */}
      {showAddGuia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAddGuia(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900">Nueva columna Guía</h3>
              <button onClick={() => setShowAddGuia(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Nombre</label>
                <input
                  type="text"
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-amber-500"
                  value={addGuiaName}
                  onChange={e => setAddGuiaName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Posición y fase</label>
                <select
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-amber-500 bg-white"
                  value={addGuiaPos}
                  onChange={e => setAddGuiaPos(e.target.value)}
                >
                  {effectiveSegments.map((seg, segIdx) => {
                    const startW = effectiveSegments.slice(0, segIdx).reduce((s, p) => s + p.count, 0);
                    const beforeIdx = startW === 0 ? -1 : startW - 1;
                    const phaseLabel = seg.phase.replace('Fase Inducción', 'Inducción').replace('Fase ', '');
                    return (
                      <optgroup key={seg.phase} label={`── ${phaseLabel} ──`}>
                        <option value={`${beforeIdx}::${seg.phase}`}>
                          Al inicio de {phaseLabel} (antes de {weekLabel(startW)})
                        </option>
                        {Array.from({ length: seg.count }, (_, i) => startW + i).map((w, i) => (
                          <option key={w} value={`${w}::${seg.phase}`}>
                            Después de {weekLabel(w)}{i === seg.count - 1 ? ' — al final de la fase' : ''}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                {/* Phase color preview */}
                {(() => {
                  const ph = addGuiaPos.slice(addGuiaPos.indexOf('::') + 2);
                  const seg = PHASE_SEGMENTS.find(s => s.phase === ph);
                  return seg ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="text-[11px] text-gray-500">Color de fase: <strong style={{ color: seg.color }}>{ph.replace('Fase Inducción', 'Inducción').replace('Fase ', '')}</strong></span>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowAddGuia(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-200"
              >Cancelar</button>
              <button
                onClick={() => addGuiaName.trim() && addGuiaColumn(addGuiaName.trim(), addGuiaPos)}
                disabled={!addGuiaName.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium disabled:opacity-40"
              >Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Copiar planeación a otras fichas ── */}
      {copyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { if (copyStatus !== 'saving') setCopyModalOpen(false); }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Copy className="w-4 h-4 text-blue-600" />
                  Copiar planeación
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Desde ficha <strong>{ficha.code}</strong> hacia las fichas seleccionadas.
                </p>
              </div>
              <button
                onClick={() => setCopyModalOpen(false)}
                disabled={copyStatus === 'saving'}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-40"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {copyStatus === 'done' ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm font-semibold text-gray-900">
                  Planeación copiada a {copyTargetIds.size} ficha{copyTargetIds.size === 1 ? '' : 's'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Las asignaciones quedaron en las mismas fechas y semanas.
                </p>
                <button
                  onClick={() => setCopyModalOpen(false)}
                  className="mt-5 px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-xs font-medium"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                {/* Warning */}
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    <strong>Sobrescribe</strong> la planeación existente de cada ficha destino
                    con todas las evidencias, etiquetas transversales, fechas y duraciones
                    de la ficha actual.
                  </p>
                </div>

                {/* Fichas list */}
                <div className="flex-1 overflow-y-auto px-5 py-3">
                  {copyAllFichas.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">
                      No hay otras fichas disponibles para copiar.
                    </p>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer border-b border-gray-100 mb-2 pb-2">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300"
                          checked={copyTargetIds.size === copyAllFichas.length && copyAllFichas.length > 0}
                          onChange={toggleCopyAll}
                        />
                        <span className="text-xs font-semibold text-gray-700">
                          Seleccionar todas ({copyAllFichas.length})
                        </span>
                      </label>
                      <div className="space-y-0.5">
                        {copyAllFichas.map(f => (
                          <label
                            key={f.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-gray-300"
                              checked={copyTargetIds.has(f.id)}
                              onChange={() => toggleCopyTarget(f.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">
                                Ficha {f.code}
                              </p>
                              <p className="text-[10px] text-gray-500 truncate">{f.program}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
                  <span className="text-[11px] text-gray-500">
                    {copyTargetIds.size} seleccionada{copyTargetIds.size === 1 ? '' : 's'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCopyModalOpen(false)}
                      disabled={copyStatus === 'saving'}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCopyPlaneacion}
                      disabled={copyTargetIds.size === 0 || copyStatus === 'saving'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {copyStatus === 'saving' ? (
                        <>Copiando…</>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copiar a {copyTargetIds.size || 0} ficha{copyTargetIds.size === 1 ? '' : 's'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────
interface SidebarCardProps { activity: GradeActivity; onDragStart: () => void; isDragging: boolean; onDelete: () => void; }
const SidebarCard: React.FC<SidebarCardProps> = ({ activity, onDragStart, isDragging, onDelete }) => {
  const { color, text: tc } = getActivityAreaStyle(activity.name);
  const displayName = stripEvidenciaPrefix(activity.detail?.trim() || activity.name);
  const displayCode = activity.detail?.trim() ? activity.name : null;
  return (
    <div draggable onDragStart={e => { e.dataTransfer.setData('text/plain', ''); onDragStart(); }}
      className="group flex flex-col gap-0.5 rounded px-1.5 py-1.5 cursor-grab active:cursor-grabbing border transition-opacity relative"
      style={{ backgroundColor: color + '33', borderColor: color + '99', opacity: isDragging ? 0.4 : 1 }}
      title={`${displayName}\n${displayCode ?? ''}`}>
      <div className="flex items-start gap-1">
        <GripVertical className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-50" style={{ color: tc }} />
        <span className="text-[10px] font-medium leading-tight line-clamp-3 pr-4" style={{ color: tc }}>{displayName}</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          onMouseDown={e => e.stopPropagation()}
          className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-4 h-4 rounded bg-red-500 hover:bg-red-600 text-white flex-shrink-0"
          title="Eliminar evidencia"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
      {displayCode && (
        <span className="text-[9px] font-mono leading-none truncate pl-4" style={{ color: tc, opacity: 0.6 }}>{displayCode}</span>
      )}
    </div>
  );
};

interface GridCardProps {
  activity: GradeActivity;
  color: string;
  textColor?: string;
  cardKey: string;
  duration: 1 | 2;
  hidden: boolean;
  durationOpen: boolean;
  weekIdx: number;
  weekStarts: string[];
  weekEnds: string[];
  onDragStart: () => void;
  isDragging: boolean;
  onRemove: () => void;
  onToggleHidden: () => void;
  onSetDuration: (d: 1 | 2) => void;
  onToggleDurationPicker: () => void;
}
const GridCard: React.FC<GridCardProps> = ({
  activity, color, textColor, duration, hidden, durationOpen,
  weekIdx, weekStarts, weekEnds,
  onDragStart, isDragging, onRemove, onToggleHidden, onSetDuration, onToggleDurationPicker,
}) => {
  const tc = textColor ?? color;
  const displayName = stripEvidenciaPrefix(activity.detail?.trim() || activity.name);
  const displayCode = activity.detail?.trim() ? activity.name : null;
  const startDate = weekStarts[weekIdx] ?? '';
  const endDate   = weekEnds[Math.min(weekIdx + duration - 1, weekEnds.length - 1)] ?? '';
  return (
  <div
    draggable
    onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', ''); onDragStart(); }}
    className="relative flex flex-col gap-0.5 rounded px-2 py-1.5 cursor-grab active:cursor-grabbing border group w-full transition-opacity"
    style={{ backgroundColor: color + '22', borderColor: tc + '99', opacity: hidden ? 0.3 : isDragging ? 0.35 : 1 }}
    title={`${displayName}${displayCode ? '\n' + displayCode : ''}`}
  >
    {/* Name + action buttons */}
    <div className="flex items-start gap-1" onClick={e => { e.stopPropagation(); onToggleDurationPicker(); }}>
      <GripVertical className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-40" style={{ color: tc }} />
      <span className="flex-1 text-[11px] font-medium leading-snug break-words" style={{ color: tc, wordBreak: 'break-word', whiteSpace: 'normal' }}>
        {displayName}
      </span>
      <button className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-0.5"
        style={{ color: tc }}
        onClick={e => { e.stopPropagation(); onToggleHidden(); }}
        title={hidden ? 'Mostrar' : 'Ocultar'}>
        {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      </button>
      <button className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        style={{ color: tc }}
        onClick={e => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
        title="Quitar de esta semana">
        <X className="w-3 h-3" />
      </button>
    </div>
    {/* Date + duration badge */}
    <div className="flex items-center justify-between gap-1 pl-4">
      {startDate && <span className="text-[9px] text-gray-400 leading-none">{startDate} — {endDate}</span>}
      {duration === 2 && (
        <span className="text-[9px] font-bold px-1 rounded flex-shrink-0 leading-none py-0.5" style={{ backgroundColor: color + '44', color: tc }}>2S</span>
      )}
    </div>
    {/* SENA code footer (only when detail holds the descriptive name) */}
    {displayCode && (
      <span className="text-[9px] font-mono text-gray-400 leading-none truncate pl-4">{displayCode}</span>
    )}
    {/* Duration picker */}
    {durationOpen && (
      <div className="flex gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
        {([1, 2] as const).map(d => (
          <button key={d}
            className="text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors"
            style={{ backgroundColor: duration === d ? tc : 'transparent', borderColor: tc, color: duration === d ? '#fff' : tc }}
            onClick={e => { e.stopPropagation(); onSetDuration(d); }}>
            {d}S
          </button>
        ))}
      </div>
    )}
  </div>
  );
};

interface TransLabelProps {
  label: string;
  color: string;
  textColor?: string;
  cardKey: string;
  duration: 1 | 2;
  hidden: boolean;
  durationOpen: boolean;
  isDragging?: boolean;
  weekIdx: number;
  weekStarts: string[];
  weekEnds: string[];
  onDragStart: () => void;
  onRemove: (e: React.MouseEvent) => void;
  onToggleHidden: () => void;
  onSetDuration: (d: 1 | 2) => void;
  onToggleDurationPicker: () => void;
}
const TransLabel: React.FC<TransLabelProps> = ({
  label, color, textColor, duration, hidden, durationOpen,
  isDragging, weekIdx, weekStarts, weekEnds,
  onDragStart, onRemove, onToggleHidden, onSetDuration, onToggleDurationPicker,
}) => {
  const tc = textColor ?? color;
  const startDate = weekStarts[weekIdx] ?? '';
  const endDate   = weekEnds[Math.min(weekIdx + duration - 1, weekEnds.length - 1)] ?? '';
  return (
  <div
    draggable
    onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', ''); onDragStart(); }}
    className="relative flex flex-col gap-0.5 rounded px-2 py-1.5 group cursor-grab active:cursor-grabbing w-full transition-opacity"
    style={{ backgroundColor: color + '28', border: `1px solid ${tc}99`, opacity: hidden ? 0.3 : isDragging ? 0.3 : 1 }}
    title={label}
  >
    {/* Label + action buttons */}
    <div className="flex items-start gap-1" onClick={e => { e.stopPropagation(); onToggleDurationPicker(); }}>
      <GripVertical className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-40" style={{ color: tc }} />
      <span className="flex-1 text-[11px] font-medium leading-snug break-words" style={{ color: tc, wordBreak: 'break-word', whiteSpace: 'normal' }}>
        {label}
      </span>
      <button className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        style={{ color: tc }}
        onClick={e => { e.stopPropagation(); onToggleHidden(); }}
        title={hidden ? 'Mostrar' : 'Ocultar'}>
        {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      </button>
      <button className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        style={{ color: tc }}
        onClick={e => { e.stopPropagation(); onRemove(e); }}
        title="Eliminar">
        <X className="w-3 h-3" />
      </button>
    </div>
    {/* Date range + duration badge */}
    <div className="flex items-center justify-between gap-1 pl-4">
      {startDate && (
        <span className="text-[9px] text-gray-400 leading-none">{startDate} — {endDate}</span>
      )}
      {duration === 2 && (
        <span className="text-[9px] font-bold px-1 rounded flex-shrink-0 leading-none py-0.5" style={{ backgroundColor: color + '44', color: tc }}>2S</span>
      )}
    </div>
    {/* Duration picker */}
    {durationOpen && (
      <div className="flex gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
        {([1, 2] as const).map(d => (
          <button key={d}
            className="text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors"
            style={{ backgroundColor: duration === d ? tc : 'transparent', borderColor: tc, color: duration === d ? '#fff' : tc }}
            onClick={e => { e.stopPropagation(); onSetDuration(d); }}>
            {d}S
          </button>
        ))}
      </div>
    )}
  </div>
  );
};

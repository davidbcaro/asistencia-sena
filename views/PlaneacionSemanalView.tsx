import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, GripVertical, X } from 'lucide-react';
import { GradeActivity, PlaneacionSemanalFichaData } from '../types';
import { getFichas, getGradeActivities, getPlaneacionSemanal, savePlaneacionSemanal } from '../services/db';

// ─── Phase structure (matches PLANEACION SEMANAL GRD.xlsx exactly) ──────────
// Inducción=2  Análisis=10  Planeación=24  Ejecución=40  Evaluación=30  → 106 total
const PHASE_SEGMENTS = [
  { phase: 'Fase Inducción',     count: 2,  color: '#f59e0b', text: '#ffffff' },
  { phase: 'Fase 1: Análisis',   count: 10, color: '#0d9488', text: '#ffffff' },
  { phase: 'Fase 2: Planeación', count: 24, color: '#3b82f6', text: '#ffffff' },
  { phase: 'Fase 3: Ejecución',  count: 40, color: '#8b5cf6', text: '#ffffff' },
  { phase: 'Fase 4: Evaluación', count: 30, color: '#ef4444', text: '#ffffff' },
] as const;

const TOTAL_WEEKS = PHASE_SEGMENTS.reduce((s, p) => s + p.count, 0); // 106

// Pre-build weekIndex → phase segment
const WEEK_PHASE_MAP: typeof PHASE_SEGMENTS[number][] = [];
for (const seg of PHASE_SEGMENTS) for (let i = 0; i < seg.count; i++) WEEK_PHASE_MAP.push(seg);

// Week dates: base 29/09/2025. Overrides shift subsequent weeks automatically.
const BASE_DATE = new Date('2025-09-29T00:00:00');

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/** Parse YYYY-MM-DD (from <input type="date">) into a local Date */
const parseIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Build effective start & end dates, honouring overrides.
 *  overrides: weekIndex → ISO date (YYYY-MM-DD) for that week's start.
 *  totalWeeks: how many weeks to generate (defaults to TOTAL_WEEKS). */
const buildWeekDates = (overrides: Record<number, string> = {}, totalWeeks = TOTAL_WEEKS): { starts: string[]; ends: string[]; isos: string[] } => {
  const starts: string[] = [];
  const ends:   string[] = [];
  const isos:   string[] = [];
  let cur = new Date(BASE_DATE);
  for (let w = 0; w < totalWeeks; w++) {
    if (overrides[w]) cur = parseIso(overrides[w]);
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    isos.push(iso);
    starts.push(fmt(cur));
    const end = new Date(cur); end.setDate(end.getDate() + 6);
    ends.push(fmt(end));
    cur = new Date(cur); cur.setDate(cur.getDate() + 7);
  }
  return { starts, ends, isos };
};

// ─── Transversal rows (colors match PLANEACION SEMANAL GRD legend) ──────────
const TECNICA_COLOR = '#ffff00'; // Yellow — Técnica row

const TRANSVERSAL_ROWS = [
  { key: 'TICs',              label: "TIC's",              color: '#4CAF50' }, // Green
  { key: 'Bilingüismo',       label: 'Bilingüismo',        color: '#F44336' }, // Red
  { key: 'Matemáticas',       label: 'Matemáticas',        color: '#F48FB1' }, // Pink
  { key: 'Comunicación',      label: 'Comunicación / Ética / Derechos', color: '#9C27B0' }, // Purple
  { key: 'Investigación',     label: 'Investigación',      color: '#FF9800' }, // Orange
  { key: 'Ambiente',          label: 'Ambiente',           color: '#2196F3' }, // Blue
  { key: 'Emprendimiento',    label: 'Emprendimiento',     color: '#009688' }, // Teal
  { key: 'EducaciónFísica',   label: 'Edu. Física',        color: '#9E9E9E' }, // Gray
  { key: 'CienciasNaturales', label: 'Ciencias Naturales', color: '#BDBDBD' }, // Light gray
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

/** Build the default seeded data for a ficha that has no planeación yet */
const buildDefaultData = (): PlaneacionSemanalFichaData => {
  const transversalCells: Record<string, string[]> = {};
  // Técnica labels stored under key 'Técnica::weekIndex'
  Object.entries(DEFAULT_TECNICA).forEach(([wk, label]) => {
    transversalCells[`Técnica::${wk}`] = [label];
  });
  // Transversal labels
  Object.entries(DEFAULT_TRANSVERSAL).forEach(([key, label]) => {
    transversalCells[key] = [label];
  });
  return { tecnicaAssignments: {}, transversalCells, cardDurations: {}, hiddenCards: [], weekDateOverrides: {}, phaseWeekCounts: {} };
};

const EMPTY_DATA: PlaneacionSemanalFichaData = { tecnicaAssignments: {}, transversalCells: {}, cardDurations: {}, hiddenCards: [], weekDateOverrides: {}, phaseWeekCounts: {} };

// ─── Card key helpers ────────────────────────────────────────────────────────
const actKey = (id: string)                   => `act::${id}`;
const lblKey = (rowKey: string, text: string) => `lbl::${rowKey}::${text}`;
const CELL_W  = 200; // px per week column (fixed)
const DATE_H  = 22;  // px for the date header sub-row
const PHASE_H = 28;  // px for phase header row
const LABEL_W = 150; // px for row label column

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

  const [editingCell,       setEditingCell]       = useState<string | null>(null);
  const [editingValue,      setEditingValue]      = useState('');
  const [openDurationCard,  setOpenDurationCard]  = useState<string | null>(null);
  const [datePickerWeek,    setDatePickerWeek]    = useState<number | null>(null);
  const [editingPhase,      setEditingPhase]      = useState<string | null>(null);
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
    // Incluir seeds globales (group === '') + actividades propias del ficha
    setActivities(f ? all.filter(a => a.group === f.code || a.group === '') : []);

    const allPlan = getPlaneacionSemanal();
    if (!allPlan[fichaId ?? '']) {
      // First visit: seed with defaults
      const def = buildDefaultData();
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

  // Close date picker on any click outside the popover
  useEffect(() => {
    if (datePickerWeek === null) return;
    const handler = (e: MouseEvent) => {
      if (datePopoverRef.current && datePopoverRef.current.contains(e.target as Node)) return;
      setDatePickerWeek(null);
    };
    const t = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', handler); };
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
    setPlaneacion(updated);
    const all = getPlaneacionSemanal();
    all[fichaId ?? ''] = updated;
    savePlaneacionSemanal(all);
  }, [fichaId]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const unassigned = useMemo(
    () => activities.filter(a => planeacion.tecnicaAssignments[a.id] === undefined),
    [activities, planeacion.tecnicaAssignments],
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
  const onDragStartActivity = (id: string) => { setDragActivityId(id); setDragLabel(null); };
  const onDragStartLabel    = (rowKey: string, weekIdx: number, labelIdx: number, text: string) => {
    setDragLabel({ rowKey, weekIdx, labelIdx, text });
    setDragActivityId(null);
  };
  const onDragLeave = () => setDragOverCell(null);

  const onDragOverCell = (e: React.DragEvent, rowKey: string, weekIdx: number) => {
    const ck = cellKey(rowKey, weekIdx);
    // Allow drop if: activity dragging (only Técnica row) or label from same row
    if (dragActivityId && rowKey === 'Técnica') { e.preventDefault(); setDragOverCell(ck); return; }
    if (dragLabel && dragLabel.rowKey === rowKey) { e.preventDefault(); setDragOverCell(ck); return; }
  };

  const onDropToCell = (e: React.DragEvent, rowKey: string, toWeekIdx: number) => {
    e.preventDefault();
    setDragOverCell(null);
    // Activity drop → only Técnica row
    if (dragActivityId && rowKey === 'Técnica') {
      persist({ ...planeacion, tecnicaAssignments: { ...planeacion.tecnicaAssignments, [dragActivityId]: toWeekIdx } });
      setDragActivityId(null);
      return;
    }
    // Label drop → same row, different week
    if (dragLabel && dragLabel.rowKey === rowKey) {
      if (dragLabel.weekIdx === toWeekIdx) { setDragLabel(null); return; }
      const fromCk = cellKey(dragLabel.rowKey, dragLabel.weekIdx);
      const toCk   = cellKey(rowKey, toWeekIdx);
      const fromArr = [...(planeacion.transversalCells[fromCk] ?? [])];
      fromArr.splice(dragLabel.labelIdx, 1);
      const toArr = [...(planeacion.transversalCells[toCk] ?? []), dragLabel.text];
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
    if (!dragActivityId) return;
    const ta = { ...planeacion.tecnicaAssignments };
    delete ta[dragActivityId];
    persist({ ...planeacion, tecnicaAssignments: ta });
    setDragActivityId(null);
  };

  const unassignActivity = (id: string) => {
    const ta = { ...planeacion.tecnicaAssignments };
    delete ta[id];
    persist({ ...planeacion, tecnicaAssignments: ta });
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
    setDatePickerWeek(null);
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
    for (let w = 0; w < effectiveTotalWeeks; w++) {
      if (consumed.has(w)) continue;
      const labels   = planeacion.transversalCells[`${rowKey}::${w}`] ?? [];
      const assigned = isTecnica ? activities.filter(a => planeacion.tecnicaAssignments[a.id] === w) : [];
      const hasSpan2 = w + 1 < effectiveTotalWeeks && (
        labels.some(lbl => (durations[`lbl::${rowKey}::${lbl}`] ?? 1) === 2) ||
        assigned.some(a  => (durations[`act::${a.id}`]          ?? 1) === 2)
      );
      const span: 1 | 2 = hasSpan2 ? 2 : 1;
      result.push({ weekIdx: w, span });
      if (span === 2) consumed.add(w + 1);
    }
    return result;
  }, [planeacion, activities, effectiveTotalWeeks]);

  // ── Derived geometry (based on effective segments) ───────────────────────
  const weeks = useMemo(
    () => Array.from({ length: effectiveTotalWeeks }, (_, i) => i),
    [effectiveTotalWeeks],
  );
  const phaseSpans = useMemo(() => {
    let idx = 0;
    return effectiveSegments.map(seg => {
      const span = { ...seg, start: idx };
      idx += seg.count;
      return span;
    });
  }, [effectiveSegments]);

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

  if (!ficha) return <div className="flex items-center justify-center h-64 text-gray-400">Cargando…</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <button onClick={() => navigate('/instructor/fichas')}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">
            Planeación Semanal — Ficha {ficha.code}
          </h2>
          <p className="text-xs text-gray-500">
            {ficha.program} · {effectiveTotalWeeks} semanas · {activities.length} evidencia(s) técnica(s)
          </p>
        </div>
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
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1 px-1" style={{ color: seg.color }}>
                    {phase.replace('Fase ', '')}
                  </p>
                  <div className="space-y-1">
                    {acts.map(a => (
                      <SidebarCard key={a.id} activity={a} color={seg.color}
                        onDragStart={() => onDragStartActivity(a.id)} isDragging={dragActivityId === a.id} />
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
        <div className="flex-1 overflow-auto" onClick={() => { setOpenDurationCard(null); setDatePickerWeek(null); }}>
          <table className="border-collapse text-xs select-none"
            style={{ minWidth: CELL_W * effectiveTotalWeeks + LABEL_W }}>
            <colgroup>
              <col style={{ width: LABEL_W, minWidth: LABEL_W }} />
              {weeks.map(w => <col key={w} style={{ width: CELL_W, minWidth: CELL_W }} />)}
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
                    <th key={span.phase} colSpan={span.count}
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
                {weeks.map(w => {
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
                  style={{ color: '#999900', minHeight: 60, backgroundColor: hoveredRow === 'Técnica' ? TECNICA_COLOR + '28' : 'white' }}>
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
                          return <GridCard key={a.id} activity={a} color={aSeg.color}
                            textColor={aSeg.color === TECNICA_COLOR ? '#808000' : undefined}
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
                          return <TransLabel key={idx} label={lbl} color={TECNICA_COLOR} textColor="#808000"
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
                    style={{ minHeight: 60, color: row.color, backgroundColor: hoveredRow === row.key ? row.color + '28' : 'white' }}>
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
                          {labels.map((lbl, idx) => {
                            const key = lblKey(row.key, lbl);
                            return <TransLabel key={idx} label={lbl} color={row.color}
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
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────
interface SidebarCardProps { activity: GradeActivity; color: string; onDragStart: () => void; isDragging: boolean; }
const SidebarCard: React.FC<SidebarCardProps> = ({ activity, color, onDragStart, isDragging }) => {
  const typeLabel = activity.detail || (activity.maxScore > 0 ? 'Calificable' : 'No calificable');
  const typeColor = activity.detail ? getTypeColor(activity.detail, color) : color;
  return (
    <div draggable onDragStart={onDragStart}
      className="flex flex-col gap-1 rounded px-1.5 py-1.5 cursor-grab active:cursor-grabbing border transition-opacity"
      style={{ backgroundColor: color + '18', borderColor: color + '55', opacity: isDragging ? 0.4 : 1 }}
      title={`${activity.name}\n${activity.id}`}>
      <div className="flex items-start gap-1">
        <GripVertical className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" />
        <span className="text-[10px] font-semibold leading-tight line-clamp-3" style={{ color }}>{activity.name}</span>
      </div>
      <span className="self-start text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
        style={{ backgroundColor: typeColor + '25', color: typeColor, border: `1px solid ${typeColor}55` }}>
        {typeLabel}
      </span>
      <span className="text-[9px] font-mono text-gray-400 leading-none truncate">{activity.id}</span>
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
  const typeLabel = activity.detail || (activity.maxScore > 0 ? 'Calificable' : 'No calificable');
  const typeColor = activity.detail ? getTypeColor(activity.detail, tc) : tc;
  const startDate = weekStarts[weekIdx] ?? '';
  const endDate   = weekEnds[Math.min(weekIdx + duration - 1, weekEnds.length - 1)] ?? '';
  return (
  <div
    draggable
    onDragStart={e => { e.stopPropagation(); onDragStart(); }}
    className="relative flex flex-col gap-1 rounded px-2 py-1.5 cursor-grab active:cursor-grabbing border group w-full transition-opacity"
    style={{ backgroundColor: color + '22', borderColor: tc + '99', opacity: hidden ? 0.3 : isDragging ? 0.35 : 1 }}
    title={`${activity.name}\n${activity.id}`}
  >
    {/* Name + action buttons */}
    <div className="flex items-start gap-1" onClick={e => { e.stopPropagation(); onToggleDurationPicker(); }}>
      <GripVertical className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-40" style={{ color: tc }} />
      <span className="flex-1 text-[11px] font-semibold leading-snug break-words" style={{ color: tc, wordBreak: 'break-word', whiteSpace: 'normal' }}>
        {activity.name}
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
    {/* Type badge */}
    <span className="self-start text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
      style={{ backgroundColor: typeColor + '25', color: typeColor, border: `1px solid ${typeColor}55` }}>
      {typeLabel}
    </span>
    {/* Date range */}
    {startDate && (
      <span className="text-[9px] text-gray-400 leading-none">{startDate} — {endDate}</span>
    )}
    {/* Code footer + duration badge */}
    <div className="flex items-center justify-between gap-1 mt-0.5">
      <span className="text-[9px] font-mono text-gray-400 leading-none truncate flex-1">{activity.id}</span>
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
    onDragStart={e => { e.stopPropagation(); onDragStart(); }}
    className="relative flex flex-col gap-1 rounded px-2 py-1.5 group cursor-grab active:cursor-grabbing w-full transition-opacity"
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
    <div className="flex items-center justify-between gap-1">
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

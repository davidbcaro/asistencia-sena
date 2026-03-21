import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, GripVertical, X } from 'lucide-react';
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

// Week start dates: base 29/09/2025, +7 days each (matches the Excel exactly)
const BASE_DATE = new Date('2025-09-29T00:00:00');
const WEEK_START_DATES: string[] = Array.from({ length: TOTAL_WEEKS }, (_, i) => {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() + i * 7);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
});

// ─── Transversal rows (colors match PLANEACION SEMANAL GRD legend) ──────────
const TECNICA_COLOR = '#F9D000'; // Yellow — Técnica row

const TRANSVERSAL_ROWS = [
  { key: 'TICs',              label: "TIC's",              color: '#4CAF50' }, // Green
  { key: 'Bilingüismo',       label: 'Bilingüismo',        color: '#F44336' }, // Red
  { key: 'Matemáticas',       label: 'Matemáticas',        color: '#F48FB1' }, // Pink
  { key: 'Comunicación',      label: 'Comunicación / Ética / Derechos', color: '#9C27B0' }, // Purple (shared)
  { key: 'Investigación',     label: 'Investigación',      color: '#FF9800' }, // Orange
  { key: 'Ambiente',          label: 'Ambiente',           color: '#2196F3' }, // Blue
  { key: 'Emprendimiento',    label: 'Emprendimiento',     color: '#009688' }, // Teal
  { key: 'EducaciónFísica',   label: 'Edu. Física',        color: '#9E9E9E' }, // Gray
  { key: 'CienciasNaturales', label: 'Ciencias Naturales', color: '#BDBDBD' }, // Light gray
  { key: 'DerechosTrabajo',   label: 'Derechos Trabajo',   color: '#9C27B0' }, // Purple (same as Comunicación)
  { key: 'Ética',             label: 'Ética',              color: '#9C27B0' }, // Purple (same)
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
  // Derechos Trabajo – Guía 11
  'DerechosTrabajo::96':  'Taller derechos trabajo',
  'DerechosTrabajo::97':  'Informe trabajo decente',
  'DerechosTrabajo::98':  'Infografía sobre la huelga',
  'DerechosTrabajo::99':  'Cuadro comparativo derecho de petición',
  'DerechosTrabajo::100': 'Presentación derechos trabajo',
  // Ética – Guía 12
  'Ética::102': 'Presentación proyecto de vida',
  'Ética::103': 'Diagrama de sistemas',
  'Ética::104': 'Estrategia uso racional recursos',
  'Ética::105': 'Solución del caso. Cultura de paz',
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
  return { tecnicaAssignments: {}, transversalCells };
};

const EMPTY_DATA: PlaneacionSemanalFichaData = { tecnicaAssignments: {}, transversalCells: {} };
const CELL_W  = 200; // px per week column (fixed)
const DATE_H  = 22;  // px for the date header sub-row
const PHASE_H = 28;  // px for phase header row
const LABEL_W = 150; // px for row label column

// ─── Component ───────────────────────────────────────────────────────────────
export const PlaneacionSemanalView: React.FC = () => {
  const { fichaId } = useParams<{ fichaId: string }>();
  const navigate    = useNavigate();

  const [ficha,      setFicha]      = useState<{ id: string; code: string; program: string } | null>(null);
  const [activities, setActivities] = useState<GradeActivity[]>([]);
  const [planeacion, setPlaneacion] = useState<PlaneacionSemanalFichaData>(EMPTY_DATA);

  const [dragActivityId, setDragActivityId] = useState<string | null>(null);
  const [dragLabel,      setDragLabel]      = useState<{ rowKey: string; weekIdx: number; labelIdx: number; text: string } | null>(null);
  const [dragOverCell,   setDragOverCell]   = useState<string | null>(null);

  const [editingCell,  setEditingCell]  = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // ── Load ────────────────────────────────────────────────────────────────
  const loadData = useCallback(() => {
    const fichas = getFichas();
    const f = fichas.find(x => x.id === fichaId);
    if (f) setFicha({ id: f.id, code: f.code, program: f.program });

    const all = getGradeActivities();
    setActivities(f ? all.filter(a => a.group === f.code) : []);

    const allPlan = getPlaneacionSemanal();
    if (!allPlan[fichaId ?? '']) {
      // First visit: seed with defaults
      const def = buildDefaultData();
      allPlan[fichaId ?? ''] = def;
      savePlaneacionSemanal(allPlan);
      setPlaneacion(def);
    } else {
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

  // ── Derived geometry ────────────────────────────────────────────────────
  const weeks = useMemo(() => Array.from({ length: TOTAL_WEEKS }, (_, i) => i), []);
  const phaseSpans = useMemo(() => {
    let idx = 0;
    return PHASE_SEGMENTS.map(seg => {
      const span = { ...seg, start: idx };
      idx += seg.count;
      return span;
    });
  }, []);

  // Week label within its phase: S1, S2, …
  const weekLabel = (w: number): string => {
    let offset = w;
    for (const seg of PHASE_SEGMENTS) {
      if (offset < seg.count) return `S${offset + 1}`;
      offset -= seg.count;
    }
    return `W${w + 1}`;
  };

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
            {ficha.program} · {TOTAL_WEEKS} semanas · {activities.length} evidencia(s) técnica(s)
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
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs select-none"
            style={{ minWidth: CELL_W * TOTAL_WEEKS + LABEL_W }}>
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
                {phaseSpans.map(span => (
                  <th key={span.phase} colSpan={span.count}
                    className="border-b border-r border-gray-400 text-center font-bold text-[11px] tracking-wide"
                    style={{ backgroundColor: span.color, color: span.text, height: PHASE_H }}>
                    {span.phase.replace('Fase ', '').replace('Fase Inducción', 'Inducción')} ({span.count}s)
                  </th>
                ))}
              </tr>

              {/* ── Week number + date row ── */}
              <tr>
                <th className="sticky left-0 z-30 bg-gray-50 border-b border-r border-gray-300 px-2 text-[9px] font-semibold text-gray-400 uppercase"
                  style={{ height: DATE_H + 18 }}>
                  Fecha semanal
                </th>
                {weeks.map(w => {
                  const seg = WEEK_PHASE_MAP[w];
                  return (
                    <th key={w} className="border-b border-r border-gray-200 text-center"
                      style={{ backgroundColor: seg.color + '14', height: DATE_H + 18 }}>
                      <div className="flex flex-col items-center leading-none gap-0.5">
                        <span className="font-bold text-[10px]" style={{ color: seg.color }}>{weekLabel(w)}</span>
                        <span className="text-[9px] text-gray-400 font-normal">{WEEK_START_DATES[w]}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* ── Técnica row ── */}
              <tr>
                <td className="sticky left-0 z-20 border-b border-r border-gray-200 font-bold px-2 text-[11px] align-middle"
                  style={{ backgroundColor: TECNICA_COLOR + '44', color: '#7A6500', minHeight: 60 }}>
                  Técnica
                </td>
                {weeks.map(w => {
                  const ck     = cellKey('Técnica', w);
                  const isOver = dragOverCell === ck;
                  const assigned   = activities.filter(a => planeacion.tecnicaAssignments[a.id] === w);
                  const textLabels = getLabels('Técnica', w);
                  return (
                    <td key={w}
                      className="border-b border-r border-gray-200 align-top p-1 cursor-pointer transition-colors"
                      style={{
                        minHeight: 60,
                        backgroundColor: isOver ? TECNICA_COLOR + '66' : TECNICA_COLOR + '22',
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
                          return <GridCard key={a.id} activity={a} color={aSeg.color}
                            onDragStart={() => onDragStartActivity(a.id)} isDragging={dragActivityId === a.id}
                            onRemove={() => unassignActivity(a.id)} />;
                        })}
                        {textLabels.map((lbl, idx) => (
                          <TransLabel key={idx} label={lbl} color={'#7A6500'}
                            isDragging={dragLabel?.rowKey === 'Técnica' && dragLabel.weekIdx === w && dragLabel.labelIdx === idx}
                            onDragStart={() => onDragStartLabel('Técnica', w, idx, lbl)}
                            onRemove={e => { e.stopPropagation(); removeLabel('Técnica', w, idx); }} />
                        ))}
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
                <tr key={row.key}>
                  <td className="sticky left-0 z-20 border-b border-r border-gray-200 font-semibold px-2 text-[11px] align-middle"
                    style={{ minHeight: 60, color: row.color, backgroundColor: row.color + '33' }}>
                    {row.label}
                  </td>
                  {weeks.map(w => {
                    const ck     = cellKey(row.key, w);
                    const labels = getLabels(row.key, w);
                    const isOver = dragOverCell === ck;
                    const isEdit = editingCell === ck;
                    return (
                      <td key={w}
                        className="border-b border-r border-gray-200 align-top p-1 cursor-pointer transition-colors"
                        style={{
                          minHeight: 60,
                          backgroundColor: isOver ? row.color + '55' : row.color + '18',
                          outline: isOver ? `2px dashed ${row.color}` : undefined,
                          outlineOffset: -2,
                        }}
                        onDragOver={e => onDragOverCell(e, row.key, w)}
                        onDragLeave={onDragLeave}
                        onDrop={e => onDropToCell(e, row.key, w)}
                        onClick={() => { if (!isEdit) startEditCell(row.key, w); }}
                      >
                        <div className="flex flex-col gap-1">
                          {labels.map((lbl, idx) => (
                            <TransLabel key={idx} label={lbl} color={row.color}
                              isDragging={dragLabel?.rowKey === row.key && dragLabel.weekIdx === w && dragLabel.labelIdx === idx}
                              onDragStart={() => onDragStartLabel(row.key, w, idx, lbl)}
                              onRemove={e => { e.stopPropagation(); removeLabel(row.key, w, idx); }} />
                          ))}
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
const SidebarCard: React.FC<SidebarCardProps> = ({ activity, color, onDragStart, isDragging }) => (
  <div draggable onDragStart={onDragStart}
    className="flex items-start gap-1 rounded px-1.5 py-1 cursor-grab active:cursor-grabbing border transition-opacity"
    style={{ backgroundColor: color + '18', borderColor: color + '55', opacity: isDragging ? 0.4 : 1 }}
    title={activity.name}>
    <GripVertical className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" />
    <span className="text-[10px] font-medium leading-tight line-clamp-2" style={{ color }}>{activity.name}</span>
  </div>
);

interface GridCardProps { activity: GradeActivity; color: string; onDragStart: () => void; isDragging: boolean; onRemove: () => void; }
const GridCard: React.FC<GridCardProps> = ({ activity, color, onDragStart, isDragging, onRemove }) => (
  <div draggable onDragStart={onDragStart}
    className="flex items-start gap-1 rounded px-2 py-1 cursor-grab active:cursor-grabbing border group transition-opacity w-full"
    style={{ backgroundColor: color + '22', borderColor: color + '66', opacity: isDragging ? 0.35 : 1 }}
    title={activity.name}>
    <GripVertical className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-40" style={{ color }} />
    <span className="flex-1 text-[11px] font-medium leading-snug break-words" style={{ color, wordBreak: 'break-word', whiteSpace: 'normal' }}>{activity.name}</span>
    <button className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
      style={{ color }} onClick={e => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
      title="Quitar de esta semana">
      <X className="w-3 h-3" />
    </button>
  </div>
);

interface TransLabelProps {
  label: string;
  color: string;
  isDragging?: boolean;
  onDragStart: () => void;
  onRemove: (e: React.MouseEvent) => void;
}
const TransLabel: React.FC<TransLabelProps> = ({ label, color, isDragging, onDragStart, onRemove }) => (
  <div
    draggable
    onDragStart={onDragStart}
    className="flex items-start gap-1 rounded px-2 py-1 group cursor-grab active:cursor-grabbing w-full transition-opacity"
    style={{
      backgroundColor: color + '28',
      border: `1px solid ${color}55`,
      opacity: isDragging ? 0.3 : 1,
    }}
    title={label}
  >
    <GripVertical className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-40" style={{ color }} />
    <span
      className="flex-1 text-[11px] font-medium leading-snug break-words"
      style={{ color, wordBreak: 'break-word', whiteSpace: 'normal' }}
    >
      {label}
    </span>
    <button
      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
      style={{ color }}
      onClick={onRemove}
    >
      <X className="w-3 h-3" />
    </button>
  </div>
);

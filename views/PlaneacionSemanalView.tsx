import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, GripVertical, X } from 'lucide-react';
import { GradeActivity, PlaneacionSemanalFichaData } from '../types';
import { getFichas, getGradeActivities, getPlaneacionSemanal, savePlaneacionSemanal } from '../services/db';

// ─── Constants ───────────────────────────────────────────────────────────────

const PHASE_SEGMENTS = [
  { phase: 'Fase Inducción',     count: 2,  color: '#f59e0b', text: '#ffffff' },
  { phase: 'Fase 1: Análisis',   count: 12, color: '#0d9488', text: '#ffffff' },
  { phase: 'Fase 2: Planeación', count: 24, color: '#3b82f6', text: '#ffffff' },
  { phase: 'Fase 3: Ejecución',  count: 48, color: '#8b5cf6', text: '#ffffff' },
  { phase: 'Fase 4: Evaluación', count: 10, color: '#ef4444', text: '#ffffff' },
] as const;

// Total weeks = 2+12+24+48+10 = 96
const TOTAL_WEEKS = PHASE_SEGMENTS.reduce((s, p) => s + p.count, 0);

// Pre-build a lookup: weekIndex (0-based) → phase segment
const WEEK_PHASE_MAP: Array<typeof PHASE_SEGMENTS[number]> = [];
for (const seg of PHASE_SEGMENTS) {
  for (let i = 0; i < seg.count; i++) WEEK_PHASE_MAP.push(seg);
}

const TRANSVERSAL_ROWS = [
  { key: 'TICs',              label: 'TICs',              color: '#27AE60' },
  { key: 'Matemáticas',       label: 'Matemáticas',       color: '#F1948A' },
  { key: 'CienciasNaturales', label: 'Ciencias Naturales', color: '#85C1E9' },
  { key: 'Comunicación',      label: 'Comunicación',      color: '#A569BD' },
  { key: 'Investigación',     label: 'Investigación',     color: '#E67E22' },
  { key: 'Bilingüismo',       label: 'Bilingüismo',       color: '#E74C3C' },
  { key: 'Ambiente',          label: 'Ambiente',          color: '#2980B9' },
  { key: 'Emprendimiento',    label: 'Emprendimiento',    color: '#16A085' },
  { key: 'EducaciónFísica',   label: 'Educación Física',  color: '#95A5A6' },
] as const;

const EMPTY_DATA: PlaneacionSemanalFichaData = { tecnicaAssignments: {}, transversalCells: {} };

const CELL_W = 68; // px per week column
const ROW_H = 64;  // px per row (técnica and transversal)
const HEADER_ROW_H = 32;

// ─── Component ───────────────────────────────────────────────────────────────

export const PlaneacionSemanalView: React.FC = () => {
  const { fichaId } = useParams<{ fichaId: string }>();
  const navigate = useNavigate();

  // Data
  const [ficha, setFicha] = useState<{ id: string; code: string; program: string } | null>(null);
  const [activities, setActivities] = useState<GradeActivity[]>([]);
  const [planeacion, setPlaneacion] = useState<PlaneacionSemanalFichaData>(EMPTY_DATA);

  // Drag state
  const [dragActivityId, setDragActivityId] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null); // 'tecnica::weekIndex' | 'panel'

  // Inline edit state for transversal cells
  const [editingTransCell, setEditingTransCell] = useState<string | null>(null); // `${key}::${weekIndex}`
  const [editingTransValue, setEditingTransValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // ── Load data ────────────────────────────────────────────────────────────
  const loadData = useCallback(() => {
    const fichas = getFichas();
    const f = fichas.find(x => x.id === fichaId);
    if (f) setFicha({ id: f.id, code: f.code, program: f.program });

    const all = getGradeActivities();
    setActivities(f ? all.filter(a => a.group === f.code) : []);

    const all_plan = getPlaneacionSemanal();
    setPlaneacion(all_plan[fichaId ?? ''] ?? EMPTY_DATA);
  }, [fichaId]);

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, [loadData]);

  useEffect(() => {
    if (editingTransCell && editInputRef.current) editInputRef.current.focus();
  }, [editingTransCell]);

  // ── Persist helper ───────────────────────────────────────────────────────
  const persist = useCallback((updated: PlaneacionSemanalFichaData) => {
    setPlaneacion(updated);
    const all = getPlaneacionSemanal();
    all[fichaId ?? ''] = updated;
    savePlaneacionSemanal(all);
  }, [fichaId]);

  // ── Derived: unassigned activities ───────────────────────────────────────
  const unassigned = useMemo(
    () => activities.filter(a => planeacion.tecnicaAssignments[a.id] === undefined),
    [activities, planeacion.tecnicaAssignments],
  );

  // Group unassigned by phase for sidebar display
  const unassignedByPhase = useMemo(() => {
    const map = new Map<string, GradeActivity[]>();
    for (const seg of PHASE_SEGMENTS) map.set(seg.phase, []);
    unassigned.forEach(a => {
      if (!map.has(a.phase)) map.set(a.phase, []);
      map.get(a.phase)!.push(a);
    });
    return map;
  }, [unassigned]);

  // ── Drag & Drop handlers ─────────────────────────────────────────────────
  const onDragStart = (activityId: string) => {
    setDragActivityId(activityId);
  };

  const onDragOverCell = (e: React.DragEvent, cellKey: string) => {
    e.preventDefault();
    setDragOverCell(cellKey);
  };

  const onDragLeave = () => setDragOverCell(null);

  const onDropToWeek = (e: React.DragEvent, weekIndex: number) => {
    e.preventDefault();
    setDragOverCell(null);
    if (!dragActivityId) return;
    persist({
      ...planeacion,
      tecnicaAssignments: { ...planeacion.tecnicaAssignments, [dragActivityId]: weekIndex },
    });
    setDragActivityId(null);
  };

  const onDropToPanel = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCell(null);
    if (!dragActivityId) return;
    const updated = { ...planeacion.tecnicaAssignments };
    delete updated[dragActivityId];
    persist({ ...planeacion, tecnicaAssignments: updated });
    setDragActivityId(null);
  };

  const unassignActivity = (activityId: string) => {
    const updated = { ...planeacion.tecnicaAssignments };
    delete updated[activityId];
    persist({ ...planeacion, tecnicaAssignments: updated });
  };

  // ── Transversal cell editing ─────────────────────────────────────────────
  const cellKey = (transKey: string, weekIndex: number) => `${transKey}::${weekIndex}`;

  const getTransLabels = (transKey: string, weekIndex: number): string[] =>
    planeacion.transversalCells[cellKey(transKey, weekIndex)] ?? [];

  const startEditTransCell = (transKey: string, weekIndex: number) => {
    setEditingTransCell(cellKey(transKey, weekIndex));
    setEditingTransValue('');
  };

  const commitTransEdit = () => {
    if (!editingTransCell) return;
    const val = editingTransValue.trim();
    if (val) {
      const existing = planeacion.transversalCells[editingTransCell] ?? [];
      persist({
        ...planeacion,
        transversalCells: { ...planeacion.transversalCells, [editingTransCell]: [...existing, val] },
      });
    }
    setEditingTransCell(null);
    setEditingTransValue('');
  };

  const removeTransLabel = (transKey: string, weekIndex: number, labelIdx: number) => {
    const key = cellKey(transKey, weekIndex);
    const existing = planeacion.transversalCells[key] ?? [];
    const updated = existing.filter((_, i) => i !== labelIdx);
    const cells = { ...planeacion.transversalCells };
    if (updated.length === 0) delete cells[key];
    else cells[key] = updated;
    persist({ ...planeacion, transversalCells: cells });
  };

  // ── Render helpers ───────────────────────────────────────────────────────

  /** Returns week label within its phase, e.g. "S3" */
  const weekLabel = (weekIndex: number): string => {
    let offset = weekIndex;
    for (const seg of PHASE_SEGMENTS) {
      if (offset < seg.count) return `S${offset + 1}`;
      offset -= seg.count;
    }
    return `W${weekIndex + 1}`;
  };

  const phaseForActivity = (a: GradeActivity) =>
    PHASE_SEGMENTS.find(s => s.phase === a.phase) ?? PHASE_SEGMENTS[1];

  // Build week columns list once
  const weeks = useMemo(() => Array.from({ length: TOTAL_WEEKS }, (_, i) => i), []);

  // Group weeks into phase spans for the header
  const phaseSpans = useMemo(() => {
    const spans: Array<{ phase: string; color: string; text: string; start: number; count: number }> = [];
    let idx = 0;
    for (const seg of PHASE_SEGMENTS) {
      spans.push({ phase: seg.phase, color: seg.color, text: seg.text, start: idx, count: seg.count });
      idx += seg.count;
    }
    return spans;
  }, []);

  if (!ficha) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Cargando…</div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => navigate('/instructor/fichas')}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">
            Planeación Semanal — Ficha {ficha.code}
          </h2>
          <p className="text-xs text-gray-500">{ficha.program} · {TOTAL_WEEKS} semanas · {activities.length} evidencia(s) técnica(s)</p>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Sidebar: unassigned evidences ──────────────────────────── */}
        <aside
          className={`w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto transition-colors ${dragOverCell === 'panel' ? 'bg-blue-50 border-blue-300' : ''}`}
          onDragOver={e => onDragOverCell(e, 'panel')}
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
                  <p
                    className="text-[10px] font-bold uppercase tracking-wide mb-1 px-1"
                    style={{ color: seg.color }}
                  >
                    {phase.replace('Fase ', '').replace('Fase Inducción', 'Inducción')}
                  </p>
                  <div className="space-y-1">
                    {acts.map(a => (
                      <SidebarCard
                        key={a.id}
                        activity={a}
                        color={seg.color}
                        onDragStart={() => onDragStart(a.id)}
                        isDragging={dragActivityId === a.id}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {unassigned.length === 0 && (
              <p className="text-xs text-gray-400 text-center pt-4">Todas las evidencias están asignadas</p>
            )}
          </div>
        </aside>

        {/* ── Grid ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          <table
            className="border-collapse text-xs select-none"
            style={{ minWidth: CELL_W * TOTAL_WEEKS + 120 }}
          >
            <colgroup>
              <col style={{ width: 120, minWidth: 120 }} />
              {weeks.map(w => <col key={w} style={{ width: CELL_W, minWidth: CELL_W }} />)}
            </colgroup>

            {/* ── Phase header row ─── */}
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-30 bg-gray-100 border-b border-r border-gray-300 text-left px-2 text-[10px] font-bold uppercase text-gray-500 tracking-wide"
                  style={{ height: HEADER_ROW_H }}
                >
                  Fase / Semana
                </th>
                {phaseSpans.map(span => (
                  <th
                    key={span.phase}
                    colSpan={span.count}
                    className="border-b border-r border-gray-300 text-center font-bold text-[11px] tracking-wide"
                    style={{
                      backgroundColor: span.color,
                      color: span.text,
                      height: HEADER_ROW_H,
                    }}
                  >
                    {span.phase.replace('Fase ', '').replace('Fase Inducción', 'Inducción')} ({span.count}s)
                  </th>
                ))}
              </tr>

              {/* ── Week number row ─── */}
              <tr>
                <th
                  className="sticky left-0 z-30 bg-gray-50 border-b border-r border-gray-300"
                  style={{ height: HEADER_ROW_H }}
                />
                {weeks.map(w => {
                  const seg = WEEK_PHASE_MAP[w];
                  return (
                    <th
                      key={w}
                      className="border-b border-r border-gray-200 text-center font-semibold text-gray-500"
                      style={{
                        height: HEADER_ROW_H,
                        backgroundColor: seg.color + '18',
                        fontSize: 10,
                      }}
                    >
                      {weekLabel(w)}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* ── Técnica row ─── */}
              <tr>
                <td
                  className="sticky left-0 z-20 bg-white border-b border-r border-gray-200 font-semibold text-gray-700 px-2 text-[11px]"
                  style={{ height: ROW_H }}
                >
                  Técnica
                </td>
                {weeks.map(w => {
                  const seg = WEEK_PHASE_MAP[w];
                  const key = `tecnica::${w}`;
                  const assigned = activities.filter(
                    a => planeacion.tecnicaAssignments[a.id] === w,
                  );
                  const isOver = dragOverCell === key;
                  return (
                    <td
                      key={w}
                      className="border-b border-r border-gray-100 align-top p-0.5 transition-colors"
                      style={{
                        height: ROW_H,
                        backgroundColor: isOver ? seg.color + '28' : 'transparent',
                        outline: isOver ? `2px dashed ${seg.color}` : undefined,
                        outlineOffset: -2,
                      }}
                      onDragOver={e => onDragOverCell(e, key)}
                      onDragLeave={onDragLeave}
                      onDrop={e => onDropToWeek(e, w)}
                    >
                      <div className="flex flex-col gap-0.5 h-full">
                        {assigned.map(a => {
                          const aSeg = phaseForActivity(a);
                          return (
                            <GridCard
                              key={a.id}
                              activity={a}
                              color={aSeg.color}
                              onDragStart={() => onDragStart(a.id)}
                              isDragging={dragActivityId === a.id}
                              onRemove={() => unassignActivity(a.id)}
                            />
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* ── Transversal rows ─── */}
              {TRANSVERSAL_ROWS.map(row => (
                <tr key={row.key}>
                  <td
                    className="sticky left-0 z-20 bg-white border-b border-r border-gray-200 font-semibold px-2 text-[11px]"
                    style={{ height: ROW_H, color: row.color }}
                  >
                    {row.label}
                  </td>
                  {weeks.map(w => {
                    const ck = cellKey(row.key, w);
                    const labels = getTransLabels(row.key, w);
                    const isEditing = editingTransCell === ck;
                    return (
                      <td
                        key={w}
                        className="border-b border-r border-gray-100 align-top p-0.5 cursor-pointer hover:bg-gray-50 transition-colors"
                        style={{ height: ROW_H }}
                        onClick={() => { if (!isEditing) startEditTransCell(row.key, w); }}
                      >
                        <div className="flex flex-col gap-0.5 h-full">
                          {labels.map((lbl, idx) => (
                            <TransLabel
                              key={idx}
                              label={lbl}
                              color={row.color}
                              onRemove={e => { e.stopPropagation(); removeTransLabel(row.key, w, idx); }}
                            />
                          ))}
                          {isEditing && (
                            <input
                              ref={editInputRef}
                              className="w-full text-[10px] rounded border px-1 py-0.5 outline-none"
                              style={{ borderColor: row.color }}
                              value={editingTransValue}
                              onChange={e => setEditingTransValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitTransEdit();
                                if (e.key === 'Escape') { setEditingTransCell(null); setEditingTransValue(''); }
                              }}
                              onBlur={commitTransEdit}
                              onClick={e => e.stopPropagation()}
                            />
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

interface SidebarCardProps {
  activity: GradeActivity;
  color: string;
  onDragStart: () => void;
  isDragging: boolean;
}
const SidebarCard: React.FC<SidebarCardProps> = ({ activity, color, onDragStart, isDragging }) => (
  <div
    draggable
    onDragStart={onDragStart}
    className="flex items-start gap-1 rounded px-1.5 py-1 cursor-grab active:cursor-grabbing border transition-opacity"
    style={{
      backgroundColor: color + '18',
      borderColor: color + '55',
      opacity: isDragging ? 0.4 : 1,
    }}
    title={activity.name}
  >
    <GripVertical className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" />
    <span className="text-[10px] font-medium leading-tight line-clamp-2" style={{ color }}>
      {activity.name}
    </span>
  </div>
);

interface GridCardProps {
  activity: GradeActivity;
  color: string;
  onDragStart: () => void;
  isDragging: boolean;
  onRemove: () => void;
}
const GridCard: React.FC<GridCardProps> = ({ activity, color, onDragStart, isDragging, onRemove }) => (
  <div
    draggable
    onDragStart={onDragStart}
    className="relative flex items-start gap-0.5 rounded px-1 py-0.5 cursor-grab active:cursor-grabbing border group transition-opacity"
    style={{
      backgroundColor: color + '22',
      borderColor: color + '66',
      opacity: isDragging ? 0.35 : 1,
      fontSize: 9,
    }}
    title={activity.name}
  >
    <GripVertical className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-gray-300" />
    <span className="font-medium leading-tight line-clamp-2 flex-1" style={{ color }}>
      {activity.name}
    </span>
    <button
      className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
      style={{ color }}
      onClick={e => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
      title="Quitar de esta semana"
    >
      <X className="w-2.5 h-2.5" />
    </button>
  </div>
);

interface TransLabelProps {
  label: string;
  color: string;
  onRemove: (e: React.MouseEvent) => void;
}
const TransLabel: React.FC<TransLabelProps> = ({ label, color, onRemove }) => (
  <span
    className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 leading-none group"
    style={{ backgroundColor: color + '25', color, fontSize: 9, border: `1px solid ${color}44` }}
    title={label}
  >
    <span className="truncate max-w-[48px]">{label}</span>
    <button className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={onRemove}>
      <X className="w-2 h-2" />
    </button>
  </span>
);

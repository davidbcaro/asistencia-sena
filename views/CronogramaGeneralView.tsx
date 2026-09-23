import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, Calendar, User } from 'lucide-react';
import { Ficha, CronogramaGeneralEntry, CronogramaGeneralData, AreaKey, TipoEvidencia, ProgramaEvidencia, ProgramaFase, Programa } from '../types';
import { getFichas, getCronogramaGeneral, saveCronogramaGeneral, getGradeActivities, getPlaneacionSemanal, savePlaneacionSemanal } from '../services/db';
import { PLANEACION_PHASE_MAP, PROGRAMA_BASE, fichaUsesGlobalActivities, getProgramaForFicha, planeacionRowForArea } from '../services/programas';


// ─── BADGE COLORS ─────────────────────────────────────────────────────────────

const TIPO_BADGE: Record<TipoEvidencia, { bg: string; text: string; label: string }> = {
  conocimiento: { bg: '#dbeafe', text: '#1e40af', label: 'Conocimiento' },
  producto:     { bg: '#dcfce7', text: '#166534', label: 'Producto' },
  desempeño:    { bg: '#ffedd5', text: '#9a3412', label: 'Desempeño' },
  inducción:    { bg: '#fef9c3', text: '#854d0e', label: 'Inducción' },
};

// ─── AREA CLASSIFICATION (matching PlaneacionSemanalView colors) ──────────────

const AREAS: Record<AreaKey, { label: string; color: string; bg: string; text: string }> = {
  Técnica:          { label: 'Técnica',                       color: '#f59e0b', bg: '#fefce8', text: '#92400e' },
  TICs:             { label: "TIC's",                         color: '#4CAF50', bg: '#f0fdf4', text: '#14532d' },
  Bilingüismo:      { label: 'Bilingüismo',                   color: '#F44336', bg: '#fff1f2', text: '#9f1239' },
  Matemáticas:      { label: 'Matemáticas',                   color: '#F48FB1', bg: '#fdf2f8', text: '#831843' },
  Comunicación:     { label: 'Comunicación / Ética / Derechos', color: '#9C27B0', bg: '#faf5ff', text: '#581c87' },
  Investigación:    { label: 'Investigación',                 color: '#FF9800', bg: '#fff7ed', text: '#7c2d12' },
  Ambiente:         { label: 'Ambiente',                      color: '#2196F3', bg: '#eff6ff', text: '#1e3a8a' },
  Emprendimiento:   { label: 'Emprendimiento',                color: '#009688', bg: '#f0fdfa', text: '#134e4a' },
  EducaciónFísica:  { label: 'Edu. Física',                   color: '#9E9E9E', bg: '#f9fafb', text: '#374151' },
  CienciasNaturales:{ label: 'Ciencias Naturales',            color: '#78909C', bg: '#f8fafc', text: '#334155' },
  EEF:              { label: 'EEF',                           color: '#8b5cf6', bg: '#f5f3ff', text: '#4c1d95' },
};

const COMPETENCY_TO_AREA: Record<string, AreaKey> = {
  // Técnica — redes, seguridad, infraestructura
  '220501014': 'Técnica',
  '220501104': 'Técnica',
  '220501107': 'Técnica',
  '220501091': 'Técnica',
  '220501105': 'Técnica',
  '220501106': 'Técnica',
  // TIC's
  '220501046': 'TICs',
  // Bilingüismo
  '240202501': 'Bilingüismo',
  // Matemáticas
  '240201528': 'Matemáticas',
  // Comunicación / Ética / Derechos
  '240201524': 'Comunicación',
  '210201501': 'Comunicación',
  '240201526': 'Comunicación',
  // Investigación
  '240201064': 'Investigación',
  // Ambiente / SST
  '220601501': 'Ambiente',
  // Emprendimiento
  '240201529': 'Emprendimiento',
  // Edu. Física
  '230101507': 'EducaciónFísica',
  // Ciencias Naturales
  '220201501': 'CienciasNaturales',
};

/** Returns area config: uses ev.area override if present, otherwise extracts from competency code in ID */
const getAreaForEv = (ev: ProgramaEvidencia): typeof AREAS[AreaKey] | null => {
  if (ev.area) return AREAS[ev.area];
  const match = ev.id.match(/GA\d+-(\d+)-/);
  if (!match) return null;
  const code = match[1];
  const key: AreaKey = COMPETENCY_TO_AREA[code] ?? 'Técnica';
  return AREAS[key];
};

/** Legacy helper for places that only have the ID string */
const getArea = (evId: string): typeof AREAS[AreaKey] | null => {
  const match = evId.match(/GA\d+-(\d+)-/);
  if (!match) return null;
  const code = match[1];
  const key: AreaKey = COMPETENCY_TO_AREA[code] ?? 'Técnica';
  return AREAS[key];
};

// ─── STATS HELPERS ────────────────────────────────────────────────────────────

interface PhaseStats {
  total: number;
  configured: number;
  byArea: { area: typeof AREAS[AreaKey] | null; label: string; color: string; count: number }[];
  byTipo: { label: string; bg: string; text: string; count: number }[];
}

const computePhaseStats = (fase: ProgramaFase, entries: CronogramaGeneralEntry[]): PhaseStats => {
  const allEvs = fase.actividadesProyecto.flatMap(ap => ap.actividades.flatMap(aa => aa.evidencias));
  const total = allEvs.length;
  const configured = allEvs.filter(ev => {
    const e = entries.find(x => x.id === ev.id);
    return e && (e.fechaInicio || e.fechaFin || e.instructor);
  }).length;

  // By area
  const areaMap = new Map<string, { area: typeof AREAS[AreaKey] | null; label: string; color: string; count: number }>();
  allEvs.forEach(ev => {
    const area = getAreaForEv(ev);
    const key = area ? area.label : 'Sin clasificar';
    if (!areaMap.has(key)) {
      areaMap.set(key, { area, label: key, color: area ? area.color : '#9ca3af', count: 0 });
    }
    areaMap.get(key)!.count++;
  });
  const byArea = Array.from(areaMap.values()).sort((a, b) => b.count - a.count);

  // By tipo
  const tipoMap = new Map<string, { label: string; bg: string; text: string; count: number }>();
  allEvs.forEach(ev => {
    const key = ev.tipo ?? 'sin tipo';
    if (!tipoMap.has(key)) {
      const badge = ev.tipo ? TIPO_BADGE[ev.tipo] : { bg: '#f3f4f6', text: '#6b7280', label: 'Sin tipo' };
      tipoMap.set(key, { ...badge, count: 0 });
    }
    tipoMap.get(key)!.count++;
  });
  const byTipo = Array.from(tipoMap.values()).sort((a, b) => b.count - a.count);

  return { total, configured, byArea, byTipo };
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// ─── DEBOUNCE HOOK ────────────────────────────────────────────────────────────

function useDebounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

// ─── SYNC: CronogramaGeneral → PlaneacionSemanal ──────────────────────────────

/** ISO base date de PlaneacionSemanal (debe coincidir con BASE_DATE de esa vista) */
const PLANEACION_BASE_DATE_ISO = '2025-09-29';

/** Evidencias de Inducción usan IDs cortos 'AAn-EVnn'; las demás fases usan 'GA*' */
const isInduccionShortId = (id: string) => /^AA\d+-EV\d+$/.test(id);

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export const CronogramaGeneralView: React.FC = () => {
  const { fichaId } = useParams<{ fichaId: string }>();
  const navigate = useNavigate();

  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [activePhase, setActivePhase] = useState(0);
  const [expandedAPs, setExpandedAPs] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<CronogramaGeneralEntry[]>([]);
  const [syncResult, setSyncResult] = useState<{ phase: string; count: number } | null>(null);
  const [programa, setPrograma] = useState<Programa>(() => (fichaId ? getProgramaForFicha(fichaId) : PROGRAMA_BASE));
  const FASES = programa.fases;
  const GENERAL_TAB_IDX = FASES.length; // índice virtual del tab "General"

  // Load data
  const loadData = useCallback(() => {
    const fichas = getFichas();
    const found = fichas.find(f => f.id === fichaId) ?? null;
    setFicha(found);
    setPrograma(getProgramaForFicha(fichaId ?? ''));

    const all: CronogramaGeneralData = getCronogramaGeneral();
    setEntries(all[fichaId ?? ''] ?? []);
  }, [fichaId]);

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, [loadData]);

  // Expand all APs of active phase by default when switching tabs
  useEffect(() => {
    if (activePhase >= FASES.length) return; // General tab — no APs to expand
    const fase = FASES[activePhase];
    const keys = new Set(fase.actividadesProyecto.map(ap => `${activePhase}::${ap.codigo}`));
    setExpandedAPs(keys);
  }, [activePhase, FASES]);

  // Persist helper (debounced)
  const persistDebounced = useDebounce((newEntries: CronogramaGeneralEntry[]) => {
    const all: CronogramaGeneralData = getCronogramaGeneral();
    all[fichaId ?? ''] = newEntries;
    saveCronogramaGeneral(all);
  }, 500);

  // ── Sync fechas → PlaneacionSemanal ──────────────────────────────────────
  const handleSyncPhase = useCallback((faseName: string) => {
    if (!fichaId || !ficha) return;

    const planeacionPhase = PLANEACION_PHASE_MAP[faseName];
    if (!planeacionPhase) return;

    // 1) Leer actividades: seeds globales (group === '') + propias del ficha.
    // Las seeds globales son las creadas por CalificacionesView con group:'' y solo
    // aplican a las fichas del programa base.
    const usesGlobals = fichaUsesGlobalActivities(ficha.code);
    const gradeActivities = getGradeActivities().filter(
      a => (a.group === ficha.code || (usesGlobals && a.group === '')) && a.phase === planeacionPhase
    );
    const evById = new Map<string, ProgramaEvidencia>();
    FASES.forEach(f => f.actividadesProyecto.forEach(ap => ap.actividades.forEach(aa => aa.evidencias.forEach(ev => evById.set(ev.id, ev)))));

    // 2) Leer cronograma fresco y planeación
    const cronEntries: CronogramaGeneralEntry[] = getCronogramaGeneral()[fichaId] ?? [];
    const allPlan = getPlaneacionSemanal();
    const planData = allPlan[fichaId] ?? {
      tecnicaAssignments: {}, transversalCells: {},
      cardDurations: {}, hiddenCards: [], weekDateOverrides: {}, phaseWeekCounts: {},
    };

    // 4) Construir lista de ISO de inicio de cada semana (respeta weekDateOverrides)
    const overrides = planData.weekDateOverrides ?? {};
    const [by, bm, bd] = PLANEACION_BASE_DATE_ISO.split('-').map(Number);
    let cur = new Date(by, bm - 1, bd);
    const weekIsos: string[] = [];
    const DEFAULT_WEEKS: Record<string, number> = { 'Fase Inducción': 3, 'Fase 1: Análisis': 10, 'Fase 2: Planeación': 24, 'Fase 3: Ejecución': 40, 'Fase 4: Evaluación': 30 };
    const totalWeeks = Object.entries(DEFAULT_WEEKS)
      .reduce((sum, [ph, n]) => sum + ((planData.phaseWeekCounts ?? {})[ph] ?? n), 0);
    for (let w = 0; w < totalWeeks; w++) {
      if (overrides[w]) {
        const [oy, om, od] = overrides[w].split('-').map(Number);
        cur = new Date(oy, om - 1, od);
      }
      weekIsos.push(
        `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
      );
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
    }

    // 5) Asignar semanas
    const newAssignments = { ...planData.tecnicaAssignments };
    const newTransversal = { ...(planData.transversalAssignments ?? {}) };
    let count = 0;

    cronEntries.forEach(entry => {
      if (!entry.fechaInicio) return;

      // Buscar GradeActivity:
      // Primario: 'seed-' + ev.id  (GA* y GI* completos)
      // Fallback inducción: endsWith(ev.id) dentro de la misma fase
      const activity =
        gradeActivities.find(a => a.group === ficha.code && a.name.toUpperCase() === entry.id.toUpperCase()) ??
        gradeActivities.find(a => a.id === `seed-${entry.id}`) ??
        gradeActivities.find(a =>
          isInduccionShortId(entry.id) && a.id.endsWith(entry.id)
        );

      if (!activity) return;
      if (newAssignments[activity.id] !== undefined || newTransversal[activity.id]) return; // no sobreescribir asignaciones manuales

      const weekIdx = weekIsos.findIndex(iso => {
        const [y, m, d] = iso.split('-').map(Number);
        const start = new Date(y, m - 1, d);
        const end = new Date(y, m - 1, d);
        end.setDate(end.getDate() + 6);
        const [ty, tm, td] = entry.fechaInicio.split('-').map(Number);
        const target = new Date(ty, tm - 1, td);
        return target >= start && target <= end;
      });

      if (weekIdx >= 0) {
        // Cada evidencia va a la fila de su área (Técnica o la transversal que corresponda)
        const ev = evById.get(entry.id);
        const areaKey = (Object.keys(AREAS) as AreaKey[]).find(k => ev && AREAS[k] === getAreaForEv(ev));
        const row = areaKey ? planeacionRowForArea(areaKey) : 'Técnica';
        if (row === 'Técnica') newAssignments[activity.id] = weekIdx;
        else newTransversal[activity.id] = { rowKey: row, weekIdx };
        count++;
      }
    });

    if (count > 0) {
      allPlan[fichaId] = { ...planData, tecnicaAssignments: newAssignments, transversalAssignments: newTransversal, updatedAt: new Date().toISOString() };
      savePlaneacionSemanal(allPlan);
    }

    setSyncResult({ phase: faseName, count });
    setTimeout(() => setSyncResult(null), 4000);
  }, [fichaId, ficha, FASES]);

  const getEntry = (evId: string): CronogramaGeneralEntry =>
    entries.find(e => e.id === evId) ?? { id: evId, fechaInicio: '', fechaFin: '', instructor: '' };

  const updateEntry = (evId: string, field: keyof Omit<CronogramaGeneralEntry, 'id'>, value: string) => {
    setEntries(prev => {
      const existing = prev.find(e => e.id === evId);
      let updated: CronogramaGeneralEntry[];
      if (existing) {
        updated = prev.map(e => e.id === evId ? { ...e, [field]: value } : e);
      } else {
        updated = [...prev, { id: evId, fechaInicio: '', fechaFin: '', instructor: '', [field]: value }];
      }
      persistDebounced(updated);
      return updated;
    });
  };

  const toggleAP = (key: string) => {
    setExpandedAPs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const fase = activePhase < FASES.length ? FASES[activePhase] : null;

  // Global progress
  const totalEvidencias = FASES.reduce((sum, f) =>
    sum + f.actividadesProyecto.reduce((s, ap) =>
      s + ap.actividades.reduce((ss, aa) => ss + aa.evidencias.length, 0), 0), 0);
  const filledEntries = entries.filter(e => e.fechaInicio || e.fechaFin || e.instructor).length;

  // Stats for active phase
  const phaseStats = useMemo(
    () => fase ? computePhaseStats(fase, entries) : null,
    [fase, entries]
  );

  // Stats for all phases (used in General tab)
  const allPhaseStats = useMemo(
    () => FASES.map(f => ({ fase: f, stats: computePhaseStats(f, entries) })),
    [entries]
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0 20px', borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        <button
          onClick={() => navigate('/instructor/fichas')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', color: '#374151', fontSize: 14 }}
        >
          <ArrowLeft size={16} /> Volver a Fichas
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827' }}>
              Cronograma General
            </h1>
            {ficha && (
              <span style={{ fontSize: 14, color: '#6b7280' }}>
                Ficha {ficha.code} — {ficha.program}
              </span>
            )}
          </div>
          {ficha?.cronogramaProgramName && (
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>{ficha.cronogramaProgramName}</p>
          )}
        </div>
        {/* Progress chip */}
        <div style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
          {filledEntries} / {totalEvidencias} evidencias configuradas
        </div>
      </div>

      {/* Phase tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {FASES.map((f, idx) => (
          <button
            key={f.nombre}
            onClick={() => setActivePhase(idx)}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              background: activePhase === idx ? f.color : '#f3f4f6',
              color: activePhase === idx ? f.textColor : '#374151',
              boxShadow: activePhase === idx ? `0 2px 8px ${f.color}55` : 'none',
              transition: 'all 0.15s',
            }}
          >
            {f.nombre}
          </button>
        ))}
        {/* General tab */}
        <button
          onClick={() => setActivePhase(GENERAL_TAB_IDX)}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: activePhase === GENERAL_TAB_IDX ? 'none' : '1px dashed #d1d5db',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 14,
            background: activePhase === GENERAL_TAB_IDX ? '#1f2937' : '#f9fafb',
            color: activePhase === GENERAL_TAB_IDX ? '#ffffff' : '#6b7280',
            boxShadow: activePhase === GENERAL_TAB_IDX ? '0 2px 8px #1f293755' : 'none',
            transition: 'all 0.15s',
          }}
        >
          Resumen General
        </button>
      </div>

      {/* Phase stats bar */}
      {phaseStats && fase && (
        <div style={{
          background: `${fase.color}0d`,
          border: `1px solid ${fase.color}33`,
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          {/* Total + configured */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: fase.color }}>
              {phaseStats.total} evidencias
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>·</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {phaseStats.configured} configuradas
            </span>
            {phaseStats.total > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: phaseStats.configured === phaseStats.total ? '#dcfce7' : '#f3f4f6',
                color: phaseStats.configured === phaseStats.total ? '#166534' : '#6b7280',
                padding: '1px 7px', borderRadius: 20,
              }}>
                {Math.round(phaseStats.configured / phaseStats.total * 100)}%
              </span>
            )}
          </div>
          <div style={{ width: 1, height: 20, background: `${fase.color}44`, flexShrink: 0 }} />
          {/* By tipo */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Tipo:</span>
            {phaseStats.byTipo.map(t => (
              <span key={t.label} style={{
                fontSize: 11, fontWeight: 700,
                background: t.bg, color: t.text,
                padding: '2px 8px', borderRadius: 4,
              }}>
                {t.label}: {t.count}
              </span>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: `${fase.color}44`, flexShrink: 0 }} />
          {/* By area */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Área:</span>
            {phaseStats.byArea.map(a => (
              <span key={a.label} style={{
                fontSize: 11, fontWeight: 700,
                background: a.color,
                color: '#ffffff',
                padding: '2px 8px', borderRadius: 4,
              }}>
                {a.label}: {a.count}
              </span>
            ))}
          </div>

          {/* Botón sincronizar con Planeación Semanal */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {syncResult?.phase === fase.nombre && (
              <span style={{
                fontSize: 12,
                color: syncResult.count > 0 ? '#16a34a' : '#6b7280',
                fontWeight: 600,
              }}>
                {syncResult.count > 0
                  ? `✓ ${syncResult.count} evidencia${syncResult.count !== 1 ? 's' : ''} sincronizada${syncResult.count !== 1 ? 's' : ''}`
                  : 'Sin cambios (ya asignadas o sin fecha)'}
              </span>
            )}
            <button
              onClick={() => handleSyncPhase(fase.nombre)}
              title="Aplica las fechaInicio del Cronograma a la Planeación Semanal (solo evidencias sin semana asignada)"
              style={{
                padding: '6px 14px',
                borderRadius: 7,
                border: `1.5px solid ${fase.color}`,
                background: 'white',
                color: fase.color,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              ↔ Sincronizar con Planeación
            </button>
          </div>
        </div>
      )}

      {/* ── GENERAL (consolidated) VIEW ─────────────────────────────────────── */}
      {activePhase === GENERAL_TAB_IDX && (
        <div>
          {/* Grand total card */}
          <div style={{
            background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 20,
            color: 'white',
            display: 'flex',
            gap: 32,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>TOTAL GENERAL</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{totalEvidencias}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>evidencias en el programa</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>CONFIGURADAS</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{filledEntries}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {totalEvidencias > 0 ? Math.round(filledEntries / totalEvidencias * 100) : 0}% completado
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>PENDIENTES</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{totalEvidencias - filledEntries}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>por configurar</div>
            </div>
            {/* Progress bar */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${totalEvidencias > 0 ? filledEntries / totalEvidencias * 100 : 0}%`,
                  background: '#4ade80',
                  borderRadius: 4,
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Progreso global</div>
            </div>
          </div>

          {/* Per-phase cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 24 }}>
            {allPhaseStats.map(({ fase: f, stats }) => (
              <div key={f.nombre} style={{
                border: `1px solid ${f.color}44`,
                borderTop: `4px solid ${f.color}`,
                borderRadius: 10,
                padding: '16px',
                background: 'white',
              }}>
                {/* Phase header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{
                    fontWeight: 700, fontSize: 15, color: f.color,
                  }}>
                    {f.nombre}
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
                      {stats.configured}/{stats.total}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                      background: stats.configured === stats.total && stats.total > 0 ? '#dcfce7' : stats.configured > 0 ? '#fef9c3' : '#f3f4f6',
                      color: stats.configured === stats.total && stats.total > 0 ? '#166534' : stats.configured > 0 ? '#854d0e' : '#6b7280',
                    }}>
                      {stats.total > 0 ? Math.round(stats.configured / stats.total * 100) : 0}%
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{
                    height: '100%',
                    width: `${stats.total > 0 ? stats.configured / stats.total * 100 : 0}%`,
                    background: f.color,
                    borderRadius: 3,
                    transition: 'width 0.3s',
                  }} />
                </div>
                {/* By tipo */}
                {stats.byTipo.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase' }}>Por tipo</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {stats.byTipo.map(t => (
                        <span key={t.label} style={{
                          fontSize: 11, fontWeight: 600,
                          background: t.bg, color: t.text,
                          padding: '2px 8px', borderRadius: 4,
                        }}>
                          {t.label}: {t.count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* By area */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase' }}>Por área</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {stats.byArea.map(a => (
                      <span key={a.label} style={{
                        fontSize: 11, fontWeight: 600,
                        background: a.color + '22',
                        color: a.color === '#9ca3af' ? '#6b7280' : a.color,
                        border: `1px solid ${a.color}55`,
                        padding: '2px 8px', borderRadius: 4,
                      }}>
                        {a.label}: {a.count}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Navigate button */}
                <button
                  onClick={() => setActivePhase(FASES.indexOf(f))}
                  style={{
                    marginTop: 12, width: '100%',
                    padding: '6px', borderRadius: 6,
                    border: `1px solid ${f.color}44`,
                    background: `${f.color}0d`,
                    color: f.color, fontWeight: 600, fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Ver {f.nombre} →
                </button>
              </div>
            ))}
          </div>

          {/* Area consolidado global */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1f2937' }}>
              Desglose por área — todas las fases
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {(() => {
                const globalAreaMap = new Map<string, { color: string; total: number; configured: number }>();
                FASES.forEach(f => {
                  f.actividadesProyecto.forEach(ap => ap.actividades.forEach(aa => aa.evidencias.forEach(ev => {
                    const area = getAreaForEv(ev);
                    const key = area ? area.label : 'Sin clasificar';
                    const color = area ? area.color : '#9ca3af';
                    if (!globalAreaMap.has(key)) globalAreaMap.set(key, { color, total: 0, configured: 0 });
                    globalAreaMap.get(key)!.total++;
                    const entry = entries.find(e => e.id === ev.id);
                    if (entry && (entry.fechaInicio || entry.fechaFin || entry.instructor)) {
                      globalAreaMap.get(key)!.configured++;
                    }
                  })));
                });
                return Array.from(globalAreaMap.entries())
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([label, { color, total, configured }]) => (
                    <div key={label} style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: `1px solid ${color}44`,
                      borderLeft: `4px solid ${color}`,
                      background: color + '0d',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#1f2937' }}>{total}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{configured} configuradas · {total > 0 ? Math.round(configured / total * 100) : 0}%</div>
                      <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${total > 0 ? configured / total * 100 : 0}%`, background: color, borderRadius: 2 }} />
                      </div>
                    </div>
                  ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Phase content */}
      {activePhase < FASES.length && (
      <div>
        {fase.actividadesProyecto.map((ap) => {
          const apKey = `${activePhase}::${ap.codigo}`;
          const isExpanded = expandedAPs.has(apKey);

          return (
            <div
              key={ap.codigo}
              style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', border: `1px solid ${fase.color}33` }}
            >
              {/* AP Header (accordion toggle) */}
              <button
                onClick={() => toggleAP(apKey)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  background: `${fase.color}18`,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderBottom: isExpanded ? `1px solid ${fase.color}33` : 'none',
                }}
              >
                <span style={{ color: fase.color, flexShrink: 0 }}>
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#1f2937', lineHeight: 1.4 }}>
                  {ap.titulo}
                </span>
              </button>

              {/* AP Body */}
              {isExpanded && (
                <div style={{ background: 'white' }}>
                  {ap.actividades.map((aa, aaIdx) => (
                    <div
                      key={aa.codigo}
                      style={{
                        padding: '16px 20px',
                        borderBottom: aaIdx < ap.actividades.length - 1 ? '1px solid #f3f4f6' : 'none',
                      }}
                    >
                      {/* AA header */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                          {aa.titulo}
                        </div>
                        {(aa.rap || aa.rapTitulo) && <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: fase.color,
                            background: `${fase.color}18`,
                            padding: '2px 8px',
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                            marginTop: 1,
                          }}>
                            RAP {aa.rap}
                          </span>
                          <span style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{aa.rapTitulo}</span>
                        </div>}
                      </div>

                      {/* Evidence cards */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 12 }}>
                        {aa.evidencias.map((ev) => {
                          const entry = getEntry(ev.id);
                          const badge = ev.tipo ? TIPO_BADGE[ev.tipo] : null;
                          const area = getAreaForEv(ev);
                          return (
                            <div
                              key={ev.id}
                              style={{
                                background: area ? area.bg : '#fafafa',
                                border: area ? `1px solid ${area.color}44` : '1px solid #e5e7eb',
                                borderLeft: area ? `4px solid ${area.color}` : '4px solid #d1d5db',
                                borderRadius: 8,
                                padding: '12px 14px',
                              }}
                            >
                              {/* Evidence header */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                                {/* Area badge — solo si aplica */}
                                {area && (
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: area.color,
                                    color: '#ffffff',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                    marginTop: 1,
                                  }}>
                                    {area.label}
                                  </span>
                                )}
                                {/* Tipo badge — solo si aplica */}
                                {badge && (
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: badge.bg,
                                    color: badge.text,
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                    marginTop: 1,
                                    textTransform: 'uppercase',
                                  }}>
                                    {badge.label}
                                  </span>
                                )}
                                <div style={{ flex: 1, minWidth: 200 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginRight: 6 }}>{ev.id}.</span>
                                  <span style={{ fontSize: 13, color: '#374151' }}>{ev.descripcion}</span>
                                </div>
                              </div>

                              {/* Editable fields */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8, alignItems: 'end' }}>
                                {/* Fecha Inicio */}
                                <div>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                                    <Calendar size={11} /> Fecha inicio
                                  </label>
                                  <input
                                    type="date"
                                    value={entry.fechaInicio}
                                    onChange={e => updateEntry(ev.id, 'fechaInicio', e.target.value)}
                                    style={{
                                      width: '100%',
                                      padding: '6px 8px',
                                      border: '1px solid #d1d5db',
                                      borderRadius: 6,
                                      fontSize: 13,
                                      color: entry.fechaInicio ? '#1f2937' : '#9ca3af',
                                      background: 'white',
                                      boxSizing: 'border-box',
                                    }}
                                  />
                                  {entry.fechaInicio ? (
                                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{fmt(entry.fechaInicio)}</div>
                                  ) : (
                                    <div style={{ fontSize: 10, color: '#b45309', marginTop: 2, fontWeight: 600 }}>Sin fecha</div>
                                  )}
                                </div>

                                {/* Fecha Fin */}
                                <div>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                                    <Calendar size={11} /> Fecha fin
                                  </label>
                                  <input
                                    type="date"
                                    value={entry.fechaFin}
                                    onChange={e => updateEntry(ev.id, 'fechaFin', e.target.value)}
                                    style={{
                                      width: '100%',
                                      padding: '6px 8px',
                                      border: '1px solid #d1d5db',
                                      borderRadius: 6,
                                      fontSize: 13,
                                      color: entry.fechaFin ? '#1f2937' : '#9ca3af',
                                      background: 'white',
                                      boxSizing: 'border-box',
                                    }}
                                  />
                                  {entry.fechaFin ? (
                                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{fmt(entry.fechaFin)}</div>
                                  ) : (
                                    <div style={{ fontSize: 10, color: '#b45309', marginTop: 2, fontWeight: 600 }}>Sin fecha</div>
                                  )}
                                </div>

                                {/* Instructor */}
                                <div>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                                    <User size={11} /> Instructor o área responsable
                                  </label>
                                  <input
                                    type="text"
                                    value={entry.instructor}
                                    onChange={e => updateEntry(ev.id, 'instructor', e.target.value)}
                                    placeholder="Nombre del instructor o área"
                                    style={{
                                      width: '100%',
                                      padding: '6px 10px',
                                      border: '1px solid #d1d5db',
                                      borderRadius: 6,
                                      fontSize: 13,
                                      color: '#1f2937',
                                      background: 'white',
                                      boxSizing: 'border-box',
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

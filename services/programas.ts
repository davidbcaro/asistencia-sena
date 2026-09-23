import {
  CronogramaGeneralEntry, Ficha, GradeActivity, GuiaColumn, PlaneacionSemanalFichaData,
  Programa, ProgramaActividadAprendizaje, ProgramaActividadProyecto, ProgramaEvidencia,
} from '../types';
import { GRD_FASES, GRD_PROGRAMA_ID, GRD_PROGRAMA_NOMBRE } from '../data/programaGRD';
import {
  getProgramasData, saveProgramasData, getFichaProgramas, saveFichaProgramas, getFichas,
  getCronogramaGeneral, saveCronogramaGeneral, getGradeActivities, saveGradeActivities,
  getPlaneacionSemanal, savePlaneacionSemanal, getEvidenceCompMap, saveEvidenceCompMap, updateFicha,
} from './db';
import {
  ExcelEvidencia, ExcelProgramaData, ExcelSemana, FASE_ORDEN, PLANEACION_PHASE_MAP,
  areaForEvidencia, normalize, pad, planeacionRowForArea,
} from './programaImport';

export * from './programaImport';
export { GRD_PROGRAMA_ID };

// ─── Programas (CRUD) ────────────────────────────────────────────────────────

export const PROGRAMA_BASE: Programa = {
  id: GRD_PROGRAMA_ID,
  nombre: GRD_PROGRAMA_NOMBRE,
  fases: GRD_FASES,
  builtin: true,
  createdAt: '2025-09-29T00:00:00.000Z',
  updatedAt: '2025-09-29T00:00:00.000Z',
};

/** Programa base + programas creados por el instructor (sin los eliminados) */
export const getProgramas = (): Programa[] => [
  PROGRAMA_BASE,
  ...Object.values(getProgramasData())
    .filter(p => !p.deleted)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
];

export const getPrograma = (id: string | undefined): Programa | null => {
  if (!id || id === GRD_PROGRAMA_ID) return PROGRAMA_BASE;
  const p = getProgramasData()[id];
  return p && !p.deleted ? p : null;
};

export const savePrograma = (programa: Programa): void => {
  if (programa.builtin) return;
  const all = getProgramasData();
  all[programa.id] = { ...programa, updatedAt: new Date().toISOString() };
  saveProgramasData(all);
};

export const deletePrograma = (id: string): void => {
  const all = getProgramasData();
  if (!all[id]) return;
  all[id] = { ...all[id], deleted: true, fases: [], updatedAt: new Date().toISOString() };
  saveProgramasData(all);
};

export const getProgramaIdForFicha = (fichaId: string): string =>
  getFichaProgramas()[fichaId]?.programaId ?? GRD_PROGRAMA_ID;

/** Programa de la ficha; las fichas sin programa asignado usan el programa base */
export const getProgramaForFicha = (fichaId: string): Programa =>
  getPrograma(getProgramaIdForFicha(fichaId)) ?? PROGRAMA_BASE;

export const setProgramaForFicha = (fichaId: string, programaId: string): void => {
  const all = getFichaProgramas();
  all[fichaId] = { programaId, updatedAt: new Date().toISOString() };
  saveFichaProgramas(all);
};

/** Fichas que usan el programa (para advertir antes de eliminarlo) */
export const countFichasWithPrograma = (programaId: string): number =>
  getFichas().filter(f => getProgramaIdForFicha(f.id) === programaId).length;

/** Las actividades globales de Calificaciones (group === '') son las del programa base.
 *  Una ficha con otro programa solo debe ver sus propias actividades. */
export const fichaUsesGlobalActivities = (fichaCode: string): boolean => {
  const ficha = getFichas().find(f => f.code === fichaCode);
  if (!ficha) return true;
  return getProgramaIdForFicha(ficha.id) === GRD_PROGRAMA_ID;
};

/** Mapa código de evidencia → fase corta ('Análisis', …) */
export const buildEvidenceIndex = (programa: Programa) => {
  const map = new Map<string, { fase: string; ev: ProgramaEvidencia; aa: ProgramaActividadAprendizaje; ap: ProgramaActividadProyecto }>();
  programa.fases.forEach(f => f.actividadesProyecto.forEach(ap => ap.actividades.forEach(aa => aa.evidencias.forEach(ev => {
    map.set(ev.id.toUpperCase(), { fase: f.nombre, ev, aa, ap });
  }))));
  return map;
};

export const countEvidencias = (programa: Programa): number =>
  programa.fases.reduce((s, f) => s + f.actividadesProyecto.reduce((s2, ap) =>
    s2 + ap.actividades.reduce((s3, aa) => s3 + aa.evidencias.length, 0), 0), 0);

// ─── Aplicar un programa a una ficha ─────────────────────────────────────────

export interface FichaSetupReport {
  programa: string;
  totalEvidencias: number;
  conFecha: number;
  sinFecha: number;
  actividadesCreadas: number;
  semanas: number;
  noEnPrograma: string[];     // códigos del Excel de la ficha que el programa no tiene (se omiten)
  fueraDeSemanas: string[];   // con fecha que no cae en ninguna semana lectiva (quedan sin asignar en la planeación)
  advertencias: string[];
}

const MS_DAY = 86_400_000;
const isoToUtc = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const utcToIso = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

/** Semanas lectivas: las de la hoja de planeación, o (si no viene) semanas continuas por el rango de cada fase */
const buildSemanas = (excel: ExcelProgramaData): ExcelSemana[] => {
  if (excel.semanas.length) return excel.semanas;
  const semanas: ExcelSemana[] = [];
  FASE_ORDEN.forEach(fase => {
    const rango = excel.fases[fase];
    if (!rango?.inicio) return;
    const fin = rango.fin ? isoToUtc(rango.fin) : isoToUtc(rango.inicio);
    for (let ms = isoToUtc(rango.inicio); ms <= fin; ms += 7 * MS_DAY) semanas.push({ startIso: utcToIso(ms), fase });
  });
  return semanas;
};

/** Primera fecha de inicio de la planeación semanal (debe coincidir con BASE_DATE_UTC de PlaneacionSemanalView) */
const PLANEACION_BASE_ISO = '2025-09-29';

/**
 * Asigna el programa a la ficha y, con el Excel de la ficha (opcional), genera:
 *  - las fechas e instructores del Cronograma General,
 *  - las actividades de Calificaciones (una por evidencia),
 *  - la Planeación semanal: semanas, guías y cada evidencia con fecha en su semana.
 * Las evidencias sin fecha quedan sin fecha en los cronogramas y en "sin asignar" en la planeación.
 */
export const applyProgramaToFicha = (ficha: Ficha, programa: Programa, excel: ExcelProgramaData | null): FichaSetupReport => {
  const now = new Date().toISOString();
  const index = buildEvidenceIndex(programa);
  const report: FichaSetupReport = {
    programa: programa.nombre, totalEvidencias: index.size, conFecha: 0, sinFecha: 0, actividadesCreadas: 0,
    semanas: 0, noEnPrograma: [], fueraDeSemanas: [], advertencias: [...(excel?.advertencias ?? [])],
  };

  setProgramaForFicha(ficha.id, programa.id);

  // 1) Fechas del Excel de la ficha, por código
  const fechas = new Map<string, ExcelEvidencia>();
  excel?.evidencias.forEach(e => {
    if (!index.has(e.code)) { report.noEnPrograma.push(e.code); return; }
    fechas.set(e.code, e);
  });

  // 2) Cronograma General: fechas + instructor (según el área de la evidencia en el Excel)
  if (excel) {
    const allCron = getCronogramaGeneral();
    const existing = new Map((allCron[ficha.id] ?? []).map(e => [e.id, e]));
    fechas.forEach((e, code) => {
      const prev = existing.get(code);
      const instructor = excel.instructores[normalize(e.areaLabel)] ?? '';
      const entry: CronogramaGeneralEntry = {
        id: code,
        fechaInicio: e.fechaInicio,
        fechaFin: e.fechaFin,
        instructor: instructor || prev?.instructor || '',
      };
      existing.set(code, entry);
    });
    allCron[ficha.id] = Array.from(existing.values());
    saveCronogramaGeneral(allCron);
  }
  index.forEach((_v, code) => { if (fechas.get(code)?.fechaInicio) report.conFecha++; else report.sinFecha++; });

  // 3) Calificaciones: una actividad por evidencia (el programa base usa las actividades globales ya existentes)
  const activityIdByCode = new Map<string, string>();
  if (programa.id !== GRD_PROGRAMA_ID) {
    const all = getGradeActivities();
    const toAdd: GradeActivity[] = [];
    index.forEach(({ fase, ev }, code) => {
      const existing = all.find(a => a.group === ficha.code && a.name.toUpperCase() === code);
      if (existing) { activityIdByCode.set(code, existing.id); return; }
      const id = `prog-${ficha.id}-${code}`;
      activityIdByCode.set(code, id);
      toAdd.push({
        id, name: code, detail: ev.descripcion, group: ficha.code,
        phase: PLANEACION_PHASE_MAP[fase] ?? 'Fase 1: Análisis', maxScore: 100, createdAt: now,
      });
    });
    if (toAdd.length) saveGradeActivities([...all, ...toAdd]);
    report.actividadesCreadas = toAdd.length;

    // Competencia / RAP de cada evidencia para los encabezados agrupados de Calificaciones
    const compMap = getEvidenceCompMap();
    index.forEach(({ fase, aa }, code) => {
      const key = `${ficha.code}::${PLANEACION_PHASE_MAP[fase]}`;
      const comp = code.match(/G[AI]\d+-(\d+)-/i)?.[1] ?? '';
      if (!comp) return;
      const entry = compMap[key] ?? { byEvKey: {}, compOrder: [] };
      entry.byEvKey[normalize(code)] = {
        competenciaCode: comp,
        competenciaName: comp,
        aaKey: code.match(/AA\d+/i)?.[0].toUpperCase() ?? '',
        aaName: aa.rapTitulo || aa.titulo || aa.codigo,
      };
      if (!entry.compOrder.includes(comp)) entry.compOrder.push(comp);
      compMap[key] = entry;
    });
    saveEvidenceCompMap(compMap);
  }

  // 4) Planeación semanal
  if (excel) {
    const semanas = buildSemanas(excel);
    report.semanas = semanas.length;
    if (semanas.length) {
      const allPlan = getPlaneacionSemanal();
      const prev: PlaneacionSemanalFichaData = allPlan[ficha.id] ?? {
        tecnicaAssignments: {}, transversalAssignments: {}, transversalCells: {},
        cardDurations: {}, hiddenCards: [], weekDateOverrides: {}, phaseWeekCounts: {},
      };

      // Semanas por fase (una fase ausente conserva 1 semana vacía para no romper la rejilla)
      const phaseWeekCounts: Record<string, number> = {};
      FASE_ORDEN.forEach(f => {
        phaseWeekCounts[PLANEACION_PHASE_MAP[f]] = Math.max(1, semanas.filter(s => s.fase === f).length);
      });
      // Índice de cada semana del Excel dentro de la rejilla y fecha de cada columna de la rejilla
      const gridIdx: number[] = [];
      const gridDates: string[] = [];
      FASE_ORDEN.forEach(f => {
        const own = semanas.map((s, i) => ({ s, i })).filter(x => x.s.fase === f);
        if (own.length === 0) {
          const last = gridDates[gridDates.length - 1];
          gridDates.push(last ? utcToIso(isoToUtc(last) + 7 * MS_DAY) : semanas[0].startIso);
          return;
        }
        own.forEach(x => { gridIdx[x.i] = gridDates.length; gridDates.push(x.s.startIso); });
      });
      // Se ancla la semana 0 y cada salto de fechas (vacaciones) con un override
      const remappedOverrides: Record<number, string> = {};
      gridDates.forEach((iso, g) => {
        const expected = g === 0 ? PLANEACION_BASE_ISO : utcToIso(isoToUtc(gridDates[g - 1]) + 7 * MS_DAY);
        if (iso !== expected) remappedOverrides[g] = iso;
      });

      const findWeek = (iso: string): number => {
        const t = isoToUtc(iso);
        const i = semanas.findIndex(s => t >= isoToUtc(s.startIso) && t <= isoToUtc(s.startIso) + 6 * MS_DAY);
        return i >= 0 ? gridIdx[i] : -1;
      };

      const tecnicaAssignments = { ...prev.tecnicaAssignments };
      const transversalAssignments = { ...(prev.transversalAssignments ?? {}) };
      const cardDurations = { ...(prev.cardDurations ?? {}) };
      fechas.forEach((e, code) => {
        const actId = programa.id === GRD_PROGRAMA_ID ? `seed-${code}` : activityIdByCode.get(code);
        if (!actId || !e.fechaInicio) return;
        const w = findWeek(e.fechaInicio);
        delete tecnicaAssignments[actId];
        delete transversalAssignments[actId];
        if (w < 0) { report.fueraDeSemanas.push(code); return; }
        const row = planeacionRowForArea(e.area ?? areaForEvidencia(index.get(code)!.ev));
        if (row === 'Técnica') tecnicaAssignments[actId] = w;
        else transversalAssignments[actId] = { rowKey: row, weekIdx: w };
        if (e.fechaFin && isoToUtc(e.fechaFin) - isoToUtc(e.fechaInicio) >= 13 * MS_DAY) cardDurations[`act::${actId}`] = 2;
      });

      const guiaColumns: GuiaColumn[] = excel.guias.map((g, i) => ({
        id: `guia_${Date.now()}_${i}`,
        name: g.name,
        vIdx: 2000 + i,
        insertAfterWeekIdx: g.afterWeekIdx < 0 ? -1 : gridIdx[g.afterWeekIdx],
        phase: PLANEACION_PHASE_MAP[g.fase],
      }));

      allPlan[ficha.id] = {
        ...prev,
        tecnicaAssignments,
        transversalAssignments,
        cardDurations,
        weekDateOverrides: remappedOverrides,
        phaseWeekCounts,
        guiaColumns: guiaColumns.length ? guiaColumns : prev.guiaColumns,
        guiaVIdxCounter: guiaColumns.length ? 2000 + guiaColumns.length : prev.guiaVIdxCounter,
        updatedAt: now,
      };
      savePlaneacionSemanal(allPlan);

      // Fechas generales de la ficha si no estaban diligenciadas
      const inicio = semanas[0].startIso;
      const fin = excel.fases['Evaluación']?.fin || utcToIso(isoToUtc(semanas[semanas.length - 1].startIso) + 6 * MS_DAY);
      if (!ficha.cronogramaStartDate || !ficha.cronogramaEndDate) {
        updateFicha({
          ...ficha,
          cronogramaStartDate: ficha.cronogramaStartDate || inicio,
          cronogramaEndDate: ficha.cronogramaEndDate || fin,
        });
      }
    }
  }

  return report;
};

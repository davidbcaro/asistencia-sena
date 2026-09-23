import * as XLSX from 'xlsx';
import {
  AreaKey, ProgramaActividadProyecto, ProgramaEvidencia, ProgramaFase, TipoEvidencia,
} from '../types';

// ─── Fases estándar ──────────────────────────────────────────────────────────

/** Nombre corto de fase (Cronograma General) → nombre de fase en Calificaciones / Planeación semanal */
export const PLANEACION_PHASE_MAP: Record<string, string> = {
  'Inducción':  'Fase Inducción',
  'Análisis':   'Fase 1: Análisis',
  'Planeación': 'Fase 2: Planeación',
  'Ejecución':  'Fase 3: Ejecución',
  'Evaluación': 'Fase 4: Evaluación',
};

export const FASE_ORDEN = ['Inducción', 'Análisis', 'Planeación', 'Ejecución', 'Evaluación'] as const;

const FASE_COLORES: Record<string, { color: string; textColor: string }> = {
  'Inducción':  { color: '#f59e0b', textColor: '#ffffff' },
  'Análisis':   { color: '#0d9488', textColor: '#ffffff' },
  'Planeación': { color: '#3b82f6', textColor: '#ffffff' },
  'Ejecución':  { color: '#8b5cf6', textColor: '#ffffff' },
  'Evaluación': { color: '#ef4444', textColor: '#ffffff' },
};

export const normalize = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** "FASE 1: ANÁLISIS" / "ANÁLISIS" / "Fase Inducción" → 'Análisis' / 'Inducción'; null si no es una fase */
export const canonicalFase = (text: string): string | null => {
  const n = normalize(text);
  if (n.includes('induc')) return 'Inducción';
  if (n.includes('analisis')) return 'Análisis';
  if (n.includes('planeacion')) return 'Planeación';
  if (n.includes('ejecucion')) return 'Ejecución';
  if (n.includes('evaluacion')) return 'Evaluación';
  return null;
};

// ─── Áreas ───────────────────────────────────────────────────────────────────

/** Etiqueta de área del Excel (columna TIPO) → AreaKey */
export const areaFromLabel = (label: string): AreaKey | null => {
  const n = normalize(label).replace(/[^a-z ]/g, '');
  if (!n) return null;
  if (n.startsWith('tecnica')) return 'Técnica';
  if (n.startsWith('tic')) return 'TICs';
  if (n.startsWith('biling') || n.startsWith('ingles')) return 'Bilingüismo';
  if (n.startsWith('matem')) return 'Matemáticas';
  if (n.startsWith('comunic') || n.startsWith('etica') || n.startsWith('derecho')) return 'Comunicación';
  if (n.startsWith('investig')) return 'Investigación';
  if (n.startsWith('ambiente') || n.includes('sst')) return 'Ambiente';
  if (n.startsWith('emprend')) return 'Emprendimiento';
  if (n.startsWith('edu') || n.includes('fisica')) return 'EducaciónFísica';
  if (n.startsWith('ciencia')) return 'CienciasNaturales';
  if (n.startsWith('induc')) return 'EEF';
  return null;
};

/** Competencias transversales conocidas → área (fallback cuando la evidencia no trae área explícita) */
const COMPETENCY_TO_AREA: Record<string, AreaKey> = {
  '220501046': 'TICs',
  '240202501': 'Bilingüismo',
  '240201528': 'Matemáticas',
  '240201524': 'Comunicación',
  '210201501': 'Comunicación',
  '240201526': 'Comunicación',
  '240201064': 'Investigación',
  '220601501': 'Ambiente',
  '240201529': 'Emprendimiento',
  '240201533': 'Emprendimiento',
  '230101507': 'EducaciónFísica',
  '220201501': 'CienciasNaturales',
};

export const areaForEvidencia = (ev: ProgramaEvidencia): AreaKey => {
  if (ev.area) return ev.area;
  const m = ev.id.match(/G[AI]\d+-(\d+)-/i);
  return (m && COMPETENCY_TO_AREA[m[1]]) || 'Técnica';
};

/** Fila de la planeación semanal donde va una evidencia de esa área */
export const planeacionRowForArea = (area: AreaKey): string =>
  area === 'EEF' ? 'Técnica' : area;

// ─── Lectura del Excel (hoja EVIDENCIAS + hoja de planeación) ────────────────

const EVIDENCE_CODE_RE = /^(G[AI]\d+-\d+-)?AA\d+-EV\d+$/i;

export interface ExcelEvidencia {
  code: string;
  descripcion: string;
  areaLabel: string;
  area: AreaKey | null;
  fase: string;
  fechaInicio: string; // YYYY-MM-DD o ''
  fechaFin: string;
}

export interface ExcelSemana { startIso: string; fase: string }
export interface ExcelGuia { name: string; afterWeekIdx: number; fase: string }

export interface ExcelProgramaData {
  evidencias: ExcelEvidencia[];
  /** fase corta → rango de fechas declarado en la fila de la fase */
  fases: Record<string, { inicio: string; fin: string }>;
  /** etiqueta de área normalizada → instructor */
  instructores: Record<string, string>;
  /** Semanas lectivas de la hoja de planeación (vacío si el Excel no la trae) */
  semanas: ExcelSemana[];
  guias: ExcelGuia[];
  advertencias: string[];
}

export const pad = (n: number) => String(n).padStart(2, '0');

/** Celda de Excel → YYYY-MM-DD ('' si no es fecha) */
const cellToIso = (v: unknown): string => {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : '';
  }
  if (typeof v === 'string') {
    const s = v.trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  }
  return '';
};

const cellText = (v: unknown): string => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

const parseEvidenciasSheet = (ws: XLSX.WorkSheet, out: ExcelProgramaData) => {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });

  // Encabezado: fila con "EVIDENCIA" y "CÓDIGO"
  let headerIdx = -1;
  let col = { desc: -1, code: -1, tipo: -1, inicio: -1, fin: -1 };
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cells = (rows[r] ?? []).map(c => normalize(cellText(c)));
    const code = cells.findIndex(c => c.startsWith('codigo'));
    const desc = cells.findIndex(c => c === 'evidencia' || c === 'evidencias' || c.startsWith('evidencia '));
    if (code >= 0 && desc >= 0) {
      headerIdx = r;
      col = {
        desc, code,
        tipo: cells.findIndex(c => c === 'tipo' || c.startsWith('tipo ') || c === 'area'),
        inicio: cells.findIndex(c => c.includes('inicio')),
        fin: cells.findIndex(c => c.includes('final') || c === 'fecha fin' || c.includes('fin')),
      };
      break;
    }
  }
  if (headerIdx < 0) {
    out.advertencias.push('No se encontró el encabezado de evidencias (columnas "EVIDENCIA" y "CÓDIGO").');
    return;
  }

  let faseActual: string | null = null;
  let terminado = false; // tras la fila TOTAL solo se busca la tabla de instructores (LEYENDA)
  const seen = new Set<string>();
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const first = cellText(row[0]);
    const firstN = normalize(first);
    if (firstN === 'leyenda') { parseInstructores(rows, r, out); break; }
    if (firstN === 'total') terminado = true;
    if (terminado) continue;
    const fase = /^fase\b/.test(firstN) || firstN.includes('induccion') ? canonicalFase(first) : null;
    if (fase) {
      faseActual = fase;
      out.fases[fase] = { inicio: cellToIso(row[col.inicio]), fin: cellToIso(row[col.fin]) };
      continue;
    }
    const code = cellText(row[col.code]).toUpperCase();
    if (!EVIDENCE_CODE_RE.test(code)) continue;
    if (!faseActual) {
      out.advertencias.push(`${code}: aparece antes de cualquier fila de FASE y se omitió.`);
      continue;
    }
    if (seen.has(code)) {
      out.advertencias.push(`${code}: está repetida en el Excel; se tomó la primera aparición.`);
      continue;
    }
    seen.add(code);
    const areaLabel = col.tipo >= 0 ? cellText(row[col.tipo]) : '';
    const fechaInicio = col.inicio >= 0 ? cellToIso(row[col.inicio]) : '';
    const fechaFin = col.fin >= 0 ? cellToIso(row[col.fin]) : '';
    out.evidencias.push({
      code,
      descripcion: cellText(row[col.desc]).replace(/\.$/, ''),
      areaLabel,
      area: areaFromLabel(areaLabel),
      fase: faseActual,
      fechaInicio,
      fechaFin: fechaFin || '',
    });
  }
};

/** Tabla "LEYENDA | … | INSTRUCTOR | CORREO" al final de la hoja EVIDENCIAS */
const parseInstructores = (rows: unknown[][], leyendaIdx: number, out: ExcelProgramaData) => {
  const header = (rows[leyendaIdx] ?? []).map(c => normalize(cellText(c)));
  const instCol = header.findIndex(c => c === 'instructor' || c.startsWith('instructor'));
  if (instCol < 0) return;
  for (let r = leyendaIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (normalize(cellText(row[0])) === 'total') break;
    const label = row.slice(0, instCol).map(cellText).find(t => t && isNaN(Number(t)));
    const inst = cellText(row[instCol]);
    if (label && inst) out.instructores[normalize(label)] = inst;
  }
};

/** Hoja tipo matriz: fila de fases ("FASE …"), fila de encabezados (S1, GUÍA 1…), fila "FECHA INICIO" */
const parsePlaneacionSheet = (ws: XLSX.WorkSheet, out: ExcelProgramaData): boolean => {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
  const fechaIdx = rows.findIndex(r => normalize(cellText(r?.[0])) === 'fecha inicio');
  if (fechaIdx < 1) return false;
  const faseIdx = rows.slice(0, fechaIdx).findIndex(r => (r ?? []).some(c => /^fase\b/.test(normalize(cellText(c)))));
  if (faseIdx < 0) return false;
  const faseRow = rows[faseIdx] ?? [];
  const labelRow = rows[fechaIdx - 1] ?? [];
  const fechaRow = rows[fechaIdx] ?? [];

  let fase: string | null = null;
  const semanas: ExcelSemana[] = [];
  const guias: ExcelGuia[] = [];
  const width = Math.max(faseRow.length, fechaRow.length);
  for (let c = 1; c < width; c++) {
    const header = cellText(faseRow[c]);
    if (header) {
      if (normalize(header).includes('productiva')) break; // etapa productiva: fuera de la lectiva
      fase = canonicalFase(header) ?? fase;
    }
    if (!fase) continue;
    const iso = cellToIso(fechaRow[c]);
    if (iso) { semanas.push({ startIso: iso, fase }); continue; }
    const label = cellText(labelRow[c]);
    if (/^gu[ií]a\b/i.test(label)) {
      guias.push({ name: label.replace(/^gu[ií]a/i, 'Guía'), afterWeekIdx: semanas.length - 1, fase });
    }
  }
  if (semanas.length === 0) return false;
  out.semanas = semanas;
  out.guias = guias;
  return true;
};

export const parseProgramaExcel = (buffer: ArrayBuffer): ExcelProgramaData => {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const out: ExcelProgramaData = { evidencias: [], fases: {}, instructores: {}, semanas: [], guias: [], advertencias: [] };
  const evSheet = wb.SheetNames.find(n => normalize(n).includes('evidencia')) ?? wb.SheetNames[0];
  parseEvidenciasSheet(wb.Sheets[evSheet], out);
  for (const name of wb.SheetNames) {
    if (name === evSheet) continue;
    if (parsePlaneacionSheet(wb.Sheets[name], out)) break;
  }
  return out;
};

// ─── Lectura de la plantilla HTML del cronograma general ─────────────────────

export interface HtmlEvidencia {
  code: string;
  tipo?: TipoEvidencia;
  descripcion: string;
  fase: string | null;
  apCodigo: string;
  apTitulo: string;
  aaCodigo: string;
  aaTitulo: string;
  rap: string;
  rapTitulo: string;
}

const htmlCellText = (el: Element | undefined): string =>
  el ? (el.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim() : '';

/** Lee la tabla (con rowspan) de la plantilla: Fase | Actividad de proyecto | Actividad de aprendizaje | RAP | Evidencias */
export const parseCronogramaHtml = (html: string): { evidencias: HtmlEvidencia[]; advertencias: string[] } => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const advertencias: string[] = [];
  const table = Array.from(doc.querySelectorAll('table')).find(t => normalize(t.textContent ?? '').includes('nombre de la fase'));
  if (!table) return { evidencias: [], advertencias: ['La plantilla HTML no tiene la tabla con "NOMBRE DE LA FASE".'] };

  // Rejilla que resuelve rowspan/colspan: grid[fila][columna] = celda
  const trs = Array.from(table.querySelectorAll('tr'));
  const grid: Element[][] = [];
  trs.forEach((tr, r) => {
    grid[r] = grid[r] ?? [];
    let c = 0;
    Array.from(tr.children).filter(el => el.tagName === 'TD' || el.tagName === 'TH').forEach(cell => {
      while (grid[r][c]) c++;
      const rs = Math.max(1, parseInt(cell.getAttribute('rowspan') ?? '1', 10) || 1);
      const cs = Math.max(1, parseInt(cell.getAttribute('colspan') ?? '1', 10) || 1);
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) {
        grid[r + i] = grid[r + i] ?? [];
        grid[r + i][c + j] = cell;
      }
      c += cs;
    });
  });

  const headerRow = grid.findIndex(row => row.some(cell => normalize(htmlCellText(cell)) === 'nombre de la fase'));
  const findCol = (pred: (t: string) => boolean) =>
    grid[headerRow].findIndex(cell => pred(normalize(htmlCellText(cell))));
  const col = {
    fase: findCol(t => t.includes('nombre de la fase')),
    ap: findCol(t => t.includes('actividad del proyecto') || t.includes('actividad de proyecto')),
    aa: findCol(t => t.includes('actividad de aprendizaje') || t.includes('actividades de aprendizaje')),
    rap: findCol(t => t.includes('resultado')),
    ev: findCol(t => t.startsWith('evidencia')),
  };
  if (Object.values(col).some(v => v < 0)) {
    return { evidencias: [], advertencias: ['La plantilla HTML no tiene todas las columnas esperadas (fase, actividad de proyecto, actividad de aprendizaje, resultado, evidencias).'] };
  }

  const evidencias: HtmlEvidencia[] = [];
  const seen = new Set<string>();
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const evText = htmlCellText(row[col.ev]);
    const codeMatch = evText.match(/((?:G[AI]\d+-\d+-)?AA\d+-EV\d+)/i);
    if (!codeMatch) continue;
    const code = codeMatch[1].toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);

    const tipoMatch = evText.match(/evidencia\s+de\s+(conocimiento|producto|desempe[nñ]o)/i);
    const tipo = tipoMatch
      ? (normalize(tipoMatch[1]).startsWith('desempe') ? 'desempeño' : normalize(tipoMatch[1])) as TipoEvidencia
      : undefined;
    const descripcion = evText
      .slice(evText.indexOf(codeMatch[1]) + codeMatch[1].length)
      .replace(/\s*(no\s+)?calificable\s*\.?\s*$/i, '')
      .replace(/^\s*[.:\-–]\s*/, '')
      .replace(/\s+\./g, '.')
      .replace(/\.$/, '')
      .trim();

    const apText = htmlCellText(row[col.ap]);
    const aaText = htmlCellText(row[col.aa]);
    const rapText = htmlCellText(row[col.rap]);
    const apCod = apText.match(/^(AP\s*\d+)/i)?.[1].replace(/\s+/g, '').toUpperCase() ?? '';
    const aaCod = aaText.match(/^((?:G[AI]\d+-\d+-)?AA\d+)/i)?.[1].toUpperCase() ?? code.replace(/-EV\d+$/i, '');
    const rapCod = rapText.match(/^(\d{6,}-\d+)/)?.[1] ?? '';
    evidencias.push({
      code,
      tipo,
      descripcion,
      fase: canonicalFase(htmlCellText(row[col.fase])),
      apCodigo: apCod,
      apTitulo: apText,
      aaCodigo: aaCod,
      aaTitulo: aaText.replace(/\s+\./g, '.'),
      rap: rapCod,
      rapTitulo: rapText,
    });
  }
  if (evidencias.length === 0) advertencias.push('La plantilla HTML no tiene evidencias con código reconocible.');
  return { evidencias, advertencias };
};

// ─── Construcción del programa ───────────────────────────────────────────────

export interface ProgramaBuildReport {
  totalEvidencias: number;
  porFase: Record<string, number>;
  sinPlantilla: string[];      // en el Excel pero no en la plantilla HTML (sin títulos de AP/AA/RAP)
  soloEnPlantilla: string[];   // en la plantilla pero no en el Excel (omitidas)
  faseDistinta: string[];      // la plantilla las ubica en otra fase (se respeta el Excel)
  sinArea: string[];           // el Excel no trae área reconocible (se deduce del código)
  advertencias: string[];
}

/** Arma las fases del programa: la lista de evidencias y su fase salen del Excel;
 *  los títulos de actividad de proyecto, actividad de aprendizaje, RAP y el tipo de evidencia salen de la plantilla. */
export const buildProgramaFases = (
  excel: ExcelProgramaData,
  plantilla: { evidencias: HtmlEvidencia[]; advertencias: string[] } | null,
): { fases: ProgramaFase[]; report: ProgramaBuildReport } => {
  const report: ProgramaBuildReport = {
    totalEvidencias: 0, porFase: {}, sinPlantilla: [], soloEnPlantilla: [], faseDistinta: [], sinArea: [],
    advertencias: [...excel.advertencias, ...(plantilla?.advertencias ?? [])],
  };
  const htmlByCode = new Map((plantilla?.evidencias ?? []).map(e => [e.code, e]));
  const htmlOrder = new Map((plantilla?.evidencias ?? []).map((e, i) => [e.code, i]));
  const excelCodes = new Set(excel.evidencias.map(e => e.code));
  if (plantilla) {
    report.soloEnPlantilla = plantilla.evidencias.filter(e => !excelCodes.has(e.code)).map(e => e.code);
  }

  const fases: ProgramaFase[] = [];
  const faseNames = FASE_ORDEN.filter(f => excel.evidencias.some(e => e.fase === f));
  faseNames.forEach(faseName => {
    const evs = excel.evidencias
      .filter(e => e.fase === faseName)
      .map((e, i) => ({ e, h: htmlByCode.get(e.code), order: htmlOrder.get(e.code) ?? 100000 + i }))
      .sort((a, b) => a.order - b.order);

    const aps: ProgramaActividadProyecto[] = [];
    const apFor = (codigo: string, titulo: string) => {
      let ap = aps.find(a => a.codigo === codigo);
      if (!ap) { ap = { codigo, titulo, actividades: [] }; aps.push(ap); }
      return ap;
    };

    evs.forEach(({ e, h }) => {
      if (!e.area) report.sinArea.push(e.code);
      if (plantilla && !h) report.sinPlantilla.push(e.code);
      if (h?.fase && h.fase !== faseName) report.faseDistinta.push(`${e.code} (Excel: ${faseName}, plantilla: ${h.fase})`);

      const esInduccion = faseName === 'Inducción';
      const ap = h?.apCodigo
        ? apFor(h.apCodigo, h.apTitulo)
        : esInduccion
          ? apFor('AP-IND', 'Inducción al programa de formación')
          : apFor('AP-SIN', 'Evidencias sin actividad de proyecto en la plantilla');
      const aaCodigo = h?.aaCodigo ?? e.code.replace(/-EV\d+$/i, '');
      let aa = ap.actividades.find(a => a.codigo === aaCodigo);
      if (!aa) {
        aa = {
          codigo: aaCodigo,
          titulo: h?.aaTitulo || aaCodigo,
          rap: h?.rap ?? '',
          rapTitulo: h?.rapTitulo ?? '',
          evidencias: [],
        };
        ap.actividades.push(aa);
      }
      aa.evidencias.push({
        id: e.code,
        tipo: h?.tipo ?? (esInduccion ? 'inducción' : undefined),
        area: e.area ?? undefined,
        descripcion: h?.descripcion || e.descripcion,
      });
      report.totalEvidencias++;
      report.porFase[faseName] = (report.porFase[faseName] ?? 0) + 1;
    });

    fases.push({ nombre: faseName, ...FASE_COLORES[faseName], actividadesProyecto: aps });
  });

  return { fases, report };
};


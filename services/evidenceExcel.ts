import * as XLSX from 'xlsx';

/**
 * Lectura de un Excel de seguimiento de evidencias:
 * columnas de identificación del aprendiz (nombres, apellidos, documento, ficha, correo)
 * + una columna por evidencia con A (aprobada), D (desaprobada) o - (sin entregar).
 */

/** Estado normalizado de una celda de evidencia. */
export type EvidenceMark = 'A' | 'D' | 'FALTA' | 'VACIA' | 'OTRO';

/** Marcas que se consideran "pendiente" y se listan en el correo. */
export type PendingMarks = { falta: boolean; desaprobada: boolean; vacia: boolean };

export const DEFAULT_PENDING_MARKS: PendingMarks = {
  falta: true,
  desaprobada: true,
  vacia: false,
};

export type MetaKey = 'nombres' | 'apellidos' | 'nombreCompleto' | 'documento' | 'ficha' | 'correo';

/** Índice de columna por campo; -1 = no detectada. */
export type MetaColumns = Record<MetaKey, number>;

export interface EvidenceColumn {
  index: number;
  /** Encabezado tal cual viene en el Excel. */
  raw: string;
  /** Encabezado limpio (sin el prefijo "Evidencia de conocimiento:", etc.). */
  label: string;
}

export interface SheetData {
  headers: string[];
  dataRows: unknown[][];
  headerRowIndex: number;
}

export interface ParsedWorkbook {
  sheetNames: string[];
  sheetIndex: number;
  sheet: SheetData;
  meta: MetaColumns;
  evidenceColumns: EvidenceColumn[];
}

export interface ApprenticeRow {
  id: string;
  nombres: string;
  apellidos: string;
  fullName: string;
  documento: string;
  ficha: string;
  correo: string;
  /** índice de columna → marca normalizada */
  marks: Record<number, EvidenceMark>;
}

export const EMPTY_META: MetaColumns = {
  nombres: -1,
  apellidos: -1,
  nombreCompleto: -1,
  documento: -1,
  ficha: -1,
  correo: -1,
};

/** minúsculas y sin tildes, para comparar encabezados. */
export function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeMark(value: unknown): EvidenceMark {
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return 'VACIA';
  if (s === 'A' || s.startsWith('APROB')) return 'A';
  if (s === 'D' || s.startsWith('DESAPROB') || s.startsWith('NO APROB') || s.startsWith('REPROB')) return 'D';
  if (
    s === '-' || s === '–' || s === '—' || s === '_' || s === 'X' ||
    s.startsWith('FALTA') || s.startsWith('PEND') || s.startsWith('SIN ENTREG') || s.startsWith('NO ENTREG')
  ) {
    return 'FALTA';
  }
  return 'OTRO';
}

export function isPendingMark(mark: EvidenceMark, pending: PendingMarks): boolean {
  if (mark === 'FALTA') return pending.falta;
  if (mark === 'D') return pending.desaprobada;
  if (mark === 'VACIA') return pending.vacia;
  return false;
}

/** Quita prefijos institucionales y espacios sobrantes del nombre de la evidencia. */
export function cleanEvidenceLabel(raw: string): string {
  return String(raw ?? '')
    .replace(/^\s*evidencia\s+de\s+(?:conocimiento|producto|desempe[ñn]o)\s*:?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADER_HINTS = [
  'nombre',
  'apellido',
  'identificac',
  'documento',
  'cedula',
  'aprendiz',
  'ficha',
  'correo',
];

/** Los reportes suelen traer título/logos antes de la tabla: busca la fila de encabezados. */
function findHeaderRowIndex(rows: unknown[][]): number {
  let best = 0;
  let bestScore = 0;
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] || []).map(normalizeHeader);
    const filled = cells.filter(Boolean).length;
    if (filled < 2) continue;
    const hits = cells.filter((c) => HEADER_HINTS.some((h) => c.includes(h))).length;
    const score = hits + filled * 0.05;
    if (hits > 0 && score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function detectMetaColumns(headers: string[]): MetaColumns {
  const norm = headers.map(normalizeHeader);
  const find = (pred: (h: string) => boolean) => norm.findIndex((h) => h && pred(h));

  const nombreCompleto = find(
    (h) =>
      h.includes('nombre completo') ||
      h.includes('nombres y apellidos') ||
      h.includes('nombre del aprendiz') ||
      h === 'aprendiz' ||
      h === 'nombre aprendiz' ||
      h === 'nombre y apellidos'
  );
  const apellidos = find((h) => h.includes('apellido'));
  const nombres = find(
    (h) =>
      h !== '' &&
      (h === 'nombre' || h === 'nombres' || (h.includes('nombre') && !h.includes('apellido') && !h.includes('usuario') && !h.includes('programa') && !h.includes('completo')))
  );
  const documento = find(
    (h) =>
      h.includes('identificac') ||
      h.includes('documento') ||
      h.includes('cedula') ||
      h === 'doc' ||
      h === 'no. id' ||
      h === 'id'
  );
  const ficha = find((h) => h.includes('ficha') || h === 'grupo' || h.includes('no. ficha'));
  const correo = find((h) => h.includes('correo') || h.includes('email') || h.includes('e-mail'));

  return {
    nombreCompleto,
    nombres: nombres === nombreCompleto ? -1 : nombres,
    apellidos,
    documento,
    ficha,
    correo,
  };
}

/** Columnas con encabezado que contienen marcas A/D/- en los datos. */
function detectEvidenceColumns(
  headers: string[],
  dataRows: unknown[][],
  meta: MetaColumns
): EvidenceColumn[] {
  const taken = new Set(Object.values(meta).filter((i) => i >= 0));
  const cols: EvidenceColumn[] = [];
  headers.forEach((raw, index) => {
    if (taken.has(index)) return;
    const header = String(raw ?? '').trim();
    if (!header) return;
    let marks = 0;
    for (const row of dataRows) {
      const m = normalizeMark(row?.[index]);
      if (m === 'A' || m === 'D' || m === 'FALTA') marks++;
      if (marks >= 1) break;
    }
    if (marks === 0) return;
    cols.push({ index, raw: header, label: cleanEvidenceLabel(header) || header });
  });
  return cols;
}

/** Lee la hoja indicada del libro y detecta encabezados, columnas meta y evidencias. */
export function parseSheet(workbook: XLSX.WorkBook, sheetIndex: number): ParsedWorkbook {
  const sheetNames = workbook.SheetNames;
  const name = sheetNames[sheetIndex] ?? sheetNames[0];
  const sheet = workbook.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    // se conservan las filas vacías para que headerRowIndex coincida con la fila real de la hoja
    blankrows: true,
  }) as unknown[][];

  const headerRowIndex = findHeaderRowIndex(rows);
  const headers = (rows[headerRowIndex] || []).map((h) => String(h ?? '').trim());
  const dataRows = rows
    .slice(headerRowIndex + 1)
    .filter((r) => (r || []).some((c) => String(c ?? '').trim() !== ''));

  const meta = detectMetaColumns(headers);
  const evidenceColumns = detectEvidenceColumns(headers, dataRows, meta);

  return {
    sheetNames,
    sheetIndex: sheetNames.indexOf(name),
    sheet: { headers, dataRows, headerRowIndex },
    meta,
    evidenceColumns,
  };
}

const cell = (row: unknown[], index: number): string =>
  index >= 0 ? String(row?.[index] ?? '').replace(/\s+/g, ' ').trim() : '';

/** Convierte las filas de datos en aprendices, con las marcas de las columnas indicadas. */
export function buildApprenticeRows(
  sheet: SheetData,
  meta: MetaColumns,
  evidenceColumns: EvidenceColumn[],
  opts: { uppercaseNames: boolean }
): ApprenticeRow[] {
  return sheet.dataRows
    .map((row, i) => {
      const nombres = cell(row, meta.nombres);
      const apellidos = cell(row, meta.apellidos);
      const completo = cell(row, meta.nombreCompleto);
      const joined = completo || [nombres, apellidos].filter(Boolean).join(' ');
      const fullName = opts.uppercaseNames ? joined.toUpperCase() : joined;
      const marks: Record<number, EvidenceMark> = {};
      evidenceColumns.forEach((c) => {
        marks[c.index] = normalizeMark(row?.[c.index]);
      });
      return {
        id: `fila-${i}`,
        nombres,
        apellidos,
        fullName,
        documento: cell(row, meta.documento),
        ficha: cell(row, meta.ficha),
        correo: cell(row, meta.correo),
        marks,
      };
    })
    .filter((r) => r.fullName !== '' || r.documento !== '');
}

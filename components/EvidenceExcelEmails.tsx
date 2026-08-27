import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  ChevronLeft,
  ChevronRight,
  Copy,
  Send,
  RefreshCw,
  CheckCircle,
  ListChecks,
  Search,
  Save,
  RotateCcw,
  Users,
  Columns3,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import emailjs from '@emailjs/browser';
import { getEmailSettings, getStudents } from '../services/db';
import type { Student } from '../types';
import {
  applyInlineMarkdown,
  buildEmailHtml,
  escapeHtml,
  htmlToPlainText,
} from '../services/emailFormat';
import {
  buildApprenticeRows,
  DEFAULT_PENDING_MARKS,
  EMPTY_META,
  isPendingMark,
  parseSheet,
  type ApprenticeRow,
  type EvidenceColumn,
  type EvidenceMark,
  type MetaColumns,
  type MetaKey,
  type PendingMarks,
  type SheetData,
} from '../services/evidenceExcel';

const TEMPLATE_KEY = 'asistenciapro_evidence_excel_template_v2';
const SETTINGS_KEY = 'asistenciapro_evidence_excel_settings';

const DEFAULT_SUBJECT = 'Primer Llamado de Atención – Ficha {ficha} – {nombre}';

const DEFAULT_BODY = `{fecha}

Respetado aprendiz,

**{nombre}**
{identificacion}
{correo}
Programa: {programa}
Ficha: {ficha}

Estimado(a) aprendiz,

Por medio de la presente, se le notifica de manera formal que se ha identificado un incumplimiento en su ruta de aprendizaje al no presentar las evidencias correspondientes a los plazos establecidos en el cronograma académico.

Específicamente, se registra la falta de entrega o aprobación en las siguientes actividades y evidencias de aprendizaje:

{evidencias}

Este incumplimiento constituye una infracción a los deberes que usted adquirió al matricularse en la entidad, de acuerdo con lo consagrado en el Acuerdo 009 de 2024 (Reglamento del Aprendiz SENA). A continuación, se detallan las normas aplicables:

**Artículo 8°. Deberes del Aprendiz SENA (Numeral 6):** "Cumplir con todas las actividades de su proceso formativo, presentando las evidencias según la planeación pedagógica, guías de aprendizaje y cronograma, en los plazos o en la oportunidad que estas deban presentarse o reportarse, a través de los medios dispuestos para ello."

**Artículo 27°. Cumplimiento satisfactorio del proceso formativo:** "Se configura cuando el aprendiz presenta evidencias de aprendizaje, idóneas y pertinentes, en las fechas establecidas, asiste y participa activamente en actividades presenciales o virtuales concertadas en su ruta de aprendizaje. Se configura como un incumplimiento la falta de ejecución de lo anteriormente definido. Los incumplimientos se catalogan en incumplimientos justificados y no justificados."

**Artículo 46°. Tipos de medidas formativas (Numeral 1, Literal a - Llamado de atención académico):** "Los llamados de atención deben ser por escrito, el aprendiz puede recibir hasta dos (2) llamados de atención por fase del proyecto formativo, por parte de los instructores integrantes del equipo ejecutor, para alcanzar el o los resultados de aprendizaje."

Tenga en cuenta que, en caso de persistir el incumplimiento de sus compromisos académicos tras agotarse los dos llamados de atención escritos, se procederá a la asignación de un Plan de Mejoramiento Académico como medida formativa obligatoria para salvaguardar su permanencia, o en su defecto, el caso será remitido ante el Comité de Evaluación y Seguimiento.

**OPORTUNIDAD DE ENTREGA:** Se le concede término ampliado hasta el {fecha_limite} para que proceda con la entrega de las evidencias requeridas. En caso de incumplimiento de este plazo, se continuará con el debido proceso disciplinario, de conformidad con lo establecido en el Reglamento del Aprendiz.

Le invitamos a hacer uso de este plazo excepcional para normalizar su estado académico. Si presenta alguna dificultad técnica con el manejo de la plataforma, por favor infórmela de inmediato a su instructor de competencia.

Atentamente,`;

const VARIABLES: { token: string; help: string }[] = [
  { token: '{nombre}', help: 'Nombres y apellidos del Excel' },
  { token: '{identificacion}', help: 'Número de identificación del Excel' },
  { token: '{programa}', help: 'Programa configurado abajo' },
  { token: '{ficha}', help: 'Ficha del Excel o la configurada abajo' },
  { token: '{evidencias}', help: 'Lista con viñetas de las evidencias pendientes' },
  { token: '{evidencias_texto}', help: 'Evidencias pendientes separadas por punto y coma' },
  { token: '{total_evidencias}', help: 'Cantidad de evidencias pendientes' },
  { token: '{correo}', help: 'Correo del aprendiz (si viene en el Excel)' },
  { token: '{fecha}', help: 'Fecha de hoy' },
  { token: '{fecha_limite}', help: 'Fecha limite de entrega configurada abajo' },
];

const META_LABELS: { key: MetaKey; label: string }[] = [
  { key: 'nombres', label: 'Nombres' },
  { key: 'apellidos', label: 'Apellidos' },
  { key: 'nombreCompleto', label: 'Nombre completo' },
  { key: 'documento', label: 'Identificación' },
  { key: 'ficha', label: 'Ficha' },
  { key: 'correo', label: 'Correo' },
];

const MARK_STYLES: Record<EvidenceMark, { label: string; className: string }> = {
  A: { label: 'A', className: 'bg-green-50 text-green-700 border-green-200' },
  D: { label: 'D', className: 'bg-red-50 text-red-700 border-red-200' },
  FALTA: { label: '-', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  VACIA: { label: '·', className: 'bg-gray-50 text-gray-400 border-gray-200' },
  OTRO: { label: '?', className: 'bg-gray-50 text-gray-500 border-gray-200' },
};

interface StoredTemplate {
  subject: string;
  body: string;
}

interface StoredSettings {
  programa: string;
  fichaFallback: string;
  /** Fecha límite de entrega (YYYY-MM-DD) que se inyecta en {fecha_limite}. */
  fechaLimite: string;
  uppercaseNames: boolean;
  pending: PendingMarks;
  onlyWithPending: boolean;
}

const DEFAULT_SETTINGS: StoredSettings = {
  programa: 'Gestión de Redes de Datos',
  fichaFallback: '',
  fechaLimite: '',
  uppercaseNames: true,
  pending: DEFAULT_PENDING_MARKS,
  onlyWithPending: true,
};

function loadTemplate(): StoredTemplate {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredTemplate;
      if (parsed && typeof parsed.body === 'string') return parsed;
    }
  } catch {}
  return { subject: DEFAULT_SUBJECT, body: DEFAULT_BODY };
}

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed, pending: { ...DEFAULT_PENDING_MARKS, ...(parsed.pending ?? {}) } };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

function todayLocal(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Convierte una fecha de <input type="date"> (YYYY-MM-DD) a dd/mm/aaaa. */
function formatDateInput(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value.trim();
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Una línea por evidencia; se limpian viñetas y espacios sobrantes. */
function parseEvidenceLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s*\-•]+/, '').trim())
    .filter(Boolean);
}

/** Aprendiz agregado a mano desde el buscador (sin Excel). */
interface ManualEntry {
  id: string;
  fullName: string;
  documento: string;
  ficha: string;
  correo: string;
  /** Evidencias pendientes, una por línea. */
  evidencias: string;
}

/** Fuente común de un correo: filas del Excel y aprendices agregados desde el buscador. */
interface EmailSource {
  rowId: string;
  fullName: string;
  documento: string;
  ficha: string;
  correo: string;
  pending: string[];
}

interface BuiltEmail {
  rowId: string;
  name: string;
  documento: string;
  ficha: string;
  correo: string;
  pending: string[];
  subject: string;
  body: string;
}

export const EvidenceExcelEmails: React.FC = () => {
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [meta, setMeta] = useState<MetaColumns>(EMPTY_META);
  const [evidenceColumns, setEvidenceColumns] = useState<EvidenceColumn[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<number[]>([]);
  const [excludedRows, setExcludedRows] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const workbookRef = useRef<XLSX.WorkBook | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<StoredSettings>(() => loadSettings());
  const [template, setTemplate] = useState<StoredTemplate>(() => loadTemplate());
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Buscador de aprendices registrados (flujo sin Excel)
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [manualEvidenceDraft, setManualEvidenceDraft] = useState('');

  const [previewIndex, setPreviewIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const [sendingAll, setSendingAll] = useState(false);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // Los aprendices del buscador salen del mismo listado que el resto de la app.
  useEffect(() => {
    const load = () =>
      setAllStudents(
        getStudents()
          .slice()
          .sort((a, b) =>
            `${a.firstName ?? ''} ${a.lastName ?? ''}`.localeCompare(
              `${b.firstName ?? ''} ${b.lastName ?? ''}`,
              'es'
            )
          )
      );
    load();
    window.addEventListener('asistenciapro-storage-update', load);
    return () => window.removeEventListener('asistenciapro-storage-update', load);
  }, []);

  const applyParsed = (wb: XLSX.WorkBook, index: number) => {
    const parsed = parseSheet(wb, index);
    setSheetNames(parsed.sheetNames);
    setSheetIndex(parsed.sheetIndex);
    setSheet(parsed.sheet);
    setMeta(parsed.meta);
    setEvidenceColumns(parsed.evidenceColumns);
    setSelectedEvidence(parsed.evidenceColumns.map((c) => c.index));
    setExcludedRows([]);
    setPreviewIndex(0);
    setSendStatus({});
    if (parsed.evidenceColumns.length === 0) {
      setError(
        'No se detectaron columnas de evidencias (celdas con A, D o -). Revisa que la hoja seleccionada sea la correcta.'
      );
    } else {
      setError(null);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      if (wb.SheetNames.length === 0) {
        setError('El archivo no tiene hojas.');
        return;
      }
      workbookRef.current = wb;
      setFileName(file.name);
      applyParsed(wb, 0);
    } catch (err) {
      console.error(err);
      setError('No se pudo leer el archivo. Verifica que sea un Excel (.xlsx / .xls) válido.');
    }
  };

  const handleSheetChange = (index: number) => {
    const wb = workbookRef.current;
    if (!wb) return;
    applyParsed(wb, index);
  };

  const clearFile = () => {
    workbookRef.current = null;
    setFileName('');
    setSheetNames([]);
    setSheet(null);
    setMeta(EMPTY_META);
    setEvidenceColumns([]);
    setSelectedEvidence([]);
    setExcludedRows([]);
    setSendStatus({});
    setError(null);
  };

  const activeEvidence = useMemo(
    () => evidenceColumns.filter((c) => selectedEvidence.includes(c.index)),
    [evidenceColumns, selectedEvidence]
  );

  const rows = useMemo<ApprenticeRow[]>(() => {
    if (!sheet) return [];
    return buildApprenticeRows(sheet, meta, evidenceColumns, {
      uppercaseNames: settings.uppercaseNames,
    });
  }, [sheet, meta, evidenceColumns, settings.uppercaseNames]);

  const pendingByRow = useMemo(() => {
    const map = new Map<string, string[]>();
    rows.forEach((r) => {
      const list = activeEvidence
        .filter((c) => isPendingMark(r.marks[c.index] ?? 'VACIA', settings.pending))
        .map((c) => c.label);
      map.set(r.id, list);
    });
    return map;
  }, [rows, activeEvidence, settings.pending]);

  const markCounts = useMemo(() => {
    const counts: Record<EvidenceMark, number> = { A: 0, D: 0, FALTA: 0, VACIA: 0, OTRO: 0 };
    rows.forEach((r) => {
      activeEvidence.forEach((c) => {
        counts[r.marks[c.index] ?? 'VACIA']++;
      });
    });
    return counts;
  }, [rows, activeEvidence]);

  const visibleRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(term) ||
        r.documento.toLowerCase().includes(term) ||
        r.correo.toLowerCase().includes(term)
    );
  }, [rows, searchTerm]);

  const includedRows = useMemo(
    () =>
      rows.filter((r) => {
        if (excludedRows.includes(r.id)) return false;
        if (settings.onlyWithPending && (pendingByRow.get(r.id) ?? []).length === 0) return false;
        return true;
      }),
    [rows, excludedRows, settings.onlyWithPending, pendingByRow]
  );

  const composeEmail = (source: EmailSource): BuiltEmail => {
    const { pending } = source;
    const ficha = source.ficha || settings.fichaFallback;
    const listaHtml =
      pending.length === 0
        ? '<p>Sin evidencias pendientes.</p>'
        : `<ul>${pending
            .map((p, i) => `<li>Evidencia ${i + 1}: ${escapeHtml(p)}</li>`)
            .join('')}</ul>`;
    const listaTexto = pending.length === 0 ? 'Sin evidencias pendientes' : pending.join('; ');

    const plainValues: Record<string, string> = {
      '{nombre}': source.fullName,
      '{identificacion}': source.documento,
      '{programa}': settings.programa,
      '{ficha}': ficha,
      '{correo}': source.correo,
      '{fecha}': todayLocal(),
      '{fecha_limite}': formatDateInput(settings.fechaLimite) || '[Fecha]',
      '{total_evidencias}': String(pending.length),
      '{evidencias_texto}': listaTexto,
      '{evidencias}': listaTexto,
    };

    let subject = template.subject;
    Object.entries(plainValues).forEach(([token, value]) => {
      subject = subject.split(token).join(value);
    });

    // El cuerpo es texto plano: se escapa completo, se aplica el formato **negrita**
    // y luego se inyectan los valores ya escapados.
    let body = applyInlineMarkdown(escapeHtml(template.body)).replace(/\r?\n/g, '<br>');
    Object.entries(plainValues).forEach(([token, value]) => {
      if (token === '{evidencias}') return;
      body = body.split(token).join(escapeHtml(value));
    });
    // La lista va como bloque: absorbe un <br> a cada lado para no dejar huecos.
    body = body.replace(/(?:<br>)?\{evidencias\}(?:<br>)?/g, listaHtml);

    return {
      rowId: source.rowId,
      name: source.fullName,
      documento: source.documento,
      ficha,
      correo: source.correo,
      pending,
      subject,
      body,
    };
  };

  const buildEmail = (row: ApprenticeRow): BuiltEmail =>
    composeEmail({
      rowId: row.id,
      fullName: row.fullName,
      documento: row.documento,
      ficha: row.ficha,
      correo: row.correo,
      pending: pendingByRow.get(row.id) ?? [],
    });

  const excelEmails = useMemo(
    () => includedRows.map(buildEmail),
    // buildEmail depende de plantilla, ajustes y pendientes
    [includedRows, template, settings, pendingByRow]
  );

  // Los aprendices buscados a mano siempre generan correo, tengan o no evidencias escritas.
  const manualEmails = useMemo(
    () =>
      manualEntries.map((m) =>
        composeEmail({
          rowId: m.id,
          fullName: settings.uppercaseNames ? m.fullName.toUpperCase() : m.fullName,
          documento: m.documento,
          ficha: m.ficha,
          correo: m.correo,
          pending: parseEvidenceLines(m.evidencias),
        })
      ),
    [manualEntries, template, settings]
  );

  const emails = useMemo(() => [...manualEmails, ...excelEmails], [manualEmails, excelEmails]);

  useEffect(() => {
    setPreviewIndex((i) => (emails.length === 0 ? 0 : Math.min(i, emails.length - 1)));
  }, [emails.length]);

  const current = emails[previewIndex];
  const withEmail = emails.filter((e) => e.correo.includes('@'));

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2200);
  };

  const insertVariable = (token: string) => {
    const el = bodyRef.current;
    if (!el) {
      setTemplate((t) => ({ ...t, body: `${t.body} ${token}` }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = `${el.value.slice(0, start)}${token}${el.value.slice(end)}`;
    setTemplate((t) => ({ ...t, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const saveTemplate = () => {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(template));
    showFeedback('Plantilla guardada');
  };

  const restoreTemplate = () => {
    setTemplate({ subject: DEFAULT_SUBJECT, body: DEFAULT_BODY });
    showFeedback('Plantilla por defecto restaurada');
  };

  const copySubject = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.subject);
      showFeedback('Asunto copiado');
    } catch {
      showFeedback('No se pudo copiar');
    }
  };

  const copyBody = async () => {
    if (!current) return;
    const html = buildEmailHtml(current.body);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([htmlToPlainText(html)], { type: 'text/plain' }),
        }),
      ]);
      showFeedback('Cuerpo copiado (pega en el correo con formato)');
    } catch {
      try {
        await navigator.clipboard.writeText(htmlToPlainText(html));
        showFeedback('Cuerpo copiado (solo texto)');
      } catch {
        showFeedback('No se pudo copiar');
      }
    }
  };

  const sendOne = async (email: BuiltEmail) => {
    const cfg = getEmailSettings();
    setSendStatus((s) => ({ ...s, [email.rowId]: 'sending' }));
    try {
      if (!cfg.serviceId || !cfg.publicKey) {
        await new Promise((r) => setTimeout(r, 500)); // modo simulación, igual que arriba
      } else {
        await emailjs.send(
          cfg.serviceId,
          cfg.templateId,
          {
            to_name: email.name,
            to_email: email.correo,
            from_name: cfg.teacherName || 'Instructor',
            reply_to: cfg.teacherEmail,
            subject: email.subject,
            message: email.body,
          },
          cfg.publicKey
        );
      }
      setSendStatus((s) => ({ ...s, [email.rowId]: 'sent' }));
    } catch (err) {
      console.error('EmailJS Error:', err);
      setSendStatus((s) => ({ ...s, [email.rowId]: 'error' }));
    }
  };

  const sendAll = async () => {
    setSendingAll(true);
    for (const email of withEmail) {
      if (sendStatus[email.rowId] === 'sent') continue;
      await sendOne(email);
    }
    setSendingAll(false);
  };

  /** Descarga un HTML con todos los correos, uno tras otro, para revisar o imprimir. */
  const downloadAll = () => {
    const doc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Correos por evidencias</title></head><body style="background:#f3f4f6;margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;">${emails
      .map(
        (e) =>
          `<div style="background:#fff;max-width:760px;margin:0 auto 24px;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">` +
          `<p style="font-size:12px;color:#6b7280;margin:0 0 4px;">Para: ${escapeHtml(e.correo || 'sin correo')}</p>` +
          `<p style="font-weight:bold;margin:0 0 12px;">${escapeHtml(e.subject)}</p>` +
          buildEmailHtml(e.body) +
          `</div>`
      )
      .join('')}</body></html>`;
    const url = URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `correos-evidencias-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setMetaColumn = (key: MetaKey, index: number) =>
    setMeta((m) => ({ ...m, [key]: index }));

  const toggleEvidence = (index: number) =>
    setSelectedEvidence((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    );

  const toggleRow = (id: string) =>
    setExcludedRows((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const studentMatches = useMemo(() => {
    const term = studentQuery.trim().toLowerCase();
    if (term.length < 2) return [];
    return allStudents
      .filter((s) => {
        const full = `${s.firstName ?? ''} ${s.lastName ?? ''}`.toLowerCase();
        return (
          full.includes(term) ||
          (s.documentNumber ?? '').toLowerCase().includes(term) ||
          (s.email ?? '').toLowerCase().includes(term) ||
          (s.group ?? '').toLowerCase().includes(term)
        );
      })
      .slice(0, 8);
  }, [allStudents, studentQuery]);

  const addManualStudent = (s: Student) => {
    const id = `manual-${s.id}`;
    setStudentQuery('');
    if (manualEntries.some((m) => m.id === id)) {
      showFeedback('Ese aprendiz ya está en la lista');
      return;
    }
    setManualEntries((prev) => [
      ...prev,
      {
        id,
        fullName: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim(),
        documento: s.documentNumber ?? '',
        ficha: s.group ?? '',
        correo: s.email ?? '',
        evidencias: manualEvidenceDraft,
      },
    ]);
    // El nuevo aprendiz queda al final del bloque manual, que va primero en la vista previa.
    setPreviewIndex(manualEntries.length);
  };

  const removeManualEntry = (id: string) =>
    setManualEntries((prev) => prev.filter((m) => m.id !== id));

  const updateManualEvidences = (id: string, evidencias: string) =>
    setManualEntries((prev) => prev.map((m) => (m.id === id ? { ...m, evidencias } : m)));

  const applyDraftToAll = () => {
    setManualEntries((prev) => prev.map((m) => ({ ...m, evidencias: manualEvidenceDraft })));
    showFeedback('Evidencias aplicadas a los aprendices agregados');
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-6 border-b border-gray-100">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-teal-600" />
          Correos por evidencias desde Excel
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Sube un Excel con los aprendices y una columna por evidencia (<strong>A</strong> aprobada,{' '}
          <strong>D</strong> desaprobada, <strong>-</strong> sin entregar). Los nombres, la
          identificación y las evidencias pendientes se toman del archivo y se insertan en la plantilla.
          También puedes <strong>buscar un aprendiz</strong> registrado y generarle el correo sin subir
          nada.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Paso 1 · Archivo */}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700"
            >
              <Upload className="w-4 h-4" />
              {fileName ? 'Cambiar archivo' : 'Subir Excel de evidencias'}
            </button>
            {fileName && (
              <>
                <span className="text-sm text-gray-600 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-gray-400" />
                  {fileName}
                </span>
                {sheetNames.length > 1 && (
                  <select
                    value={sheetIndex}
                    onChange={(e) => handleSheetChange(Number(e.target.value))}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                    title="Hoja del libro"
                  >
                    {sheetNames.map((n, i) => (
                      <option key={n} value={i}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={clearFile}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Quitar
                </button>
              </>
            )}
          </div>
          {error && (
            <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {sheet && !error && (
            <p className="mt-3 text-sm text-gray-600">
              <strong className="text-gray-900">{rows.length}</strong> aprendices ·{' '}
              <strong className="text-gray-900">{evidenceColumns.length}</strong> columnas de evidencia
              detectadas · encabezados en la fila {sheet.headerRowIndex + 1}
              <span className="text-gray-400">
                {' '}
                (A: {markCounts.A} · -: {markCounts.FALTA} · D: {markCounts.D} · vacías:{' '}
                {markCounts.VACIA})
              </span>
            </p>
          )}
        </div>

        {/* Datos que se inyectan en la plantilla (aplican al Excel y al buscador) */}
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-800">Datos del programa</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Programa <span className="text-gray-400">({'{programa}'})</span>
              </label>
              <input
                type="text"
                value={settings.programa}
                onChange={(e) => setSettings((s) => ({ ...s, programa: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Ficha por defecto <span className="text-gray-400">({'{ficha}'} si falta)</span>
              </label>
              <input
                type="text"
                value={settings.fichaFallback}
                onChange={(e) => setSettings((s) => ({ ...s, fichaFallback: e.target.value }))}
                placeholder="Ej: 2843147"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Fecha límite de entrega <span className="text-gray-400">({'{fecha_limite}'})</span>
              </label>
              <input
                type="date"
                value={settings.fechaLimite}
                onChange={(e) => setSettings((s) => ({ ...s, fechaLimite: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.uppercaseNames}
              onChange={(e) => setSettings((s) => ({ ...s, uppercaseNames: e.target.checked }))}
              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
            />
            Nombres en MAYÚSCULAS
          </label>
        </div>

        {/* Buscador de aprendices: genera el correo sin necesidad de Excel */}
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-teal-600" />
            Buscar aprendiz y enviarle el correo
          </h4>
          <p className="text-xs text-gray-500">
            Busca cualquier aprendiz registrado por nombre, identificación, correo o ficha y agrégalo a
            la lista de correos. Funciona con o sin Excel cargado.
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Nombre, identificación, correo o ficha..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            />
            {studentQuery.trim().length >= 2 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {studentMatches.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-gray-400">
                    Sin coincidencias entre los aprendices registrados.
                  </p>
                ) : (
                  studentMatches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => addManualStudent(s)}
                      className="w-full text-left px-3 py-2 hover:bg-teal-50 border-b border-gray-100 last:border-0"
                    >
                      <span className="block text-sm font-medium text-gray-800">
                        {`${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || 'Sin nombre'}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {s.documentNumber || 'sin identificación'}
                        {s.group ? ` · Ficha ${s.group}` : ''}
                        {s.email ? ` · ${s.email}` : ' · sin correo'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-medium text-gray-600">
                Evidencias pendientes (una por línea) para los aprendices que agregues
              </label>
              {manualEntries.length > 0 && (
                <button
                  type="button"
                  onClick={applyDraftToAll}
                  className="text-xs font-medium px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                >
                  Aplicar a todos
                </button>
              )}
            </div>
            <textarea
              value={manualEvidenceDraft}
              onChange={(e) => setManualEvidenceDraft(e.target.value)}
              rows={3}
              placeholder={'GA1-220501046-AA2-EV01 · Nombre de la evidencia\nGA1-220501046-AA4-EV01 · Nombre de la evidencia'}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          {manualEntries.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600">
                Aprendices agregados ({manualEntries.length})
              </p>
              {manualEntries.map((m, i) => {
                const email = manualEmails[i];
                const status = sendStatus[m.id];
                return (
                  <div key={m.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{m.fullName || '—'}</p>
                        <p className="text-xs text-gray-500">
                          {m.documento || 'sin identificación'}
                          {` · Ficha ${m.ficha || settings.fichaFallback || '—'}`}
                          {m.correo ? ` · ${m.correo}` : ' · sin correo'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {status === 'sent' && (
                          <span className="text-green-600 text-xs font-bold flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
                            <CheckCircle className="w-3 h-3" /> Enviado
                          </span>
                        )}
                        {status === 'error' && (
                          <span className="text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded">
                            Error
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setPreviewIndex(i)}
                          className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        >
                          Ver correo
                        </button>
                        <button
                          type="button"
                          onClick={() => email && sendOne(email)}
                          disabled={!email || !email.correo.includes('@') || status === 'sending'}
                          title={
                            m.correo.includes('@')
                              ? 'Enviar con la configuración de EmailJS'
                              : 'El aprendiz no tiene correo registrado'
                          }
                          className="px-2.5 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                        >
                          {status === 'sending' ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          Enviar
                        </button>
                        <button
                          type="button"
                          onClick={() => removeManualEntry(m.id)}
                          title="Quitar de la lista"
                          className="p-1.5 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={m.evidencias}
                      onChange={(e) => updateManualEvidences(m.id, e.target.value)}
                      rows={2}
                      placeholder="Evidencias pendientes de este aprendiz (una por línea)"
                      className="mt-2 w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {sheet && (
          <>
            {/* Paso 2 · Columnas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
                  <Columns3 className="w-4 h-4 text-teal-600" />
                  Columnas del aprendiz
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {META_LABELS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                      <select
                        value={meta[key]}
                        onChange={(e) => setMetaColumn(key, Number(e.target.value))}
                        className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                      >
                        <option value={-1}>— No usar —</option>
                        {sheet.headers.map((h, i) => (
                          <option key={`${key}-${i}`} value={i}>
                            {h || `Columna ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Si el Excel trae el nombre en una sola columna, usa <em>Nombre completo</em> y deja
                  Nombres/Apellidos en «No usar».
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-800 flex items-center justify-between gap-2 mb-3">
                  <span className="flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-teal-600" />
                    Evidencias a incluir ({activeEvidence.length}/{evidenceColumns.length})
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedEvidence(evidenceColumns.map((c) => c.index))}
                      className="text-xs font-medium px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedEvidence([])}
                      className="text-xs font-medium px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    >
                      Ninguna
                    </button>
                  </span>
                </h4>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                  {evidenceColumns.length === 0 ? (
                    <p className="text-sm text-gray-500 py-2 text-center">
                      No se detectaron columnas de evidencias.
                    </p>
                  ) : (
                    evidenceColumns.map((c) => (
                      <label
                        key={c.index}
                        className="flex items-start gap-2 text-sm text-gray-700 hover:bg-white rounded px-2 py-1 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEvidence.includes(c.index)}
                          onChange={() => toggleEvidence(c.index)}
                          className="mt-0.5 w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block truncate" title={c.raw}>
                            {c.label}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Paso 3 · Criterio de pendiente (solo aplica al Excel) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-800">¿Qué cuenta como pendiente?</h4>
                <div className="space-y-2">
                  {(
                    [
                      ['falta', 'Sin entregar (-)'],
                      ['desaprobada', 'Desaprobada (D)'],
                      ['vacia', 'Celda vacía'],
                    ] as [keyof PendingMarks, string][]
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.pending[key]}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, pending: { ...s.pending, [key]: e.target.checked } }))
                        }
                        className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer border-t border-gray-100 pt-3">
                  <input
                    type="checkbox"
                    checked={settings.onlyWithPending}
                    onChange={(e) => setSettings((s) => ({ ...s, onlyWithPending: e.target.checked }))}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  Generar correo solo a quienes tienen pendientes
                </label>
              </div>
            </div>

            {/* Paso 4 · Aprendices detectados */}
            <div className="rounded-xl border border-gray-200">
              <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-600" />
                  Aprendices del archivo
                  <span className="font-normal text-gray-500">
                    ({includedRows.length} con correo a generar de {rows.length})
                  </span>
                </h4>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar aprendiz..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                      <th className="px-4 py-2 font-semibold">Incluir</th>
                      <th className="px-4 py-2 font-semibold">Aprendiz</th>
                      <th className="px-4 py-2 font-semibold">Identificación</th>
                      <th className="px-4 py-2 font-semibold">Ficha</th>
                      <th className="px-4 py-2 font-semibold">Correo</th>
                      <th className="px-4 py-2 font-semibold">Pendientes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleRows.map((r) => {
                      const pending = pendingByRow.get(r.id) ?? [];
                      const excluded = excludedRows.includes(r.id);
                      return (
                        <tr key={r.id} className={excluded ? 'opacity-40' : ''}>
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={() => toggleRow(r.id)}
                              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                            />
                          </td>
                          <td className="px-4 py-2 font-medium text-gray-800">{r.fullName || '—'}</td>
                          <td className="px-4 py-2 text-gray-600">{r.documento || '—'}</td>
                          <td className="px-4 py-2 text-gray-600">{r.ficha || settings.fichaFallback || '—'}</td>
                          <td className="px-4 py-2 text-gray-600">{r.correo || '—'}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                pending.length === 0
                                  ? MARK_STYLES.A.className
                                  : MARK_STYLES.FALTA.className
                              }`}
                              title={pending.join(' · ')}
                            >
                              {pending.length}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                          Sin resultados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Paso 5 · Plantilla y vista previa */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-800">Plantilla</h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveTemplate}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-teal-300 bg-white text-teal-700 hover:bg-teal-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={restoreTemplate}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Asunto</label>
              <input
                type="text"
                value={template.subject}
                onChange={(e) => setTemplate((t) => ({ ...t, subject: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token)}
                  title={v.help}
                  className="text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded border border-teal-100 hover:bg-teal-100"
                >
                  {v.token}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje</label>
              <textarea
                ref={bodyRef}
                value={template.body}
                onChange={(e) => setTemplate((t) => ({ ...t, body: e.target.value }))}
                rows={16}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none leading-relaxed"
              />
              <p className="text-xs text-gray-500 mt-1">
                Los saltos de línea se respetan y el texto entre <code>**dobles asteriscos**</code> se
                envía en negrita. <code>{'{evidencias}'}</code> se reemplaza por la lista con viñetas de
                las evidencias pendientes de cada aprendiz.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 flex flex-col min-h-[400px]">
            <div className="p-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-2 bg-gray-50 rounded-t-xl">
              <div>
                <h4 className="text-sm font-semibold text-gray-800">Vista previa</h4>
                <p className="text-xs text-gray-500">
                  {emails.length > 0
                    ? `${emails.length} correos generados · ${withEmail.length} con correo`
                    : 'Sube el Excel para generar los correos'}
                </p>
              </div>
              {emails.length > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={downloadAll}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    title="Descargar todos los correos en un archivo HTML"
                  >
                    Descargar todos
                  </button>
                  <button
                    type="button"
                    onClick={sendAll}
                    disabled={sendingAll || withEmail.length === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                    title={
                      withEmail.length === 0
                        ? 'El Excel no trae columna de correo'
                        : 'Enviar con la configuración de EmailJS'
                    }
                  >
                    {sendingAll ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Enviar todo
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 p-4 bg-gray-50 flex flex-col overflow-auto">
              {!current ? (
                <div className="flex flex-col items-center justify-center flex-1 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                  <FileSpreadsheet className="w-10 h-10 mb-2" />
                  <p className="text-sm text-center px-4">
                    {sheet
                      ? 'Ningún aprendiz cumple los criterios seleccionados.'
                      : 'Sube el Excel de evidencias para ver los correos.'}
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 flex-1 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-gray-100 flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 truncate">{current.name || '—'}</p>
                      <p className="text-sm text-gray-500">
                        {current.documento || 'sin identificación'}
                        {current.correo ? ` · ${current.correo}` : ' · sin correo'}
                      </p>
                      <span className="text-xs text-amber-600 font-medium">
                        {current.pending.length} evidencia(s) pendiente(s)
                      </span>
                    </div>
                    {sendStatus[current.rowId] === 'sent' && (
                      <span className="text-green-600 text-xs font-bold flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
                        <CheckCircle className="w-3 h-3" /> Enviado
                      </span>
                    )}
                    {sendStatus[current.rowId] === 'error' && (
                      <span className="text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded">Error</span>
                    )}
                    {sendStatus[current.rowId] === 'sending' && (
                      <span className="text-teal-600 text-xs font-bold bg-teal-50 px-2 py-1 rounded flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Enviando
                      </span>
                    )}
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto text-sm text-gray-700">
                    <div className="flex flex-wrap items-center gap-2 mb-2 border-b border-gray-200 pb-2">
                      <p className="font-bold text-gray-900 flex-1 min-w-0">{current.subject}</p>
                      <button
                        type="button"
                        onClick={copySubject}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Asunto
                      </button>
                      <button
                        type="button"
                        onClick={copyBody}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Cuerpo (con formato)
                      </button>
                    </div>
                    {feedback && (
                      <p className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded mb-2">{feedback}</p>
                    )}
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: current.body }}
                    />
                  </div>
                  <div className="p-3 border-t border-gray-200 bg-white flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                      disabled={previewIndex === 0}
                      className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-600"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-medium text-gray-600">
                      {previewIndex + 1} de {emails.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((i) => Math.min(emails.length - 1, i + 1))}
                      disabled={previewIndex >= emails.length - 1}
                      className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-600"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Mail,
  RefreshCw,
  CheckCircle,
  Send,
  Settings,
  X,
  Edit3,
  Clipboard,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Users,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Copy,
  BookOpen,
  ListChecks,
} from 'lucide-react';
import emailjs from '@emailjs/browser';
import {
  getStudents,
  getFichas,
  getLmsLastAccess,
  getGradeActivities,
  getGrades,
  getEmailSettings,
  saveEmailSettings,
} from '../services/db';
import {
  ALL_EVIDENCE_AREAS,
  buildEvidenceAreaOptions,
  filterActsForPendingEvidence,
  shortEvidenceLabel,
  activityMatchesEvidenceArea,
  type EvidencePendingScope,
} from '../services/evidenceMeta';
import { Student, Ficha, GradeActivity, GradeEntry, EmailSettings } from '../types';

/** Días desde la fecha/hora indicada hasta hoy. */
function daysSince(dateStr: string): number {
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return -1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = today.getTime() - d.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

/**
 * Novedad (misma lógica que AsistenciaLmsView):
 * - Estado "Formación" y días sin ingresar >= 20 → "Riesgo de deserción"
 * - Estado "Formación" y Final no es "A" y días < 20 → "Plan de mejoramiento"
 * - Resto → "-"
 */
const ALL_PHASES_LABEL = 'Todas las fases';

const DEFAULT_GRADE_PHASES = [
  'Fase Inducción',
  'Fase 1: Análisis',
  'Fase 2: Planeación',
  'Fase 3: Ejecución',
  'Fase 4: Evaluación',
] as const;

/** Evidencias sin A (fase, área y subconjunto de ids — misma lógica que Reportes). */
function getPendingGradeActivities(
  student: Student,
  activities: GradeActivity[],
  gradeMap: Map<string, GradeEntry>,
  scope: EvidencePendingScope
): GradeActivity[] {
  const group = student.group || '';
  const fichaSpecific = activities.filter((a) => a.group === group);
  const fichaActs =
    fichaSpecific.length > 0 ? fichaSpecific : activities.filter((a) => a.group === '');
  const acts = filterActsForPendingEvidence(fichaActs, scope);
  const pending: GradeActivity[] = [];
  acts.forEach((a) => {
    const g = gradeMap.get(`${student.id}-${a.id}`);
    if (!g || g.letter !== 'A') pending.push(a);
  });
  return pending;
}

function getNovedad(
  student: Student,
  daysInactive: number | null,
  finalLetter: 'A' | 'D' | null
): string {
  const status = student.status || 'Formación';
  if (status !== 'Formación') return '-';
  const days = daysInactive != null && daysInactive >= 0 ? daysInactive : -1;
  if (days >= 20) return 'Riesgo de deserción';
  if (finalLetter !== 'A' && days >= 0 && days < 20) return 'Plan de mejoramiento';
  return '-';
}

interface ApprenticeWithNovedad {
  student: Student;
  novedad: string;
  daysInactive: number | null;
  finalLetter: 'A' | 'D' | null;
}

interface PreparedEmail {
  studentId: string;
  studentName: string;
  email: string;
  novedad: string;
  subject: string;
  body: string;
  status?: 'pending' | 'sending' | 'sent' | 'error';
}

/** Fuentes seguras para correo (compatibles con clientes de email). */
const EMAIL_FONTS = [
  { name: 'Fuente', value: '' },
  { name: 'Arial', value: 'Arial' },
  { name: 'Georgia', value: 'Georgia' },
  { name: 'Times New Roman', value: 'Times New Roman' },
  { name: 'Verdana', value: 'Verdana' },
  { name: 'Courier New', value: 'Courier New' },
];

/** Escapa HTML para insertar valores en el cuerpo del correo sin romper etiquetas. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convierte HTML a texto plano (para portapapeles text/plain). */
function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent ?? div.innerText ?? '').trim();
}

/** Indica si un nodo está dentro del editor. */
function isInsideEditor(editor: HTMLDivElement | null, node: Node | null): boolean {
  if (!editor || !node) return false;
  return editor.contains(node);
}

/** Guarda una copia del rango actual si la selección está en el editor. */
function saveSelectionInEditor(editor: HTMLDivElement | null): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!isInsideEditor(editor, range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

/** Restaura la selección en el editor. */
function restoreSelection(editor: HTMLDivElement, savedRange: Range | null): boolean {
  if (!savedRange) return false;
  try {
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return true;
  } catch {
    return false;
  }
}

export const AlertsView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [lmsLastAccess, setLmsLastAccess] = useState<Record<string, string>>({});
  const [gradeActivities, setGradeActivities] = useState<GradeActivity[]>([]);
  const [grades, setGrades] = useState<GradeEntry[]>([]);

  const [filterFicha, setFilterFicha] = useState<string>('Todas');
  const [filterFase, setFilterFase] = useState<string>(ALL_PHASES_LABEL);
  const [filterEvidenceArea, setFilterEvidenceArea] = useState<string>(ALL_EVIDENCE_AREAS);
  const [selectedAlertEvidenceIdList, setSelectedAlertEvidenceIdList] = useState<string[]>([]);
  const [alertsEvidencePickerOpen, setAlertsEvidencePickerOpen] = useState(false);
  const [filterNovedad, setFilterNovedad] = useState<string>('Ambos');
  const [searchTerm, setSearchTerm] = useState('');

  // Plantilla de correo (deserción - ver email/correo_desercion.txt)
  const [templateSubject, setTemplateSubject] = useState(
    'Notificación de Inicio de Proceso de Deserción'
  );
  const [templateBody, setTemplateBody] = useState(
    `Estimado(a) Aprendiz:

{estudiante}
C.C. {documento}
Programa: Gestión de Redes de Datos
Ficha: {grupo}

Reciba un cordial saludo.
Como instructor responsable de su proceso formativo en el programa, me permito comunicarle que, tras la revisión del sistema de gestión académica Zajuna, se ha evidenciado que usted no registra ingresos a la plataforma desde hace {dias_sin_ingresar} días y no reporta entrega de las evidencias.
De acuerdo con el Acuerdo 009 de 2024 (Reglamento del Aprendiz SENA), su situación se enmarca en la causal de deserción establecida para la modalidad virtual, la cual cito a continuación:
Artículo 30º. Deserción: Se considera deserción en el proceso de formación, cuando el aprendiz:
"b) En la formación bajo la modalidad virtual en etapa lectiva, se presenta cuando el aprendiz no asiste a tres (3) citaciones seguidas elevadas por el instructor o por el responsable del grupo o no ingresa a su ambiente virtual de formación (plataforma LMS) durante veinte (20) días consecutivos, sin previa justificación soportada ante el sistema de gestión académico-administrativo."
En caso de que existan situaciones personales, laborales o de fuerza mayor que le impidan continuar, informarle sobre su derecho a solicitar un Retiro Voluntario.
Novedad de Retiro Voluntario: Es la solicitud formal que el aprendiz presenta ante el Centro de Formación para retirarse del programa. A diferencia de la deserción, el retiro voluntario debidamente justificado puede evitar o disminuir los términos de sanción para futuras inscripciones, siempre que se realice antes de que se formalice el proceso de deserción por parte de la entidad.
En caso de no recibir respuesta de solicitud de retiro voluntario, el Centro de Formación procederá a tramitar la deserción y la cancelación de su matrícula en el programa de formación, con la respectiva sanción de no poder participar en procesos de ingreso al SENA por el término establecido en el reglamento.

Atentamente,`
  );

  const [preparedEmails, setPreparedEmails] = useState<PreparedEmail[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [emailConfig, setEmailConfig] = useState<EmailSettings>({
    teacherName: '',
    teacherEmail: '',
    serviceId: '',
    templateId: '',
    publicKey: '',
  });

  const loadData = () => {
    setStudents(getStudents());
    setFichas(getFichas());
    setLmsLastAccess(getLmsLastAccess());
    setGradeActivities(getGradeActivities());
    setGrades(getGrades());
  };

  useEffect(() => {
    loadData();
    setEmailConfig(getEmailSettings());
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  // Inicializar editor enriquecido una sola vez: texto plano → HTML con <br>
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const isPlain = !/<\/?[a-z][^>]*>/i.test(templateBody);
    el.innerHTML = isPlain ? templateBody.replace(/\n/g, '<br>') : templateBody;
  }, []);

  // Guardar selección cuando cambie y esté dentro del editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const onSelectionChange = () => {
      const range = saveSelectionInEditor(editor);
      if (range) savedSelectionRef.current = range;
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const gradeMap = useMemo(() => {
    const map = new Map<string, GradeEntry>();
    grades.forEach((g) => map.set(`${g.studentId}-${g.activityId}`, g));
    return map;
  }, [grades]);

  const alertPhaseOptions = useMemo(() => {
    const seen = new Set<string>(DEFAULT_GRADE_PHASES);
    const extra: string[] = [];
    gradeActivities.forEach((a) => {
      const p = a.phase?.trim();
      if (p && !seen.has(p)) {
        seen.add(p);
        extra.push(p);
      }
    });
    extra.sort((a, b) => a.localeCompare(b, 'es'));
    return [ALL_PHASES_LABEL, ...DEFAULT_GRADE_PHASES, ...extra];
  }, [gradeActivities]);

  const alertsEvidenceBasePool = useMemo(() => {
    let pool = gradeActivities.filter((a) => {
      if (filterFicha === 'Todas') return true;
      return a.group === filterFicha || a.group === '';
    });
    if (filterFase !== ALL_PHASES_LABEL) {
      pool = pool.filter((a) => a.phase === filterFase);
    }
    return [...pool].sort(
      (a, b) =>
        (a.phase || '').localeCompare(b.phase || '', 'es') || a.name.localeCompare(b.name, 'es')
    );
  }, [gradeActivities, filterFicha, filterFase]);

  const alertsEvAreaOptions = useMemo(
    () => buildEvidenceAreaOptions(alertsEvidenceBasePool),
    [alertsEvidenceBasePool]
  );

  const alertsEvidencePickerPool = useMemo(
    () =>
      alertsEvidenceBasePool.filter((a) =>
        activityMatchesEvidenceArea(a, filterEvidenceArea)
      ),
    [alertsEvidenceBasePool, filterEvidenceArea]
  );

  const alertSelectedEvidenceIdSet = useMemo(
    () => new Set(selectedAlertEvidenceIdList),
    [selectedAlertEvidenceIdList]
  );

  const alertsPendingScope = useMemo<EvidencePendingScope>(
    () => ({
      phaseFilter: filterFase,
      allPhasesLabel: ALL_PHASES_LABEL,
      areaFilter: filterEvidenceArea,
      selectedActivityIds: alertSelectedEvidenceIdSet,
    }),
    [filterFase, filterEvidenceArea, alertSelectedEvidenceIdSet]
  );

  useEffect(() => {
    if (!alertsEvAreaOptions.includes(filterEvidenceArea)) {
      setFilterEvidenceArea(ALL_EVIDENCE_AREAS);
    }
  }, [alertsEvAreaOptions, filterEvidenceArea]);

  useEffect(() => {
    const valid = new Set(alertsEvidencePickerPool.map((a) => a.id));
    setSelectedAlertEvidenceIdList((prev) => prev.filter((id) => valid.has(id)));
  }, [alertsEvidencePickerPool]);

  const getFinalForStudent = (
    student: Student
  ): { score: number | null; letter: 'A' | 'D' | null } => {
    const fichaActivities = gradeActivities.filter((a) => a.group === (student.group || ''));
    const totalActivities = fichaActivities.length;
    if (totalActivities === 0) return { score: null, letter: null };

    let sum = 0;
    fichaActivities.forEach((activity) => {
      const grade = gradeMap.get(`${student.id}-${activity.id}`);
      if (grade) sum += grade.score;
    });

    const delivered = fichaActivities.filter((a) =>
      gradeMap.has(`${student.id}-${a.id}`)
    ).length;
    const allApproved =
      delivered === totalActivities &&
      fichaActivities.every((a) => gradeMap.get(`${student.id}-${a.id}`)?.letter === 'A');
    const letter: 'A' | 'D' = allApproved ? 'A' : 'D';
    const avg = totalActivities > 0 ? sum / totalActivities : null;
    return { score: avg, letter };
  };

  // Solo aprendices en Formación o Plan de mejoramiento (excluir Cancelado, Retiro voluntario, Deserción) — misma regla que gráficas en Reportes
  const excludedStatuses = ['Cancelado', 'Retiro Voluntario', 'Deserción'];
  const studentsFormacion = useMemo(
    () => students.filter((s) => !excludedStatuses.includes(s.status || '')),
    [students]
  );

  // Aprendices con novedad "Riesgo de deserción" o "Plan de mejoramiento"
  const apprenticesWithNovedad = useMemo((): ApprenticeWithNovedad[] => {
    return studentsFormacion
      .filter((s) => {
        const lastAccess = lmsLastAccess[s.id];
        const days = lastAccess != null ? daysSince(lastAccess) : null;
        const final = getFinalForStudent(s);
        const novedad = getNovedad(s, days, final.letter);
        return novedad === 'Riesgo de deserción' || novedad === 'Plan de mejoramiento';
      })
      .map((student) => {
        const lastAccess = lmsLastAccess[student.id];
        const daysInactive = lastAccess != null ? daysSince(lastAccess) : null;
        const final = getFinalForStudent(student);
        const novedad = getNovedad(student, daysInactive, final.letter);
        return { student, novedad, daysInactive, finalLetter: final.letter };
      });
  }, [studentsFormacion, lmsLastAccess, gradeActivities, grades, gradeMap]);

  const filteredList = useMemo(() => {
    let list =
      filterFicha === 'Todas'
        ? [...apprenticesWithNovedad]
        : apprenticesWithNovedad.filter((a) => (a.student.group || '') === filterFicha);

    const restrictByPending =
      filterFase !== ALL_PHASES_LABEL ||
      selectedAlertEvidenceIdList.length > 0 ||
      filterEvidenceArea !== ALL_EVIDENCE_AREAS;
    if (restrictByPending) {
      list = list.filter(
        (a) =>
          getPendingGradeActivities(a.student, gradeActivities, gradeMap, alertsPendingScope)
            .length > 0
      );
    }

    if (filterNovedad === 'Riesgo de deserción')
      list = list.filter((a) => a.novedad === 'Riesgo de deserción');
    else if (filterNovedad === 'Plan de mejoramiento')
      list = list.filter((a) => a.novedad === 'Plan de mejoramiento');

    const term = searchTerm.toLowerCase();
    if (term) {
      list = list.filter((a) => {
        const fullName = `${a.student.firstName} ${a.student.lastName}`.toLowerCase();
        const doc = (a.student.documentNumber || '').toLowerCase();
        const email = (a.student.email || '').toLowerCase();
        return fullName.includes(term) || doc.includes(term) || email.includes(term);
      });
    }
    return list;
  }, [
    apprenticesWithNovedad,
    filterFicha,
    filterFase,
    filterEvidenceArea,
    filterNovedad,
    searchTerm,
    gradeActivities,
    gradeMap,
    alertsPendingScope,
    selectedAlertEvidenceIdList.length,
  ]);

  const getLocalDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const insertVariable = (variable: string) => {
    const el = editorRef.current;
    if (el) {
      el.focus();
      document.execCommand('insertHTML', false, variable);
      setTemplateBody(el.innerHTML);
    } else {
      setTemplateBody((prev) => prev + ' ' + variable);
    }
  };

  const applyFormat = (command: string, value?: string) => {
    const el = editorRef.current;
    if (el) {
      el.focus();
      document.execCommand(command, false, value ?? '');
      setTemplateBody(el.innerHTML);
    }
  };

  const applyListOrIndent = (command: 'insertUnorderedList' | 'insertOrderedList' | 'indent' | 'outdent') => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const saved = savedSelectionRef.current;
    const restored = saved && restoreSelection(el, saved);
    if (restored && (command === 'insertUnorderedList' || command === 'insertOrderedList')) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const tag = command === 'insertOrderedList' ? 'ol' : 'ul';
      const fragment = range.cloneContents();
      const wrap = document.createElement('div');
      wrap.appendChild(fragment);
      let html = wrap.innerHTML;
      if (!html.trim()) html = '<br>';
      const lines = html.split(/\s*<br\s*\/?>\s*/i).map((s) => s.trim());
      const items = lines.length >= 1 && lines.some((s) => s) ? lines.filter(Boolean) : [html.trim() || '&nbsp;'];
      const listHtml = `<${tag}>${items.map((line) => `<li>${line || '&nbsp;'}</li>`).join('')}</${tag}>`;
      range.deleteContents();
      range.collapse(true);
      document.execCommand('insertHTML', false, listHtml);
      setTemplateBody(el.innerHTML);
      return;
    }
    if (restored && (command === 'indent' || command === 'outdent')) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      let block: Element | null = range.startContainer as Element;
      if (block.nodeType !== Node.ELEMENT_NODE) block = block.parentElement;
      while (block && block !== el && !['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE'].includes(block.tagName)) {
        block = block.parentElement;
      }
      if (!block || block === el) {
        const div = document.createElement('div');
        div.innerHTML = '<br>';
        range.insertNode(div);
        block = div;
      }
      if (command === 'indent') {
        const wrapper = document.createElement('div');
        wrapper.style.marginLeft = '2em';
        wrapper.style.display = 'block';
        block.parentNode?.insertBefore(wrapper, block);
        wrapper.appendChild(block);
      } else {
        let parent: Element | null = block.parentElement;
        while (parent && parent !== el) {
          const ml = parent.getAttribute('style')?.match(/margin-left:\s*([\d.]+)em/);
          if (ml) {
            const current = parseFloat(ml[1]) || 0;
            if (current <= 2) {
              const grand = parent.parentNode;
              if (grand) {
                while (parent.firstChild) grand.insertBefore(parent.firstChild, parent);
                parent.remove();
              }
            } else {
              parent.style.marginLeft = `${current - 2}em`;
            }
            break;
          }
          if (parent.tagName === 'DIV' && parent.childNodes.length === 1) {
            const grand = parent.parentNode;
            if (grand && grand !== el) {
              grand.insertBefore(block, parent);
              parent.remove();
              break;
            }
          }
          parent = parent.parentElement;
        }
      }
      setTemplateBody(el.innerHTML);
      return;
    }
    applyFormat(command);
  };

  /** Evita que el botón robe el foco al editor y aplica formato (listas/sangría con lógica propia). */
  const handleFormatMouseDown = (e: React.MouseEvent, command: string, value?: string) => {
    e.preventDefault();
    const listOrIndent = ['insertUnorderedList', 'insertOrderedList', 'indent', 'outdent'];
    if (listOrIndent.includes(command)) {
      applyListOrIndent(command as 'insertUnorderedList' | 'insertOrderedList' | 'indent' | 'outdent');
    } else {
      applyFormat(command, value);
    }
  };

  const formatLastAccess = (dateStr: string | undefined): string => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(d.getTime())) return dateStr;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const generatePreviews = () => {
    if (filteredList.length === 0) return;
    const fecha = getLocalDate();
    const results: PreparedEmail[] = filteredList.map((item) => {
      const { student, novedad, daysInactive } = item;
      const fullName = `${student.firstName} ${student.lastName}`;
      const diasStr =
        daysInactive != null && daysInactive >= 0 ? String(daysInactive) : 'N/A';
      const ficha = fichas.find((f) => f.code === (student.group || ''));
      const programName = ficha?.cronogramaProgramName || ficha?.program || student.group || 'N/A';
      const lastAccessFormatted = formatLastAccess(lmsLastAccess[student.id]);

      const safe = escapeHtml;
      const pendientes = getPendingGradeActivities(
        student,
        gradeActivities,
        gradeMap,
        alertsPendingScope
      );
      const evidenciasPlain =
        pendientes.length === 0
          ? 'Ninguna evidencia pendiente según los filtros aplicados.'
          : pendientes.map((a) => (a.detail || a.name).replace(/\s+/g, ' ').trim()).join('; ');
      const evidenciasHtml =
        pendientes.length === 0
          ? `<p>${safe('Ninguna evidencia pendiente según los filtros aplicados.')}</p>`
          : `<ul style="margin:0.5em 0;padding-left:1.25em;">${pendientes
              .map((a) => `<li>${safe((a.detail || a.name).trim())}</li>`)
              .join('')}</ul>`;

      let subject = templateSubject
        .replace(/{estudiante}/g, fullName)
        .replace(/{novedad}/g, novedad)
        .replace(/{grupo}/g, student.group || '')
        .replace(/{dias_sin_ingresar}/g, diasStr)
        .replace(/{fecha}/g, fecha)
        .replace(/{documento}/g, student.documentNumber || '')
        .replace(/{programa}/g, programName)
        .replace(/{fecha_ultimo_ingreso}/g, lastAccessFormatted)
        .replace(/{evidencias}/g, evidenciasPlain);

      let body = templateBody
        .replace(/{estudiante}/g, safe(fullName))
        .replace(/{novedad}/g, safe(novedad))
        .replace(/{grupo}/g, safe(student.group || ''))
        .replace(/{dias_sin_ingresar}/g, safe(diasStr))
        .replace(/{fecha}/g, safe(fecha))
        .replace(/{documento}/g, safe(student.documentNumber || 'N/A'))
        .replace(/{programa}/g, safe(programName))
        .replace(/{fecha_ultimo_ingreso}/g, safe(lastAccessFormatted))
        .replace(/{evidencias}/g, evidenciasHtml);

      return {
        studentId: student.id,
        studentName: fullName,
        email: student.email,
        novedad,
        subject,
        body,
        status: 'pending' as const,
      };
    });
    setPreparedEmails(results);
    setCurrentPreviewIndex(0);
  };

  const sendEmailInternal = async (
    toName: string,
    toEmail: string,
    subject: string,
    body: string
  ) => {
    const { serviceId, templateId, publicKey, teacherName, teacherEmail } = emailConfig;
    if (!serviceId || !publicKey) {
      await new Promise((r) => setTimeout(r, 800));
      return { success: true, simulated: true };
    }
    try {
      await emailjs.send(
        serviceId,
        templateId,
        {
          to_name: toName,
          to_email: toEmail,
          from_name: teacherName || 'Instructor',
          reply_to: teacherEmail,
          subject,
          message: body,
        },
        publicKey
      );
      return { success: true, simulated: false };
    } catch (err) {
      console.error('EmailJS Error:', err);
      throw err;
    }
  };

  const handleSendBulkItem = async (index: number) => {
    const email = preparedEmails[index];
    if (email.status === 'sent') return;
    setPreparedEmails((prev) => {
      const n = [...prev];
      n[index].status = 'sending';
      return n;
    });
    try {
      await sendEmailInternal(email.studentName, email.email, email.subject, email.body);
      setPreparedEmails((prev) => {
        const n = [...prev];
        n[index].status = 'sent';
        return n;
      });
    } catch {
      setPreparedEmails((prev) => {
        const n = [...prev];
        n[index].status = 'error';
        return n;
      });
    }
  };

  const handleSendAllBulk = async () => {
    setLoading(true);
    const pending = preparedEmails
      .map((e, i) => (e.status === 'pending' || e.status === 'error' ? i : -1))
      .filter((i) => i !== -1);
    for (const index of pending) {
      await handleSendBulkItem(index);
    }
    setLoading(false);
  };

  const saveConfig = () => {
    saveEmailSettings(emailConfig);
    setShowSettings(false);
  };

  const currentPreviewEmail = preparedEmails[currentPreviewIndex];

  const showCopyFeedback = (msg: string) => {
    setCopyFeedback(msg);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleCopySubject = async () => {
    if (!currentPreviewEmail) return;
    try {
      await navigator.clipboard.writeText(currentPreviewEmail.subject);
      showCopyFeedback('Asunto copiado');
    } catch {
      showCopyFeedback('No se pudo copiar');
    }
  };

  const handleCopyBodyWithFormat = async () => {
    if (!currentPreviewEmail) return;
    try {
      const html = currentPreviewEmail.body;
      const plain = htmlToPlainText(html);
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      showCopyFeedback('Cuerpo copiado (pega en el correo con formato)');
    } catch {
      try {
        await navigator.clipboard.writeText(htmlToPlainText(currentPreviewEmail.body));
        showCopyFeedback('Cuerpo copiado (solo texto)');
      } catch {
        showCopyFeedback('No se pudo copiar');
      }
    }
  };

  const handlePrevPreview = () =>
    setCurrentPreviewIndex((prev) => Math.max(0, prev - 1));
  const handleNextPreview = () =>
    setCurrentPreviewIndex((prev) =>
      Math.min(preparedEmails.length - 1, prev + 1)
    );

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Alertas y Correos</h2>
          <p className="text-gray-500">
            Aprendices con <strong>Riesgo de deserción</strong> o <strong>Plan de mejoramiento</strong>.
            Genera y previsualiza correos desde una plantilla.
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200 flex items-center gap-2"
          title="Configurar correo"
        >
          <Settings className="w-5 h-5" />
          <span className="text-sm font-medium">Configurar Email</span>
        </button>
      </div>

      {/* Filtros y resumen */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, documento o correo..."
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none w-full bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white font-medium text-gray-700"
                value={filterFicha}
                onChange={(e) => setFilterFicha(e.target.value)}
              >
                <option value="Todas">Todas las Fichas</option>
                {fichas.map((f) => (
                  <option key={f.id} value={f.code}>
                    {f.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white font-medium text-gray-700 max-w-[min(100%,13rem)]"
                value={filterFase}
                onChange={(e) => setFilterFase(e.target.value)}
                title="Lista solo aprendices con pendientes en esta fase; la variable {evidencias} usa la misma fase"
              >
                {alertPhaseOptions.map((ph) => (
                  <option key={ph} value={ph}>
                    {ph === ALL_PHASES_LABEL ? ph : `Fase: ${ph}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <ListChecks className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white font-medium text-gray-700 max-w-[min(100%,12rem)]"
                value={filterEvidenceArea}
                onChange={(e) => setFilterEvidenceArea(e.target.value)}
                title="Área de competencia (p. ej. Técnica). Acota pendientes y la variable {evidencias}"
              >
                {alertsEvAreaOptions.map((ar) => (
                  <option key={ar} value={ar}>
                    {ar === ALL_EVIDENCE_AREAS ? ar : `Área: ${ar}`}
                  </option>
                ))}
              </select>
            </div>
            <select
              className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white font-medium text-gray-700"
              value={filterNovedad}
              onChange={(e) => setFilterNovedad(e.target.value)}
            >
              <option value="Ambos">Ambas novedades</option>
              <option value="Riesgo de deserción">Riesgo de deserción</option>
              <option value="Plan de mejoramiento">Plan de mejoramiento</option>
            </select>
          </div>
          <div className="w-full border-t border-gray-100 pt-3 mt-1">
            <button
              type="button"
              onClick={() => setAlertsEvidencePickerOpen((o) => !o)}
              className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-800 hover:text-teal-700"
            >
              <span className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-teal-600" />
                Evidencias para pendientes y {'{evidencias}'}
                <span className="font-normal text-gray-500">
                  ({alertsEvidencePickerPool.length} en listado
                  {selectedAlertEvidenceIdList.length > 0
                    ? ` · ${selectedAlertEvidenceIdList.length} fijadas`
                    : ' · todas'}
                  )
                </span>
              </span>
              <span className="text-xs text-gray-500">{alertsEvidencePickerOpen ? 'Ocultar' : 'Mostrar'}</span>
            </button>
            {alertsEvidencePickerOpen && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-gray-600">
                  Con todas marcadas se usan todas las evidencias del listado (según ficha, fase y área). Desmarca las
                  que no quieras considerar.
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedAlertEvidenceIdList([])}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                >
                  Incluir todas las del listado
                </button>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                  {alertsEvidencePickerPool.length === 0 ? (
                    <p className="text-sm text-gray-500 py-2 text-center">No hay evidencias en este contexto.</p>
                  ) : (
                    alertsEvidencePickerPool.map((a) => {
                      const implicitAll = selectedAlertEvidenceIdList.length === 0;
                      const checked = implicitAll || selectedAlertEvidenceIdList.includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className="flex items-start gap-2 text-sm text-gray-700 hover:bg-white rounded px-2 py-1 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const poolIds = alertsEvidencePickerPool.map((x) => x.id);
                              setSelectedAlertEvidenceIdList((prev) => {
                                if (prev.length === 0) {
                                  return poolIds.filter((x) => x !== a.id);
                                }
                                const s = new Set(prev);
                                if (s.has(a.id)) s.delete(a.id);
                                else s.add(a.id);
                                const arr = Array.from(s).sort();
                                if (arr.length === 0 || arr.length === poolIds.length) return [];
                                return arr;
                              });
                            }}
                            className="mt-0.5 w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                          />
                          <span className="flex-1 min-w-0">
                            <span className="font-mono text-xs text-teal-700">{shortEvidenceLabel(a.name)}</span>
                            <span className="text-gray-400 text-xs mx-1">·</span>
                            <span className="text-xs text-gray-600">{a.phase || '—'}</span>
                            {(a.detail || a.name) && (
                              <span className="block text-xs text-gray-500 truncate" title={a.detail || a.name}>
                                {a.detail || a.name}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">
              <strong className="text-gray-900">{filteredList.length}</strong> aprendices con novedad
            </span>
            {filteredList.length > 0 && (
              <span className="text-gray-400">
                ({filteredList.filter((a) => a.novedad === 'Riesgo de deserción').length} riesgo ·{' '}
                {filteredList.filter((a) => a.novedad === 'Plan de mejoramiento').length} plan mejoramiento)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Plantilla y vista previa */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
            <Edit3 className="w-5 h-5 text-teal-600" />
            Redactar plantilla
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asunto</label>
              <input
                type="text"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
                value={templateSubject}
                onChange={(e) => setTemplateSubject(e.target.value)}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-gray-700">Mensaje</label>
                <span className="text-xs text-gray-400">Variables: se reemplazan por aprendiz</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  '{estudiante}',
                  '{documento}',
                  '{programa}',
                  '{grupo}',
                  '{fecha_ultimo_ingreso}',
                  '{novedad}',
                  '{dias_sin_ingresar}',
                  '{fecha}',
                  '{evidencias}',
                ].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded border border-teal-100 hover:bg-teal-100"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-1 p-2 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-xs text-gray-500 mr-1">Formato:</span>
                <button
                  type="button"
                  onMouseDown={(e) => handleFormatMouseDown(e, 'bold')}
                  className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-gray-700"
                  title="Negrita"
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => handleFormatMouseDown(e, 'italic')}
                  className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-gray-700"
                  title="Cursiva"
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => handleFormatMouseDown(e, 'underline')}
                  className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-gray-700"
                  title="Subrayado"
                >
                  <Underline className="w-4 h-4" />
                </button>
                <select
                  className="ml-1 text-sm border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:ring-1 focus:ring-teal-500 outline-none"
                  title="Fuente"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) applyFormat('fontName', v);
                    e.target.value = '';
                  }}
                >
                  {EMAIL_FONTS.map((f) => (
                    <option key={f.value || 'default'} value={f.value}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <span className="border-l border-gray-300 h-5 mx-1" aria-hidden />
                <button
                  type="button"
                  onMouseDown={(e) => handleFormatMouseDown(e, 'insertUnorderedList')}
                  className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-gray-700"
                  title="Viñetas"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => handleFormatMouseDown(e, 'insertOrderedList')}
                  className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-gray-700"
                  title="Lista numerada"
                >
                  <ListOrdered className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => handleFormatMouseDown(e, 'indent')}
                  className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-gray-700"
                  title="Aumentar sangría"
                >
                  <IndentIncrease className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => handleFormatMouseDown(e, 'outdent')}
                  className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-gray-700"
                  title="Disminuir sangría"
                >
                  <IndentDecrease className="w-4 h-4" />
                </button>
              </div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="w-full min-h-[12rem] bg-white border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-teal-500 outline-none text-sm leading-relaxed overflow-y-auto"
                onInput={() => {
                  const el = editorRef.current;
                  if (el) setTemplateBody(el.innerHTML);
                }}
                data-placeholder="Escriba el mensaje del correo..."
              />
            </div>
            <button
              onClick={generatePreviews}
              disabled={filteredList.length === 0}
              className="w-full bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Generar vista previa ({filteredList.length})
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
            <div>
              <h3 className="font-bold text-gray-900">Vista previa del correo</h3>
              <p className="text-xs text-gray-500">
                {preparedEmails.length > 0
                  ? `${preparedEmails.length} correos listos`
                  : 'Genera la vista previa para ver el correo tal como se enviará'}
              </p>
            </div>
            {preparedEmails.length > 0 && (
              <button
                onClick={handleSendAllBulk}
                disabled={loading}
                className="px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Enviar todo
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto p-4 bg-gray-50 flex flex-col">
            {filteredList.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-gray-400">
                <Users className="w-10 h-10 mb-2 text-gray-300" />
                <p className="text-sm">No hay aprendices con Riesgo de deserción o Plan de mejoramiento.</p>
              </div>
            ) : preparedEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg m-4">
                <Clipboard className="w-10 h-10 mb-2" />
                <p className="text-sm">Configura la plantilla y pulsa &quot;Generar vista previa&quot;</p>
              </div>
            ) : (
              <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {currentPreviewEmail && (
                  <>
                    <div className="p-4 border-b border-gray-100 flex justify-between items-start">
                      <div>
                        <p className="font-bold text-gray-800">
                          {currentPreviewEmail.studentName}
                        </p>
                        <p className="text-sm text-gray-500">
                          {currentPreviewEmail.email}
                        </p>
                        <span className="text-xs text-amber-600 font-medium">
                          {currentPreviewEmail.novedad}
                        </span>
                      </div>
                      <div>
                        {currentPreviewEmail.status === 'sent' && (
                          <span className="text-green-600 text-xs font-bold flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
                            <CheckCircle className="w-3 h-3" /> Enviado
                          </span>
                        )}
                        {currentPreviewEmail.status === 'error' && (
                          <span className="text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded">
                            Error
                          </span>
                        )}
                        {currentPreviewEmail.status === 'sending' && (
                          <span className="text-teal-600 text-xs font-bold bg-teal-50 px-2 py-1 rounded flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" /> Enviando
                          </span>
                        )}
                        {currentPreviewEmail.status === 'pending' && (
                          <span className="text-gray-500 text-xs font-bold bg-gray-100 px-2 py-1 rounded">
                            Pendiente
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 p-4 bg-gray-50 text-sm text-gray-700 overflow-y-auto flex flex-col">
                      <div className="flex flex-wrap items-center gap-2 mb-2 border-b pb-2 border-gray-200">
                        <p className="font-bold text-gray-900 flex-1 min-w-0">
                          {currentPreviewEmail.subject}
                        </p>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={handleCopySubject}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                            title="Copiar asunto al portapapeles"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copiar asunto
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyBodyWithFormat}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100"
                            title="Copiar cuerpo con formato para pegar en el correo"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copiar cuerpo (con formato)
                          </button>
                        </div>
                      </div>
                      {copyFeedback && (
                        <p className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded mb-2">
                          {copyFeedback}
                        </p>
                      )}
                      <div
                        className="prose prose-sm max-w-none flex-1"
                        dangerouslySetInnerHTML={{ __html: currentPreviewEmail.body }}
                      />
                    </div>
                  </>
                )}
                <div className="p-3 border-t border-gray-200 bg-white flex justify-between items-center">
                  <button
                    onClick={handlePrevPreview}
                    disabled={currentPreviewIndex === 0}
                    className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-600"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm font-medium text-gray-600">
                    {currentPreviewIndex + 1} de {preparedEmails.length}
                  </span>
                  <button
                    onClick={handleNextPreview}
                    disabled={currentPreviewIndex === preparedEmails.length - 1}
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

      {/* Modal configuración email */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Settings className="w-5 h-5 text-teal-600" />
              Configuración de envío
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Conecta tu Gmail, SendGrid u otro servicio vía EmailJS.
            </p>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-blue-900">
                <div className="flex items-center gap-2 font-bold text-sm mb-2">
                  <Mail className="w-4 h-4" />
                  ¿Cómo conectar Gmail o SendGrid?
                </div>
                <p className="text-xs text-blue-800 mb-2 leading-relaxed">
                  Usamos <b>EmailJS</b> como puente seguro. Crea cuenta en{' '}
                  <a href="https://www.emailjs.com" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-blue-600">
                    EmailJS.com
                  </a>
                  , configura tu servicio y pega los IDs abajo.
                </p>
              </div>

              <div className="bg-teal-50 p-4 rounded-lg border border-teal-100">
                <h4 className="font-semibold text-teal-900 text-sm mb-3">
                  Datos del remitente (Instructor)
                </h4>
                <div className="grid gap-3">
                  <div>
                    <label className="block text-xs font-medium text-teal-800 mb-1">
                      Nombre para mostrar
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white border border-teal-200 rounded px-3 py-2 text-sm"
                      placeholder="Ej: Instructor Juan Pérez"
                      value={emailConfig.teacherName}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, teacherName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-teal-800 mb-1">
                      Tu correo (responder a)
                    </label>
                    <input
                      type="email"
                      className="w-full bg-white border border-teal-200 rounded px-3 py-2 text-sm"
                      placeholder="instructor@ejemplo.com"
                      value={emailConfig.teacherEmail}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, teacherEmail: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h4 className="font-semibold text-gray-900 text-sm mb-3">
                  Credenciales EmailJS
                  {(!emailConfig.serviceId || !emailConfig.publicKey) && (
                    <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                      Modo simulación
                    </span>
                  )}
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Service ID
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                      placeholder="service_xxxxx"
                      value={emailConfig.serviceId}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, serviceId: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Template ID
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                      placeholder="template_xxxxx"
                      value={emailConfig.templateId}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, templateId: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Public Key (User ID)
                    </label>
                    <input
                      type="password"
                      className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                      placeholder="user_xxxxx"
                      value={emailConfig.publicKey}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, publicKey: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={saveConfig}
                className="bg-gray-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-black"
              >
                Guardar configuración
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

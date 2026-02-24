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

export const AlertsView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [lmsLastAccess, setLmsLastAccess] = useState<Record<string, string>>({});
  const [gradeActivities, setGradeActivities] = useState<GradeActivity[]>([]);
  const [grades, setGrades] = useState<GradeEntry[]>([]);

  const [filterFicha, setFilterFicha] = useState<string>('Todas');
  const [filterNovedad, setFilterNovedad] = useState<string>('Ambos');
  const [searchTerm, setSearchTerm] = useState('');

  // Plantilla de correo (deserción - ver email/correo_desercion.txt)
  const [templateSubject, setTemplateSubject] = useState(
    'Notificación de Inicio de Proceso de Deserción'
  );
  const [templateBody, setTemplateBody] = useState(
    `Estimado(a) Aprendiz: 
{estudiante}
{documento}
{programa}
{grupo}

Reciba un cordial saludo.
Como instructor responsable de su proceso formativo en el programa {programa}, me permito comunicarle que, tras la revisión del sistema de gestión académica Zajuna, se ha evidenciado que usted no registra ingresos a la plataforma ni reporte de actividades desde el día {fecha_ultimo_ingreso}.
De acuerdo con el Acuerdo 009 de 2024 (Reglamento del Aprendiz SENA), su situación se enmarca en la causal de deserción establecida para la modalidad virtual, la cual cito a continuación:
•	Artículo 30º. Deserción: Se considera deserción en el proceso de formación, cuando el aprendiz:
o	Numeral 3: "En la formación titulada en modalidad virtual y a distancia, cuando el aprendiz no reporte actividades de aprendizaje por cinco (5) días calendario consecutivos, o no ingrese a la plataforma por este mismo término, sin que presente justificación alguna dentro de este tiempo".
En virtud de lo anterior, y garantizando su Derecho al Debido Proceso (Artículo 5º, numeral 10) y su Derecho a ser Notificado de las novedades académicas (Artículo 5º, numeral 11), se le concede un plazo de cinco (5) días hábiles, contados a partir del envío de este correo, para que presente las evidencias o soportes que justifiquen su incumplimiento. 
A continuación, se describen los siguientes escenarios:
•	Justificación válida: Deberá responder a este correo electrónico adjuntando los soportes (médicos, laborales o de fuerza mayor) que expliquen su ausencia.
En caso de que existan situaciones personales, laborales o de fuerza mayor que le impidan continuar, informarle sobre su derecho a solicitar un Retiro Voluntario.
•	Novedad de Retiro Voluntario: Es la solicitud formal que el aprendiz presenta ante el Centro de Formación para retirarse del programa. A diferencia de la deserción, el retiro voluntario debidamente justificado puede evitar o disminuir los términos de sanción para futuras inscripciones, siempre que se realice antes de que se formalice el proceso de deserción por parte de la entidad.

•	Consecuencia: Si transcurrido este plazo usted no presenta una justificación válida o no se reporta, el Centro de Formación procederá a tramitar la deserción y la cancelación de su matrícula en el programa de formación, con la respectiva sanción de no poder participar en procesos de ingreso al SENA por el término establecido en el reglamento.

Atentamente,`
  );

  const [preparedEmails, setPreparedEmails] = useState<PreparedEmail[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
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

  const gradeMap = useMemo(() => {
    const map = new Map<string, GradeEntry>();
    grades.forEach((g) => map.set(`${g.studentId}-${g.activityId}`, g));
    return map;
  }, [grades]);

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

  // Aprendices con novedad "Riesgo de deserción" o "Plan de mejoramiento"
  const apprenticesWithNovedad = useMemo((): ApprenticeWithNovedad[] => {
    return students
      .filter((s) => {
        const status = s.status || 'Formación';
        if (status !== 'Formación') return false;
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
  }, [students, lmsLastAccess, gradeActivities, grades, gradeMap]);

  const filteredList = useMemo(() => {
    let list =
      filterFicha === 'Todas'
        ? [...apprenticesWithNovedad]
        : apprenticesWithNovedad.filter((a) => (a.student.group || '') === filterFicha);

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
  }, [apprenticesWithNovedad, filterFicha, filterNovedad, searchTerm]);

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
    document.execCommand(command, false, value ?? '');
    const el = editorRef.current;
    if (el) setTemplateBody(el.innerHTML);
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

      let subject = templateSubject
        .replace(/{estudiante}/g, fullName)
        .replace(/{novedad}/g, novedad)
        .replace(/{grupo}/g, student.group || '')
        .replace(/{dias_sin_ingresar}/g, diasStr)
        .replace(/{fecha}/g, fecha)
        .replace(/{documento}/g, student.documentNumber || '')
        .replace(/{programa}/g, programName)
        .replace(/{fecha_ultimo_ingreso}/g, lastAccessFormatted);

      const safe = escapeHtml;
      let body = templateBody
        .replace(/{estudiante}/g, safe(fullName))
        .replace(/{novedad}/g, safe(novedad))
        .replace(/{grupo}/g, safe(student.group || ''))
        .replace(/{dias_sin_ingresar}/g, safe(diasStr))
        .replace(/{fecha}/g, safe(fecha))
        .replace(/{documento}/g, safe(student.documentNumber || 'N/A'))
        .replace(/{programa}/g, safe(programName))
        .replace(/{fecha_ultimo_ingreso}/g, safe(lastAccessFormatted));

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
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-gray-700"
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
            <select
              className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-gray-700"
              value={filterNovedad}
              onChange={(e) => setFilterNovedad(e.target.value)}
            >
              <option value="Ambos">Ambas novedades</option>
              <option value="Riesgo de deserción">Riesgo de deserción</option>
              <option value="Plan de mejoramiento">Plan de mejoramiento</option>
            </select>
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
            <Edit3 className="w-5 h-5 text-indigo-600" />
            Redactar plantilla
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asunto</label>
              <input
                type="text"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
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
                ].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 hover:bg-indigo-100"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-1 p-2 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-xs text-gray-500 mr-1">Formato:</span>
                <button
                  type="button"
                  onClick={() => applyFormat('bold')}
                  className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-gray-700"
                  title="Negrita"
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat('italic')}
                  className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-gray-700"
                  title="Cursiva"
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat('underline')}
                  className="p-1.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-gray-700"
                  title="Subrayado"
                >
                  <Underline className="w-4 h-4" />
                </button>
                <select
                  className="ml-1 text-sm border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:ring-1 focus:ring-indigo-500 outline-none"
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
              </div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="w-full min-h-[12rem] bg-white border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm leading-relaxed overflow-y-auto"
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
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
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
                          <span className="text-indigo-600 text-xs font-bold bg-indigo-50 px-2 py-1 rounded flex items-center gap-1">
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
                    <div className="flex-1 p-4 bg-gray-50 text-sm text-gray-700 overflow-y-auto">
                      <p className="font-bold mb-2 text-gray-900 border-b pb-2 border-gray-200">
                        {currentPreviewEmail.subject}
                      </p>
                      <div
                        className="prose prose-sm max-w-none"
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
              <Settings className="w-5 h-5 text-indigo-600" />
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

              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                <h4 className="font-semibold text-indigo-900 text-sm mb-3">
                  Datos del remitente (Instructor)
                </h4>
                <div className="grid gap-3">
                  <div>
                    <label className="block text-xs font-medium text-indigo-800 mb-1">
                      Nombre para mostrar
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white border border-indigo-200 rounded px-3 py-2 text-sm"
                      placeholder="Ej: Instructor Juan Pérez"
                      value={emailConfig.teacherName}
                      onChange={(e) =>
                        setEmailConfig({ ...emailConfig, teacherName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-indigo-800 mb-1">
                      Tu correo (responder a)
                    </label>
                    <input
                      type="email"
                      className="w-full bg-white border border-indigo-200 rounded px-3 py-2 text-sm"
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

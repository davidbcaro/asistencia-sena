import React, { useState, useEffect, useRef } from 'react';
import { Mail, RefreshCw, CheckCircle, Send, Settings, X, Edit3, Clipboard, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { getStudents, getAttendance, getEmailSettings, saveEmailSettings } from '../services/db';
import { Student, EmailSettings } from '../types';

interface PreparedEmail {
    studentId: string;
    studentName: string;
    email: string;
    absences: number;
    subject: string;
    body: string;
    status?: 'pending' | 'sending' | 'sent' | 'error';
}

export const AlertsView: React.FC = () => {
  const getLocalToday = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState<string>(getLocalToday());
  const [absentStudents, setAbsentStudents] = useState<Student[]>([]);
  
  // Template State (For Bulk Mode)
  const [templateSubject, setTemplateSubject] = useState('Aviso de Inasistencia - {fecha}');
  const [templateBody, setTemplateBody] = useState('Hola {estudiante},\nGrupo: {grupo}\n\nNotamos que no asististe a la clase del día {fecha}.\nActualmente tienes {fallas} fallas acumuladas.\nFechas: {fechas_acumuladas}\n\nPor favor contáctame si tienes alguna justificación.\n\nAtentamente,\nInstructor.');
  
  // Bulk Mode State
  const [preparedEmails, setPreparedEmails] = useState<PreparedEmail[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0); // Pagination state
  const [loading, setLoading] = useState(false); // Used for sending progress mainly now

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [emailConfig, setEmailConfig] = useState<EmailSettings>({
      teacherName: '',
      teacherEmail: '',
      serviceId: '',
      templateId: '',
      publicKey: ''
  });

  const dateInputRef = useRef<HTMLInputElement>(null);

  const loadData = () => {
    // Identify absentees
    const students = getStudents();
    const records = getAttendance();
    const absentees = students.filter(s => {
      const record = records.find(r => r.date === date && r.studentId === s.id);
      return record && !record.present;
    });
    setAbsentStudents(absentees);
  };

  useEffect(() => {
    // Load config
    setEmailConfig(getEmailSettings());
    loadData();

    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, [date]);

  useEffect(() => {
    setPreparedEmails([]);
  }, [date]);

  const getAbsenceInfo = (studentId: string) => {
    const records = getAttendance();
    // Get all absences (where present is false)
    const absences = records.filter(r => r.studentId === studentId && !r.present);
    
    // Sort chronologically
    absences.sort((a, b) => a.date.localeCompare(b.date));

    return {
        count: absences.length,
        dates: absences.map(r => r.date),
        datesString: absences.map(r => r.date).join(', ')
    };
  };

  const openDatePicker = (e: React.MouseEvent) => {
      if (e.target === dateInputRef.current) return;
      if (dateInputRef.current) {
          try {
              dateInputRef.current.showPicker();
          } catch (err) {
              dateInputRef.current.focus();
          }
      }
  };

  // --- TEMPLATE LOGIC ---
  const insertVariable = (variable: string) => {
      setTemplateBody(prev => prev + ` ${variable}`);
  };

  const generatePreviews = () => {
    if (absentStudents.length === 0) return;
    
    const results: PreparedEmail[] = absentStudents.map(student => {
        const { count, datesString } = getAbsenceInfo(student.id);
        const fullName = `${student.firstName} ${student.lastName}`;
        
        // Replace variables
        let subject = templateSubject.replace('{estudiante}', fullName)
                                     .replace('{fecha}', date)
                                     .replace('{documento}', student.documentNumber || '')
                                     .replace('{fallas}', count.toString())
                                     .replace('{grupo}', student.group || '');

        let body = templateBody.replace(/{estudiante}/g, fullName)
                               .replace(/{fecha}/g, date)
                               .replace(/{documento}/g, student.documentNumber || 'N/A')
                               .replace(/{fallas}/g, count.toString())
                               .replace(/{fechas_acumuladas}/g, datesString)
                               .replace(/{grupo}/g, student.group || '');

        return {
            studentId: student.id,
            studentName: fullName,
            email: student.email,
            absences: count,
            subject: subject,
            body: body,
            status: 'pending'
        };
    });
    
    setPreparedEmails(results);
    setCurrentPreviewIndex(0); // Reset to first page
  };

  // --- SENDING LOGIC ---
  const sendEmailInternal = async (toName: string, toEmail: string, subject: string, body: string) => {
    const { serviceId, templateId, publicKey, teacherName, teacherEmail } = emailConfig;

    // Simulation Mode
    if (!serviceId || !publicKey) {
        console.log("Simulating email send to:", toEmail);
        console.log("Subject:", subject);
        await new Promise(resolve => setTimeout(resolve, 800)); // Faster simulation
        return { success: true, simulated: true };
    }

    // Real Mode via EmailJS
    try {
        await emailjs.send(serviceId, templateId, {
            to_name: toName,
            to_email: toEmail,
            from_name: teacherName || 'Instructor',
            reply_to: teacherEmail,
            subject: subject,
            message: body
        }, publicKey);
        return { success: true, simulated: false };
    } catch (err) {
        console.error("EmailJS Error:", err);
        throw err;
    }
  };

  const handleSendBulkItem = async (index: number) => {
    const email = preparedEmails[index];
    if (email.status === 'sent') return;

    // Update status to sending
    setPreparedEmails(prev => {
        const n = [...prev];
        n[index].status = 'sending';
        return n;
    });

    try {
        await sendEmailInternal(email.studentName, email.email, email.subject, email.body);
        setPreparedEmails(prev => {
            const n = [...prev];
            n[index].status = 'sent';
            return n;
        });
    } catch (err) {
        setPreparedEmails(prev => {
            const n = [...prev];
            n[index].status = 'error';
            return n;
        });
    }
  };

  const handleSendAllBulk = async () => {
     setLoading(true);
     const pendingIndices = preparedEmails.map((e, i) => e.status === 'pending' || e.status === 'error' ? i : -1).filter(i => i !== -1);
     
     for (const index of pendingIndices) {
         await handleSendBulkItem(index);
     }
     setLoading(false);
  };

  const saveConfig = () => {
      saveEmailSettings(emailConfig);
      setShowSettings(false);
  };

  // Pagination Handlers
  const currentPreviewEmail = preparedEmails[currentPreviewIndex];
  const handlePrevPreview = () => setCurrentPreviewIndex(prev => Math.max(0, prev - 1));
  const handleNextPreview = () => setCurrentPreviewIndex(prev => Math.min(preparedEmails.length - 1, prev + 1));

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Alertas y Correos</h2>
          <p className="text-gray-500">Envía notificaciones de inasistencia masivas usando plantillas.</p>
        </div>
        
        <div className="flex items-center gap-2">
             <button 
                onClick={() => setShowSettings(true)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200 flex items-center gap-2"
                title="Configurar Correo y Remitente"
            >
                <Settings className="w-5 h-5" />
                <span className="text-sm font-medium">Configurar Email</span>
            </button>
        </div>
      </div>

      {/* Date Filter */}
      <div 
        onClick={openDatePicker}
        className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm flex items-center space-x-2 w-full md:w-auto md:max-w-xs cursor-pointer hover:bg-gray-50 transition-colors relative"
      >
        <Calendar className="w-5 h-5 text-gray-500 ml-2 flex-shrink-0" />
        <div className="flex flex-col w-full">
            <span className="text-xs text-gray-500 font-medium">Filtrar fallas del día:</span>
            <input 
                ref={dateInputRef}
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent border-none p-0 text-sm focus:ring-0 text-gray-700 font-medium cursor-pointer outline-none w-full"
                style={{ colorScheme: 'light' }}
            />
        </div>
      </div>

      {/* --- BULK MODE (TEMPLATE) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Left: Template Editor */}
            <div className="space-y-4">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
                        <Edit3 className="w-5 h-5 text-indigo-600" />
                        Redactar Plantilla
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
                                <span className="text-xs text-gray-400">Usa variables para personalizar</span>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-2">
                                {['{estudiante}', '{fecha}', '{fallas}', '{fechas_acumuladas}', '{documento}', '{grupo}'].map(v => (
                                    <button 
                                        key={v}
                                        onClick={() => insertVariable(v)}
                                        className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 hover:bg-indigo-100 transition-colors"
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                            <textarea 
                                className="w-full bg-white h-48 border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm leading-relaxed"
                                value={templateBody}
                                onChange={(e) => setTemplateBody(e.target.value)}
                            />
                        </div>

                        <button 
                            onClick={generatePreviews}
                            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium flex items-center justify-center gap-2 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Generar Vista Previa ({absentStudents.length})
                        </button>
                    </div>
                </div>
            </div>

            {/* Right: Preview & Send */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-[600px] lg:h-auto">
                 <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
                     <div>
                        <h3 className="font-bold text-gray-900">Vista Previa y Envío</h3>
                        <p className="text-xs text-gray-500">
                            {preparedEmails.length > 0 ? `${preparedEmails.length} correos listos` : 'Genera la vista previa primero'}
                        </p>
                     </div>
                     {preparedEmails.length > 0 && (
                         <button
                            onClick={handleSendAllBulk}
                            disabled={loading}
                            className="px-4 py-2 rounded-lg font-medium flex items-center space-x-2 text-white shadow-sm transition-all bg-green-600 hover:bg-green-700 disabled:opacity-50"
                         >
                            {loading ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4" />}
                            <span>Enviar Todo</span>
                         </button>
                     )}
                 </div>

                 <div className="flex-1 overflow-auto p-4 bg-gray-50 flex flex-col">
                    {absentStudents.length === 0 ? (
                         <div className="flex flex-col items-center justify-center h-full text-gray-400">
                             <CheckCircle className="w-10 h-10 mb-2 text-green-500" />
                             <p className="text-sm">No hay inasistencias hoy.</p>
                         </div>
                    ) : preparedEmails.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 border-2 border-dashed border-gray-200 rounded-lg m-4">
                            <Clipboard className="w-10 h-10 mb-2" />
                            <p className="text-sm">Configura la plantilla y presiona "Generar"</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                            {/* Individual Preview Card */}
                            {currentPreviewEmail && (
                                <>
                                    <div className="p-4 border-b border-gray-100 flex justify-between items-start">
                                        <div>
                                            <p className="font-bold text-gray-800">{currentPreviewEmail.studentName}</p>
                                            <p className="text-sm text-gray-500">{currentPreviewEmail.email}</p>
                                        </div>
                                        <div>
                                             {currentPreviewEmail.status === 'sent' && <span className="text-green-600 text-xs font-bold flex items-center bg-green-50 px-2 py-1 rounded"><CheckCircle className="w-3 h-3 mr-1"/> Enviado</span>}
                                             {currentPreviewEmail.status === 'error' && <span className="text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded">Error</span>}
                                             {currentPreviewEmail.status === 'sending' && <span className="text-indigo-600 text-xs font-bold bg-indigo-50 px-2 py-1 rounded flex items-center"><RefreshCw className="w-3 h-3 mr-1 animate-spin"/> Enviando</span>}
                                             {currentPreviewEmail.status === 'pending' && <span className="text-gray-500 text-xs font-bold bg-gray-100 px-2 py-1 rounded">Pendiente</span>}
                                        </div>
                                    </div>
                                    <div className="flex-1 p-4 bg-gray-50 font-mono text-sm text-gray-700 whitespace-pre-wrap overflow-y-auto">
                                        <p className="font-bold mb-2 text-gray-900 border-b pb-2 border-gray-200">{currentPreviewEmail.subject}</p>
                                        {currentPreviewEmail.body}
                                    </div>
                                </>
                            )}
                            
                            {/* Pagination Controls */}
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

      {/* --- SETTINGS MODAL --- */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative">
                <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                </button>
                
                <h3 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-indigo-600" />
                    Configuración de Envío
                </h3>
                <p className="text-sm text-gray-500 mb-6">Conecta tu Gmail, SendGrid u otro servicio.</p>

                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    
                    {/* HELP SECTION */}
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-blue-900">
                        <div className="flex items-center gap-2 font-bold text-sm mb-2">
                            <Mail className="w-4 h-4" />
                            ¿Cómo conectar Gmail o SendGrid?
                        </div>
                        <p className="text-xs text-blue-800 mb-2 leading-relaxed">
                            Por seguridad, los navegadores no permiten conexión SMTP directa. 
                            Usamos <b>EmailJS</b> como puente seguro para conectar tus servicios.
                        </p>
                        <ol className="list-decimal ml-5 space-y-1 text-xs text-blue-800">
                            <li>Crea cuenta gratis en <a href="https://www.emailjs.com" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-blue-600">EmailJS.com</a>.</li>
                            <li>En <b>"Email Services"</b>:
                                <ul className="list-disc ml-4 mt-1 mb-1">
                                    <li>Añade <b>Gmail</b> (para cuentas personales).</li>
                                    <li>O añade <b>SendGrid</b> (para dominios propios/profesionales).</li>
                                </ul>
                            </li>
                            <li>Si usas SendGrid, necesitarás pegar allí tu <b>SendGrid API Key</b>.</li>
                            <li>Finalmente, copia los IDs de EmailJS y pégalos abajo.</li>
                        </ol>
                    </div>

                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                        <h4 className="font-semibold text-indigo-900 text-sm mb-3">Datos del Remitente (Instructor)</h4>
                        <div className="grid gap-3">
                            <div>
                                <label className="block text-xs font-medium text-indigo-800 mb-1">Nombre para mostrar</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-white border border-indigo-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="Ej: Instructor Juan Pérez"
                                    value={emailConfig.teacherName}
                                    onChange={e => setEmailConfig({...emailConfig, teacherName: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-indigo-800 mb-1">Tu Correo (Responder a)</label>
                                <input 
                                    type="email" 
                                    className="w-full bg-white border border-indigo-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="instructor@ejemplo.com"
                                    value={emailConfig.teacherEmail}
                                    onChange={e => setEmailConfig({...emailConfig, teacherEmail: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-200 pt-4">
                        <h4 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-2">
                            Credenciales EmailJS
                            {(!emailConfig.serviceId || !emailConfig.publicKey) && <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">Modo Simulación Activo</span>}
                        </h4>
                        
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Service ID (ej: service_sendgrid)</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:ring-indigo-500 outline-none font-mono"
                                    placeholder="service_xxxxx"
                                    value={emailConfig.serviceId}
                                    onChange={e => setEmailConfig({...emailConfig, serviceId: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Template ID</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:ring-indigo-500 outline-none font-mono"
                                    placeholder="template_xxxxx"
                                    value={emailConfig.templateId}
                                    onChange={e => setEmailConfig({...emailConfig, templateId: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Public Key (User ID)</label>
                                <input 
                                    type="password" 
                                    className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:ring-indigo-500 outline-none font-mono"
                                    placeholder="user_xxxxx"
                                    value={emailConfig.publicKey}
                                    onChange={e => setEmailConfig({...emailConfig, publicKey: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button 
                        onClick={saveConfig}
                        className="bg-gray-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-black transition-colors"
                    >
                        Guardar Configuración
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
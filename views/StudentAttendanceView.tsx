import React, { useState } from 'react';
import { QrCode, CheckCircle, XCircle, History, AlertTriangle, UserCheck, Calendar, ArrowRight, Search, FileText } from 'lucide-react';
import { getStudents, getAttendance, saveAttendanceRecord, getSessions } from '../services/db';
import { Student, AttendanceRecord } from '../types';

export const StudentAttendanceView: React.FC = () => {
  const [mode, setMode] = useState<'register' | 'consult'>('register');
  const [step, setStep] = useState<'input' | 'success'>('input');
  
  const [docNumber, setDocNumber] = useState('');
  const [classCode, setClassCode] = useState('');
  const [error, setError] = useState('');
  
  // Success State Data
  const [studentData, setStudentData] = useState<Student | null>(null);
  const [history, setHistory] = useState<{date: string, present: boolean}[]>([]);
  const [stats, setStats] = useState({ present: 0, absent: 0 });

  const getLocalToday = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const students = getStudents();
    const allAttendance = getAttendance(); // Fetch early for validation
    const sessions = getSessions();
    const today = getLocalToday();

    // 1. Find Student
    const student = students.find(s => s.documentNumber === docNumber.trim());

    if (!student) {
        setError('No se encontró un aprendiz con este número de documento.');
        return;
    }

    // 2. Validate Class Code (Matches Group/Ficha)
    if (student.group !== classCode.trim()) {
        setError(`El código de clase no coincide con tu grupo asignado (${student.group}).`);
        return;
    }

    // 3. Action based on Mode
    if (mode === 'register') {
        
        // 3a. CHECK IF SESSION IS ENABLED (NEW CHECK)
        const sessionExists = sessions.some(session => 
            session.date === today && 
            (session.group === 'Todas' || session.group === 'Todos' || session.group === student.group)
        );

        if (!sessionExists) {
            setError(`No hay una sesión habilitada para la fecha de hoy (${today}) en tu ficha.`);
            return;
        }

        // 3b. Check for duplicate attendance
        // We check if there is a PRESENT record. If there is an ABSENT record for today (set by instructor), we overwrite/ignore it here.
        const alreadyRegistered = allAttendance.some(
            r => r.studentId === student.id && r.date === today && r.present
        );

        if (alreadyRegistered) {
             setError(`Hola ${student.firstName}, ya registraste tu asistencia el día de hoy.`);
             return;
        }

        saveAttendanceRecord(today, student.id, true);
        
        // Push the new record locally so the dashboard shows it immediately
        // Note: saveAttendanceRecord handles upsert/overwrite logic in DB service
        allAttendance.push({ date: today, studentId: student.id, present: true });
    } 
    // If mode is 'consult', we skip saving and just show data.

    // 4. Load History for Dashboard
    const rawRecords = allAttendance
        .filter(r => r.studentId === student.id)
        .sort((a, b) => b.date.localeCompare(a.date)); // Newest first

    // FILTER LOGIC FOR STUDENT VIEW:
    // A student should NOT see "Absent" for TODAY, because the day hasn't finished.
    // They should only see today's record if they are "Present".
    const visibleHistory = rawRecords.filter(r => {
        // If it's today AND they are absent, hide it from the student view.
        if (r.date === today && !r.present) return false;
        return true;
    });

    const presentCount = visibleHistory.filter(r => r.present).length;
    const absentCount = visibleHistory.filter(r => !r.present).length;

    setStudentData(student);
    setHistory(visibleHistory);
    setStats({ present: presentCount, absent: absentCount });
    setStep('success');
  };

  const handleReset = () => {
      setStep('input');
      setDocNumber('');
      setClassCode('');
      setStudentData(null);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] bg-gray-50 p-4">
      
      {/* HEADER LOGO AREA */}
      <div className="mb-6 text-center">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
            <UserCheck className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Portal Aprendiz</h1>
        <p className="text-gray-500 mt-2">Gestiona tu asistencia académica.</p>
      </div>

      {step === 'input' && (
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in">
            
            {/* TABS */}
            <div className="flex border-b border-gray-100">
                <button
                    onClick={() => setMode('register')}
                    className={`flex-1 py-4 text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
                        mode === 'register' 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                >
                    <QrCode className="w-4 h-4" />
                    Registrar Asistencia
                </button>
                <button
                    onClick={() => setMode('consult')}
                    className={`flex-1 py-4 text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
                        mode === 'consult' 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                >
                    <Search className="w-4 h-4" />
                    Consultar Histórico
                </button>
            </div>

            <div className="bg-indigo-50/50 p-6 text-indigo-900 border-b border-indigo-50">
                {mode === 'register' ? (
                    <>
                        <h2 className="text-lg font-bold">Marcar presencia hoy</h2>
                        <p className="text-sm opacity-80 mt-1">{new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </>
                ) : (
                     <>
                        <h2 className="text-lg font-bold">Revisar mis Alertas</h2>
                        <p className="text-sm opacity-80 mt-1">Consulta tus fallas y asistencias pasadas.</p>
                    </>
                )}
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Número de Documento</label>
                    <input 
                        type="text" 
                        required
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-lg shadow-sm"
                        placeholder="Ej: 1098765432"
                        value={docNumber}
                        onChange={(e) => setDocNumber(e.target.value)}
                    />
                </div>
                
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Ficha</label>
                    <input 
                        type="text" 
                        required
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-lg uppercase shadow-sm"
                        placeholder="Ej: 2902090"
                        value={classCode}
                        onChange={(e) => setClassCode(e.target.value)}
                    />
                </div>

                {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 font-medium">{error}</p>
                    </div>
                )}

                <button 
                    type="submit"
                    className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl transition-all transform active:scale-95 shadow-lg flex justify-center items-center gap-2"
                >
                    {mode === 'register' ? (
                        <>
                            <span>Registrar mi Asistencia</span>
                            <ArrowRight className="w-5 h-5" />
                        </>
                    ) : (
                        <>
                            <span>Ver mi Historial</span>
                            <FileText className="w-5 h-5" />
                        </>
                    )}
                </button>
            </form>
        </div>
      )}

      {step === 'success' && studentData && (
        <div className="w-full max-w-2xl animate-fade-in space-y-6">
            {/* Success Card */}
            <div className={`bg-white rounded-2xl shadow-xl border overflow-hidden relative ${mode === 'register' ? 'border-green-100' : 'border-indigo-100'}`}>
                <div className={`absolute top-0 left-0 w-full h-2 ${mode === 'register' ? 'bg-green-500' : 'bg-indigo-500'}`}></div>
                <div className="p-8 text-center">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce-short ${mode === 'register' ? 'bg-green-100' : 'bg-indigo-100'}`}>
                        {mode === 'register' ? <CheckCircle className="w-10 h-10 text-green-600" /> : <UserCheck className="w-10 h-10 text-indigo-600" />}
                    </div>
                    
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        {mode === 'register' ? '¡Asistencia Registrada!' : 'Reporte de Aprendiz'}
                    </h2>
                    <p className="text-gray-500 mb-6">
                        {mode === 'register' ? 'Tu presencia ha sido confirmada para el día de hoy.' : 'A continuación el resumen de tu actividad académica.'}
                    </p>
                    
                    <div className="bg-gray-50 rounded-xl p-4 inline-block text-left w-full max-w-sm border border-gray-200">
                        <div className="flex justify-between items-center mb-2 border-b border-gray-200 pb-2">
                            <span className="text-xs text-gray-400 uppercase font-bold">Aprendiz</span>
                            <span className="text-indigo-600 font-bold font-mono">{studentData.documentNumber}</span>
                        </div>
                        <p className="text-lg font-bold text-gray-800">{studentData.firstName} {studentData.lastName}</p>
                        <p className="text-sm text-gray-500">{studentData.email}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Stats Card */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <History className="w-5 h-5 text-indigo-600" />
                        Resumen Histórico
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-green-50 p-4 rounded-xl text-center border border-green-100">
                            <p className="text-2xl font-bold text-green-700">{stats.present}</p>
                            <p className="text-xs font-medium text-green-600 uppercase">Asistencias</p>
                        </div>
                        <div className="bg-red-50 p-4 rounded-xl text-center border border-red-100">
                            <p className="text-2xl font-bold text-red-700">{stats.absent}</p>
                            <p className="text-xs font-medium text-red-600 uppercase">Fallas</p>
                        </div>
                    </div>
                    
                    {/* Alerts Logic */}
                    {stats.absent > 0 ? (
                        <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 ${
                            stats.absent >= 3 
                                ? 'bg-red-50 border border-red-200' 
                                : 'bg-yellow-50 border border-yellow-200'
                        }`}>
                            <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                                stats.absent >= 3 ? 'text-red-600' : 'text-yellow-600'
                            }`} />
                            <div>
                                <p className={`text-sm font-bold ${
                                    stats.absent >= 3 ? 'text-red-800' : 'text-yellow-800'
                                }`}>
                                    {stats.absent >= 3 ? 'Alerta Crítica de Asistencia' : 'Atención a tus fallas'}
                                </p>
                                <p className={`text-xs mt-1 ${
                                    stats.absent >= 3 ? 'text-red-700' : 'text-yellow-700'
                                }`}>
                                    {stats.absent >= 3 
                                        ? 'Has superado el límite de inasistencias recomendado. Por favor contacta a coordinación.' 
                                        : 'Tienes algunas inasistencias registradas. Procura no faltar.'}
                                </p>
                            </div>
                        </div>
                    ) : (
                         <div className="mt-4 p-4 rounded-xl flex items-start gap-3 bg-green-50 border border-green-200">
                             <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0"/>
                             <div>
                                 <p className="text-sm font-bold text-green-800">¡Excelente Asistencia!</p>
                                 <p className="text-xs mt-1 text-green-700">No tienes fallas registradas. Sigue así.</p>
                             </div>
                         </div>
                    )}
                </div>

                {/* Recent History List */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 max-h-80 overflow-y-auto">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-500" />
                        Últimos Registros
                    </h3>
                    {history.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">No hay historial previo.</p>
                    ) : (
                        <div className="space-y-3">
                            {history.map((record, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                                    <span className="text-sm font-medium text-gray-600">{record.date}</span>
                                    {record.present ? (
                                        <span className="flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                                            <CheckCircle className="w-3 h-3" /> Presente
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-full">
                                            <XCircle className="w-3 h-3" /> Ausente
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <button 
                onClick={handleReset}
                className="w-full bg-white border border-gray-300 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
                Volver al Inicio
            </button>
        </div>
      )}
    </div>
  );
};
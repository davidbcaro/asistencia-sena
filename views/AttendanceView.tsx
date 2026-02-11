import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, Check, X, Save, Filter, Users, Upload, FileText, Download, CheckCircle, Search, ChevronLeft, ChevronRight, Settings, Plus, Trash2, RotateCcw, History, AlertTriangle, Lock } from 'lucide-react';
import { Student, AttendanceRecord, ClassSession } from '../types';
import { getStudents, getAttendanceForDate, bulkSaveAttendance, getSessions, addSession, deleteSession, getAttendance, syncFromCloud } from '../services/db';

export const AttendanceView: React.FC = () => {
  // Helper to get local date YYYY-MM-DD correctly
  const getLocalToday = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState<string>(getLocalToday());
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceState, setAttendanceState] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('Todos');
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  
  // History State
  const [recordedDates, setRecordedDates] = useState<string[]>([]);

  // Search & Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  // Modals State
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  
  // Delete Confirmation State
  const [sessionToDelete, setSessionToDelete] = useState<ClassSession | null>(null);

  // Import State
  const [importText, setImportText] = useState('');
  const [importStats, setImportStats] = useState<{matched: number, total: number} | null>(null);

  // Session Management Form
  const [newSessionDate, setNewSessionDate] = useState(getLocalToday());
  const [newSessionGroup, setNewSessionGroup] = useState('Todas');
  const [newSessionDesc, setNewSessionDesc] = useState('');

  // Ref for Date Picker
  const dateInputRef = useRef<HTMLInputElement>(null);

  const loadData = () => {
      setStudents(getStudents());
      const currentSessions = getSessions();
      setSessions(currentSessions);
      
      // Load Recorded Dates based on Active Sessions
      // Only show dates that exist in the sessions list to avoid "ghost" dates
      const validDates = new Set(currentSessions.map(s => s.date));
      const sortedDates = Array.from(validDates).sort((a: string, b: string) => b.localeCompare(a));
      
      setRecordedDates(sortedDates);
  };

  useEffect(() => {
    // Sync from cloud first to get latest attendance records from students
    syncFromCloud().then(() => loadData()).catch(() => loadData());
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  // Compute unique groups
  const groups = useMemo(() => {
    const g = new Set(students.map(s => s.group || 'General'));
    return ['Todos', ...Array.from(g).sort()];
  }, [students]);

  // VALIDATION: Check if a session exists for current selection
  const isSessionValid = useMemo(() => {
    return sessions.some(session => 
        session.date === date && 
        (session.group === 'Todas' || session.group === 'Todos' || session.group === selectedGroup)
    );
  }, [sessions, date, selectedGroup]);

  // Filter and Sort Students (by Group AND Search)
  const filteredStudents = useMemo(() => {
    let filtered = students;
    
    // 1. Filter by Group
    if (selectedGroup !== 'Todos') {
      filtered = students.filter(s => (s.group || 'General') === selectedGroup);
    }
    
    // 2. Filter by Search Term
    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(s => 
            s.firstName.toLowerCase().includes(term) || 
            s.lastName.toLowerCase().includes(term) ||
            (s.documentNumber && s.documentNumber.includes(term))
        );
    }

    // Sort alphabetically by last name then first name
    return filtered.sort((a, b) => {
        const cmp = a.lastName.localeCompare(b.lastName);
        return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName);
    });
  }, [students, selectedGroup, searchTerm]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE);
  const paginatedStudents = filteredStudents.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
  );

  // Reset page on filter change
  useEffect(() => {
      setCurrentPage(1);
  }, [selectedGroup, searchTerm]);

  useEffect(() => {
    // Load existing attendance for selected date
    const records = getAttendanceForDate(date);
    const state: Record<string, boolean> = {};
    
    students.forEach(s => {
      const record = records.find(r => r.studentId === s.id);
      // Default state is FALSE (Absent/Falla) if no record exists
      state[s.id] = record ? record.present : false; 
    });
    setAttendanceState(state);
    setSaved(false);
  }, [date, students]);

  const toggleAttendance = (studentId: string) => {
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
    setSaved(false);
  };

  const handleResetAll = () => {
      if (filteredStudents.length === 0) return;

      const confirmMsg = '¿Estás seguro de poner en "Falla" (Ausente) a todos los aprendices visibles?';
      if (!window.confirm(confirmMsg)) return;
      
      // Create a direct copy and mutate it based on the current filtered list
      const nextState = { ...attendanceState };
      
      filteredStudents.forEach(s => {
          nextState[s.id] = false; // Force to False (Falla)
      });
      
      setAttendanceState(nextState);
      setSaved(false);
  };

  const handleSave = () => {
    // STRICT VALIDATION: Prevent saving if no session exists
    if (!isSessionValid) {
        alert("No se puede guardar: No existe una sesión programada para esta Fecha y Grupo. Por favor crea la sesión primero.");
        return;
    }

    const records: AttendanceRecord[] = students.map(s => ({
      date,
      studentId: s.id,
      // Default to false if undefined when saving, ensures "Falla" is saved explicitly
      present: attendanceState[s.id] ?? false
    }));
    
    bulkSaveAttendance(records);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    
    // Refresh
    loadData();
  };

  // --- UI HANDLERS ---
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

  // --- SESSION MANAGEMENT LOGIC ---
  const generateId = () => {
      return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  const handleAddSession = () => {
      const session: ClassSession = {
          id: generateId(),
          date: newSessionDate,
          group: newSessionGroup,
          description: newSessionDesc
      };
      addSession(session);
      // Event listener handles refresh, but we clear input
      setNewSessionDesc('');
  };

  const promptDeleteSession = (e: React.MouseEvent, session: ClassSession) => {
      e.preventDefault();
      e.stopPropagation();
      setSessionToDelete(session);
  };

  const confirmDeleteSession = async () => {
      if (!sessionToDelete) return;

      // 1. Optimistic UI Update: Filter out session immediately
      const updatedSessions = sessions.filter(s => s.id !== sessionToDelete.id);
      setSessions(updatedSessions);
      
      // 2. IMMEDIATE UPDATE of Recorded Dates Dropdown
      // This ensures the deleted date disappears from the "Fechas Guardadas" list instantly
      const validDates = new Set(updatedSessions.map(s => s.date));
      const sortedDates = Array.from(validDates).sort((a: string, b: string) => b.localeCompare(a));
      setRecordedDates(sortedDates);

      try {
          // 3. Perform Actual Delete (Storage + Cloud)
          await deleteSession(sessionToDelete.id);
      } catch (error) {
          console.error("Error deleting session:", error);
          // If error, reload real data to revert optimistic UI
          loadData();
      } finally {
          setSessionToDelete(null);
      }
  };

  // --- IMPORT LOGIC ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportText(text);
    };
    reader.readAsText(file);
  };

  const processImport = () => {
    if (!importText.trim()) return;

    const normalize = (str: string) => 
        str.toLowerCase()
           .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
           .replace(/[^\w\s]/g, " ") 
           .trim();
    
    const processedLines = importText.split(/\r?\n/)
        .filter(l => l.trim().length > 0)
        .map(line => ({
            raw: line,
            norm: normalize(line),
            numbers: (line.match(/\d+/g) || []) as string[]
        }));
    
    const newState = { ...attendanceState };
    let matchedCount = 0;

    const studentsInGroup = selectedGroup === 'Todos' 
        ? students 
        : students.filter(s => (s.group || 'General') === selectedGroup);

    studentsInGroup.forEach(student => {
        const studentDoc = student.documentNumber ? String(student.documentNumber).trim() : '';
        const studentFullName = `${student.firstName} ${student.lastName}`;
        const studentNameNorm = normalize(studentFullName);
        const studentTokens = studentNameNorm.split(/\s+/).filter(t => t.length > 1);

        const isPresent = processedLines.some(lineObj => {
            if (studentDoc && lineObj.numbers.includes(studentDoc)) {
                return true;
            }
            if (lineObj.norm.includes(studentNameNorm)) return true;
            
            // Fuzzy match logic
            const lineTokens = lineObj.norm.split(/\s+/);
            const matches = studentTokens.filter(token => lineTokens.includes(token)).length;
            const requiredMatches = studentTokens.length > 1 ? 2 : 1;
            return matches >= requiredMatches;
        });

        if (isPresent) {
            newState[student.id] = true;
            matchedCount++;
        } else {
            newState[student.id] = false;
        }
    });

    setAttendanceState(newState);
    setImportStats({ matched: matchedCount, total: studentsInGroup.length });
    setSaved(false); 
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportText('');
    setImportStats(null);
  };

  const stats = useMemo(() => {
    const total = filteredStudents.length;
    const present = filteredStudents.filter(s => attendanceState[s.id]).length;
    return { total, present, absent: total - present };
  }, [filteredStudents, attendanceState]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tomar Asistencia</h2>
          <p className="text-gray-500">Selecciona fecha y grupo para registrar asistencia.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
           {/* Search Box */}
           <div className="relative order-last xl:order-none w-full xl:w-auto">
             <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
             <input 
                type="text"
                placeholder="Buscar (Apellido, Doc...)"
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full xl:w-48 bg-white shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm border border-gray-200">
             <History className="w-4 h-4 text-indigo-600 ml-1" />
             <select 
                className="bg-white border-none focus:ring-0 text-gray-700 font-medium text-sm pr-6 outline-none cursor-pointer w-32"
                onChange={(e) => {
                    if (e.target.value) setDate(e.target.value);
                }}
                value=""
             >
                <option value="" disabled>Fechas Guardadas...</option>
                {recordedDates.length === 0 && <option disabled>Sin sesiones activas</option>}
                {recordedDates.map(d => (
                    <option key={d} value={d}>{d}</option>
                ))}
             </select>
          </div>

          <div 
             onClick={openDatePicker}
             className={`flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm border cursor-pointer hover:bg-gray-50 transition-colors relative ${
                 recordedDates.includes(date) ? 'border-green-300 bg-green-50' : 'border-gray-200'
             }`}
             title={recordedDates.includes(date) ? "Esta fecha ya tiene registros" : "Nueva fecha"}
          >
              <Calendar className={`w-5 h-5 flex-shrink-0 ml-2 ${recordedDates.includes(date) ? 'text-green-600' : 'text-gray-500'}`} />
              <input 
                  ref={dateInputRef}
                  type="date" 
                  value={date} 
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 text-gray-700 font-medium text-sm cursor-pointer outline-none w-full"
                  style={{ colorScheme: 'light' }}
              />
          </div>

          <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm border border-gray-200">
             <Filter className="w-4 h-4 text-gray-500 ml-2" />
             <select 
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="bg-white border-none focus:ring-0 text-gray-700 font-medium text-sm pr-8"
             >
                {groups.map(g => (
                    <option key={g} value={g}>{g}</option>
                ))}
             </select>
          </div>
          
          <button
            onClick={handleResetAll}
            className="flex items-center space-x-2 bg-white text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors border border-gray-200 font-medium text-sm shadow-sm"
            title="Poner todos en Falla"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden lg:inline">Restablecer</span>
          </button>

          <button
            onClick={() => setShowSessionModal(true)}
            className="flex items-center space-x-2 bg-white text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200 font-medium text-sm shadow-sm"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden lg:inline">Sesiones</span>
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center space-x-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200 font-medium text-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Importar</span>
          </button>
        </div>
      </div>
      
      {/* Session Validation Warning */}
      {!isSessionValid && (
          <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-lg flex items-start justify-between animate-fade-in">
              <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                      <p className="font-bold text-orange-800 text-sm">Sesión no programada</p>
                      <p className="text-orange-700 text-sm">
                          No existe una sesión habilitada para la fecha <b>{date}</b> y el grupo <b>{selectedGroup}</b>.
                          <br/>Debes crearla en el botón <b>"Sesiones"</b> para poder guardar la asistencia.
                      </p>
                  </div>
              </div>
              <button 
                onClick={() => setShowSessionModal(true)}
                className="bg-orange-100 text-orange-800 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-200 transition-colors whitespace-nowrap"
              >
                  Crear Sesión
              </button>
          </div>
      )}

      {filteredStudents.length > 0 && (
          <div className="flex space-x-6 bg-white px-6 py-3 rounded-xl border border-gray-200 shadow-sm text-sm">
             <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Total: <strong className="text-gray-900">{stats.total}</strong></span>
             </div>
             <div className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-500" />
                <span className="text-gray-500">Asisten: <strong className="text-green-600">{stats.present}</strong></span>
             </div>
             <div className="flex items-center space-x-2">
                <X className="w-4 h-4 text-red-500" />
                <span className="text-gray-500">Faltan: <strong className="text-red-600">{stats.absent}</strong></span>
             </div>
          </div>
      )}

      {/* Table View */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">Aprendiz (Apellidos, Nombres)</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">Grupo</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">Correo</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm text-center w-32">Asistencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedStudents.length === 0 ? (
                <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                        {students.length === 0 
                            ? "No hay aprendices en el grupo seleccionado." 
                            : "No se encontraron aprendices con ese criterio de búsqueda."}
                    </td>
                </tr>
            ) : (
                paginatedStudents.map((student) => {
                    const isPresent = attendanceState[student.id];
                    return (
                        <tr 
                            key={student.id} 
                            onClick={() => toggleAttendance(student.id)}
                            className={`cursor-pointer transition-colors ${
                                isPresent ? 'hover:bg-gray-50' : 'bg-red-50 hover:bg-red-100'
                            }`}
                        >
                            <td className="px-6 py-4 text-sm">
                                <span className={`font-medium ${isPresent ? 'text-gray-900' : 'text-red-900'}`}>
                                    {student.lastName}, {student.firstName}
                                </span>
                                {student.documentNumber && (
                                    <span className="block text-xs text-gray-400 mt-0.5">
                                        ID: {student.documentNumber}
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-gray-500 text-sm">
                                {student.group || 'General'}
                            </td>
                            <td className="px-6 py-4 text-gray-500 text-sm">
                                {student.email}
                            </td>
                            <td className="px-6 py-4 text-center">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleAttendance(student.id);
                                    }}
                                    className={`w-8 h-8 rounded-full inline-flex items-center justify-center transition-all ${
                                        isPresent 
                                        ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                                        : 'bg-red-200 text-red-600 hover:bg-red-300'
                                    }`}
                                >
                                    {isPresent ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                                </button>
                            </td>
                        </tr>
                    );
                })
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 sticky left-0">
                <span className="text-sm text-gray-500">
                    Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, filteredStudents.length)} de {filteredStudents.length} resultados
                </span>
                <div className="flex items-center space-x-2">
                    <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                        Página {currentPage} de {totalPages}
                    </span>
                    <button 
                         onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                         disabled={currentPage === totalPages}
                         className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                </div>
            </div>
        )}
      </div>

      {students.length > 0 && (
          <div className="fixed bottom-6 right-6 md:absolute md:bottom-auto md:right-auto md:relative md:flex md:justify-end">
            <button
                onClick={handleSave}
                disabled={!isSessionValid}
                className={`flex items-center space-x-2 px-6 py-3 rounded-full shadow-lg transition-all transform ${
                    !isSessionValid 
                     ? 'bg-gray-400 text-gray-100 cursor-not-allowed' 
                     : saved 
                        ? 'bg-green-600 text-white scale-105' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95'
                }`}
                title={!isSessionValid ? "Crea una sesión primero para guardar" : "Guardar cambios"}
            >
                {!isSessionValid ? <Lock className="w-5 h-5" /> : saved ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                <span className="font-semibold">{saved ? 'Guardado' : 'Guardar Asistencia'}</span>
            </button>
          </div>
      )}

      {/* Session Management Modal */}
      {showSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-indigo-600" />
                        Configurar Sesiones Habilitadas
                    </h3>
                    <button onClick={() => setShowSessionModal(false)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded-lg mb-4">
                    <p><b>Importante:</b> Los aprendices solo podrán registrar su asistencia en el Portal del Aprendiz si la fecha actual está en esta lista para su Ficha.</p>
                </div>

                <div className="flex flex-col md:flex-row gap-3 mb-6 bg-gray-50 p-4 rounded-lg">
                     <input 
                        type="date"
                        className="bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                        value={newSessionDate}
                        onChange={e => setNewSessionDate(e.target.value)}
                     />
                     <select
                        className="bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                        value={newSessionGroup}
                        onChange={e => setNewSessionGroup(e.target.value)}
                     >
                         {groups.map(g => (
                            <option key={g} value={g}>{g === 'Todos' ? 'Todas las fichas' : g}</option>
                         ))}
                     </select>
                     <input 
                        type="text"
                        placeholder="Descripción (Opcional)"
                        className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                        value={newSessionDesc}
                        onChange={e => setNewSessionDesc(e.target.value)}
                     />
                     <button 
                        onClick={handleAddSession}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center justify-center"
                     >
                         <Plus className="w-4 h-4" />
                     </button>
                </div>

                <h4 className="font-bold text-gray-700 text-sm mb-2">Sesiones Programadas</h4>
                <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
                    {sessions.length === 0 ? (
                        <p className="p-8 text-center text-gray-400 text-sm">No hay sesiones habilitadas.</p>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3">Fecha</th>
                                    <th className="px-4 py-3">Ficha / Grupo</th>
                                    <th className="px-4 py-3">Descripción</th>
                                    <th className="px-4 py-3 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {[...sessions].sort((a,b) => b.date.localeCompare(a.date)).map(session => (
                                    <tr key={session.id || Math.random()} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-900">{session.date}</td>
                                        <td className="px-4 py-3 text-gray-600">{session.group === 'Todas' ? 'Todas' : session.group}</td>
                                        <td className="px-4 py-3 text-gray-500">{session.description || '-'}</td>
                                        <td className="px-4 py-3 text-right">
                                            <button 
                                                onClick={(e) => promptDeleteSession(e, session)}
                                                className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                                title="Eliminar sesión"
                                                type="button"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Sessions */}
      {sessionToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar Sesión?</h3>
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-6 text-left">
                    <p className="text-red-800 text-xs font-bold mb-1">⚠️ ATENCIÓN</p>
                    <p className="text-red-700 text-xs">
                        Se eliminará la sesión del <b>{sessionToDelete.date}</b> ({sessionToDelete.group}) y <b>todos los registros de asistencia</b> asociados.
                    </p>
                </div>
                <div className="flex space-x-3">
                    <button 
                        onClick={() => setSessionToDelete(null)}
                        className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={confirmDeleteSession}
                        className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
                    >
                        Eliminar
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Upload className="w-5 h-5 text-indigo-600" />
                        Importar Lista de Aprendices
                    </h3>
                    <button onClick={closeImportModal} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-4">
                    <p className="text-sm text-gray-600">
                        Copia y pega la lista (CSV o Texto). 
                        <br/>
                        <span className="text-indigo-600 font-medium">Recomendación:</span> Incluye el <b>número de documento</b> en la lista para una coincidencia exacta. Si no está, se usará el nombre completo.
                    </p>

                    <div className="flex items-center gap-3">
                        <label className="flex-1 cursor-pointer bg-gray-50 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg px-4 py-2 flex items-center justify-center space-x-2 transition-colors">
                            <FileText className="w-4 h-4" />
                            <span className="text-sm font-medium">Subir Archivo (.txt / .csv)</span>
                            <input type="file" accept=".txt,.csv" className="hidden" onChange={handleFileUpload} />
                        </label>
                    </div>

                    <div>
                        <textarea
                            className="w-full bg-white h-48 border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                            placeholder="Ejemplo con documento (Mejor):&#10;1098765432, Juan Perez&#10;555666777, Gomez Maria&#10;&#10;Ejemplo solo nombre:&#10;Carlos A. Rodriguez..."
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                        />
                    </div>

                    {importStats && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            <div>
                                <p className="text-sm font-bold text-green-800">Proceso Completado</p>
                                <p className="text-xs text-green-700">
                                    Se reconocieron {importStats.matched} de {importStats.total} aprendices en el texto.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end space-x-3 mt-2">
                    <button 
                        onClick={closeImportModal}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                    >
                        {importStats ? 'Cerrar' : 'Cancelar'}
                    </button>
                    <button 
                        onClick={processImport}
                        className="px-6 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg font-medium flex items-center gap-2"
                    >
                        <Check className="w-4 h-4" />
                        <span>Procesar Asistencia</span>
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
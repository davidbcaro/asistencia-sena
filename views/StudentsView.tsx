import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Upload, User, Users, Pencil, X, FileSpreadsheet, FileText, Filter, ChevronLeft, ChevronRight, Search, AlertTriangle, FileDown } from 'lucide-react';
import { Student, Ficha } from '../types';
import { getStudents, saveStudents, addStudent, updateStudent, getFichas, deleteStudent, bulkAddStudents, bulkDeleteStudents, getAttendance, getSessions } from '../services/db';

export const StudentsView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  
  // Filtering & Pagination State
  const [filterFicha, setFilterFicha] = useState<string>('Todas');
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState(''); 
  const [sortOrder, setSortOrder] = useState<'lastname' | 'firstname' | 'document' | 'group' | 'status'>('lastname'); // Default to lastname
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);
  const ITEMS_PER_PAGE = 15;
  
  // Single Add State
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newDoc, setNewDoc] = useState(''); 
  
  // Bulk State
  const [bulkText, setBulkText] = useState('');
  const [bulkSelectedFicha, setBulkSelectedFicha] = useState('');

  // Editing State
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ 
    firstName: '', 
    lastName: '', 
    email: '', 
    group: '', 
    documentNumber: '',
    status: 'Formación' as 'Formación' | 'Cancelado' | 'Retiro Voluntario' | 'Deserción',
    description: ''
  });

  // Delete State
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  
  // Bulk Selection State
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Detail modal (click on name/lastname)
  const [studentDetailModal, setStudentDetailModal] = useState<Student | null>(null);

  // Safe ID Generator
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  const loadData = () => {
    setStudents(getStudents());
    const loadedFichas = getFichas();
    setFichas(loadedFichas);
    if(loadedFichas.length > 0 && !newGroup) {
        setNewGroup(loadedFichas[0].code);
        setBulkSelectedFicha(loadedFichas[0].code);
    }
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  const handleSort = (column: 'lastname' | 'firstname' | 'document' | 'group' | 'status') => {
    if (sortOrder === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortOrder(column);
    setSortDirection('asc');
  };

  // Filter and Sort students
  const filteredStudents = students
    .filter(student => {
      const matchesFicha = filterFicha === 'Todas' || (student.group || 'General') === filterFicha;
      const matchesStatus = filterStatus === 'Todos' || (student.status || 'Formación') === filterStatus;
      const term = searchTerm.toLowerCase();
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      
      const matchesSearch = 
        fullName.includes(term) || 
        (student.documentNumber || '').includes(term);

      return matchesFicha && matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
        const direction = sortDirection === 'asc' ? 1 : -1;
        let cmp = 0;
        if (sortOrder === 'document') {
            cmp = (a.documentNumber || '').localeCompare(b.documentNumber || '');
            if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
        } else if (sortOrder === 'group') {
            cmp = (a.group || 'General').localeCompare(b.group || 'General');
            if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
        } else if (sortOrder === 'status') {
            cmp = (a.status || 'Formación').localeCompare(b.status || 'Formación');
            if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
        } else if (sortOrder === 'lastname') {
            cmp = a.lastName.localeCompare(b.lastName);
            if (cmp === 0) cmp = a.firstName.localeCompare(b.firstName);
        } else {
            cmp = a.firstName.localeCompare(b.firstName);
            if (cmp === 0) cmp = a.lastName.localeCompare(b.lastName);
        }
        return direction * cmp;
    });

  // Pagination Logic
  const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE);
  const paginatedStudents = showAllStudents
    ? filteredStudents
    : filteredStudents.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
      );

  useEffect(() => {
      setCurrentPage(1);
      // Clear selection when filters change
      setSelectedStudents(new Set());
  }, [filterFicha, filterStatus, searchTerm, sortOrder, sortDirection]);

  useEffect(() => {
      setCurrentPage(1);
  }, [showAllStudents]);

  useEffect(() => {
      if (!showFilters) return;
      const handleClickOutside = (event: MouseEvent) => {
          if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
              setShowFilters(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilters]);

  useEffect(() => {
      if (!showStatusFilter) return;
      const handleClickOutside = (event: MouseEvent) => {
          if (statusFilterRef.current && !statusFilterRef.current.contains(event.target as Node)) {
              setShowStatusFilter(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStatusFilter]);
  
  // Bulk selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudents(new Set(paginatedStudents.map(s => s.id)));
    } else {
      setSelectedStudents(new Set());
    }
  };
  
  const handleSelectStudent = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedStudents);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedStudents(newSelected);
  };
  
  const handleBulkDelete = async () => {
    if (selectedStudents.size === 0) return;
    await bulkDeleteStudents(Array.from(selectedStudents));
    setSelectedStudents(new Set());
    setShowBulkDeleteConfirm(false);
  };
  
  // Generate report function
  const generateReport = () => {
    const allStudents = getStudents();
    const allAttendance = getAttendance();
    const allSessions = getSessions();
    
    // Filter students based on current filters
    const filtered = allStudents.filter(student => {
      const matchesFicha = filterFicha === 'Todas' || (student.group || 'General') === filterFicha;
      const matchesStatus = filterStatus === 'Todos' || (student.status || 'Formación') === filterStatus;
      const term = searchTerm.toLowerCase();
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const matchesSearch = 
        fullName.includes(term) || 
        (student.documentNumber || '').includes(term);
      return matchesFicha && matchesStatus && matchesSearch;
    });
    
    // Calculate stats for each student
    const stats = filtered.map(student => {
      const validSessions = allSessions.filter(s => 
        s.group === 'Todas' || s.group === 'Todos' || s.group === student.group
      );
      const validDates = new Set(validSessions.map(s => s.date));
      const presentCount = allAttendance.filter(r => 
        r.studentId === student.id && r.present && validDates.has(r.date)
      ).length;
      const totalDays = validSessions.length;
      const absentCount = totalDays - presentCount;
      const rate = totalDays > 0 ? (presentCount / totalDays) * 100 : 0;
      
      return {
        document: student.documentNumber || '',
        lastName: student.lastName,
        firstName: student.firstName,
        email: student.email,
        group: student.group || 'General',
        status: student.status || 'Formación',
        description: student.description || '',
        total: totalDays,
        present: presentCount,
        absent: absentCount,
        rate: rate.toFixed(1)
      };
    });
    
    // Sort by lastname
    stats.sort((a, b) => {
      const cmp = a.lastName.localeCompare(b.lastName);
      return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName);
    });
    
    // Generate CSV
    const headers = ['Documento', 'Apellidos', 'Nombres', 'Email', 'Ficha/Grupo', 'Estado', 'Descripción', 'Total Clases', 'Asistencias', 'Fallas', '% Asistencia'];
    const rows = stats.map(s => [
      `"${s.document}"`,
      `"${s.lastName}"`,
      `"${s.firstName}"`,
      `"${s.email}"`,
      `"${s.group}"`,
      `"${s.status}"`,
      `"${s.description}"`,
      s.total,
      s.present,
      s.absent,
      `${s.rate}%`
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const fichaName = filterFicha === 'Todas' ? 'todas' : filterFicha;
    link.setAttribute("download", `reporte_aprendices_${fichaName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddSingle = () => {
    if (!newFirstName || !newLastName) return;
    const student: Student = {
      id: generateId(),
      documentNumber: newDoc,
      firstName: newFirstName,
      lastName: newLastName,
      email: newEmail,
      group: newGroup || 'General',
      active: true,
      status: 'Formación',
    };
    addStudent(student);
    setNewFirstName('');
    setNewLastName('');
    setNewEmail('');
    setNewDoc('');
  };

  const processBulkData = (text: string) => {
      if (!bulkSelectedFicha) {
          alert("Por favor selecciona una ficha destino.");
          return;
      }

      const lines = text.split(/\r?\n/);
      const newStudents: Student[] = [];
      
      lines.forEach(line => {
        if (!line.trim()) return;
        const separator = line.includes(';') ? ';' : ',';
        const parts = line.split(separator);
        
        // Expected: Doc, Nombres, Apellidos, Email
        if (parts.length >= 3) {
          newStudents.push({
            id: generateId(),
            documentNumber: parts[0].trim(),
            firstName: parts[1].trim(),
            lastName: parts[2].trim(),
            email: parts[3] ? parts[3].trim() : '',
            group: bulkSelectedFicha, 
            active: true,
            status: 'Formación'
          });
        }
      });
  
      if (newStudents.length > 0) {
          bulkAddStudents(newStudents);
      }
      
      setBulkText('');
      setIsAdding(false);
  };

  const handleBulkSubmit = () => {
      processBulkData(bulkText);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setBulkText(text); 
    };
    reader.readAsText(file);
  };

  const promptDelete = (id: string) => {
      setStudentToDelete(id);
  };

  const confirmDelete = () => {
      if (studentToDelete) {
          deleteStudent(studentToDelete);
          setStudentToDelete(null);
      }
  };

  const startEdit = (student: Student) => {
    setEditingStudent(student);
    setEditForm({
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      group: student.group || 'General',
      documentNumber: student.documentNumber || '',
      status: student.status || 'Formación',
      description: student.description || ''
    });
  };

  const handleUpdate = () => {
    if (!editingStudent) return;
    const updated: Student = {
        ...editingStudent,
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email,
        group: editForm.group,
        documentNumber: editForm.documentNumber,
        status: editForm.status,
        description: editForm.description || undefined
    };
    updateStudent(updated);
    setEditingStudent(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Aprendices</h2>
          <p className="text-gray-500">Gestiona listados y carga masiva por ficha.</p>
        </div>
        
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                    type="text"
                    placeholder="Buscar..."
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 bg-white shadow-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="relative" ref={filtersRef}>
                <button
                    type="button"
                    onClick={() => setShowFilters(prev => !prev)}
                    className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-300 shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    <Filter className="w-4 h-4 text-gray-500" />
                    <span>Filtros</span>
                </button>

                {showFilters && (
                    <div className="absolute right-0 mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-lg z-20 p-4 space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Ficha</label>
                            <select 
                                value={filterFicha}
                                onChange={(e) => {
                                    setFilterFicha(e.target.value);
                                    setShowFilters(false);
                                }}
                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="Todas">Todas las Fichas</option>
                                {fichas.map(f => (
                                    <option key={f.id} value={f.code}>{f.code}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Estado</label>
                            <select 
                                value={filterStatus}
                                onChange={(e) => {
                                    setFilterStatus(e.target.value);
                                    setShowFilters(false);
                                }}
                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="Todos">Todos los Estados</option>
                                <option value="Formación">Formación</option>
                                <option value="Cancelado">Cancelado</option>
                                <option value="Retiro">Retiro</option>
                                <option value="Deserción">Deserción</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            <button
            onClick={generateReport}
            className="flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
            <FileDown className="w-4 h-4" />
            <span>Reporte</span>
            </button>

            <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
            {isAdding ? <span>Cancelar</span> : <><Plus className="w-4 h-4" /> <span>Agregar</span></>}
            </button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedStudents.size > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between">
          <span className="text-indigo-900 font-medium">
            {selectedStudents.size} aprendiz{selectedStudents.size > 1 ? 'es' : ''} seleccionado{selectedStudents.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setShowBulkDeleteConfirm(true)}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar Seleccionados
          </button>
        </div>
      )}

      {isAdding && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 grid md:grid-cols-2 gap-8 animate-fade-in">
          <div>
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <User className="w-4 h-4" />
                Agregar Individualmente
            </h3>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Ficha/Grupo</label>
              <select
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
              >
                  {fichas.map(f => (
                      <option key={f.id} value={f.code}>{f.code} - {f.program}</option>
                  ))}
              </select>

              <input
                type="text"
                placeholder="No. Documento"
                className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                value={newDoc}
                onChange={(e) => setNewDoc(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Nombres"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                  />
                   <input
                    type="text"
                    placeholder="Apellidos"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                  />
              </div>
              <input
                type="email"
                placeholder="Correo Electrónico"
                className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              
              <button
                onClick={handleAddSingle}
                className="w-full bg-gray-900 text-white py-2 rounded-lg hover:bg-gray-800 mt-2"
              >
                Guardar Aprendiz
              </button>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Carga Masiva a Ficha
            </h3>
            
            <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-1">1. Ficha de Destino</label>
                <select
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={bulkSelectedFicha}
                    onChange={(e) => setBulkSelectedFicha(e.target.value)}
                >
                    {fichas.map(f => (
                        <option key={f.id} value={f.code}>{f.code} - {f.program}</option>
                    ))}
                </select>
            </div>

            <div className="mb-3">
                 <label className="block text-sm font-bold text-gray-700 mb-1">2. Cargar Archivo o Pegar</label>
                <label className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-100 w-full justify-center">
                    <Upload className="w-4 h-4 mr-2" />
                    Seleccionar CSV
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                </label>
            </div>
            <p className="text-xs text-gray-500 mb-2">Formato: <b>Documento, Nombres, Apellidos, Email</b></p>
            <textarea
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 h-32 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm font-mono"
              placeholder="123, Juan, Perez, juan@gmail.com&#10;456, Maria, Lopez, maria@gmail.com"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <button
              onClick={handleBulkSubmit}
              className="mt-3 w-full flex justify-center items-center space-x-2 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
            >
              <FileText className="w-4 h-4" />
              <span>Procesar Lista en Ficha</span>
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-left min-w-[1000px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-4 font-semibold text-gray-600 text-sm w-12">
                <input
                  type="checkbox"
                  checked={paginatedStudents.length > 0 && paginatedStudents.every(s => selectedStudents.has(s.id))}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
              </th>
              <th className="px-4 py-4 font-semibold text-gray-600 text-sm w-14 text-center">No.</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                  <button
                      type="button"
                      onClick={() => handleSort('document')}
                      className={`inline-flex items-center gap-1 hover:text-gray-900 ${
                          sortOrder === 'document' ? 'text-indigo-700' : ''
                      }`}
                  >
                      Documento
                      {sortOrder === 'document' && (
                        <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                  </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm min-w-[11rem] w-52">
                  <button
                      type="button"
                      onClick={() => handleSort('lastname')}
                      className={`inline-flex items-center gap-1 hover:text-gray-900 ${
                          sortOrder === 'lastname' ? 'text-indigo-700' : ''
                      }`}
                  >
                      Apellidos
                      {sortOrder === 'lastname' && (
                        <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                  </button>
              </th>
               <th className="px-6 py-4 font-semibold text-gray-600 text-sm min-w-[11rem] w-52">
                  <button
                      type="button"
                      onClick={() => handleSort('firstname')}
                      className={`inline-flex items-center gap-1 hover:text-gray-900 ${
                          sortOrder === 'firstname' ? 'text-indigo-700' : ''
                      }`}
                  >
                      Nombres
                      {sortOrder === 'firstname' && (
                        <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                  </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm w-80 min-w-[20rem]">Correo electrónico</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                  <button
                      type="button"
                      onClick={() => handleSort('group')}
                      className={`inline-flex items-center gap-1 hover:text-gray-900 ${
                          sortOrder === 'group' ? 'text-indigo-700' : ''
                      }`}
                  >
                      Ficha
                      {sortOrder === 'group' && (
                        <span className="text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                  </button>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm">
                <div className="relative inline-flex items-center gap-2" ref={statusFilterRef}>
                  <button
                    type="button"
                    onClick={() => setShowStatusFilter(prev => !prev)}
                    className="inline-flex items-center gap-1 hover:text-gray-900"
                  >
                    Estado
                    <Filter className="w-3.5 h-3.5 text-gray-400" />
                    {filterStatus !== 'Todos' && (
                      <span className="text-indigo-600 text-xs">({filterStatus})</span>
                    )}
                  </button>
                  {showStatusFilter && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowStatusFilter(false)} />
                      <div className="absolute left-0 top-full mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1">
                        <button
                          type="button"
                          onClick={() => { setFilterStatus('Todos'); setShowStatusFilter(false); }}
                          className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Todos' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                          Todos los Estados
                        </button>
                        <button
                          type="button"
                          onClick={() => { setFilterStatus('Formación'); setShowStatusFilter(false); }}
                          className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Formación' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                          Formación
                        </button>
                        <button
                          type="button"
                          onClick={() => { setFilterStatus('Cancelado'); setShowStatusFilter(false); }}
                          className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Cancelado' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                          Cancelado
                        </button>
                        <button
                          type="button"
                          onClick={() => { setFilterStatus('Retiro Voluntario'); setShowStatusFilter(false); }}
                          className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Retiro Voluntario' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                          Retiro Voluntario
                        </button>
                        <button
                          type="button"
                          onClick={() => { setFilterStatus('Deserción'); setShowStatusFilter(false); }}
                          className={`w-full text-left px-3 py-2 text-sm ${filterStatus === 'Deserción' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                          Deserción
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-sm text-right sticky right-0 bg-gray-50 z-10">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedStudents.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                   {students.length === 0 
                    ? "No hay aprendices registrados." 
                    : searchTerm 
                        ? "No se encontraron aprendices con ese criterio." 
                        : "No hay aprendices en esta ficha."}
                </td>
              </tr>
            ) : (
                paginatedStudents.map((student, index) => (
                <tr key={student.id} className="hover:bg-gray-50 group">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedStudents.has(student.id)}
                      onChange={(e) => handleSelectStudent(student.id, e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-4 text-center text-gray-500 text-xs tabular-nums">
                    {showAllStudents ? index + 1 : (currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                  </td>
                   <td className="px-6 py-4 text-gray-600 font-mono text-xs">
                        {student.documentNumber || '-'}
                   </td>
                   <td className="px-6 py-4 font-medium text-gray-900 text-xs cursor-pointer hover:text-indigo-600 hover:underline transition-colors min-w-[11rem] w-52" title={`Ver detalle de ${student.lastName} ${student.firstName}`} onClick={() => setStudentDetailModal(student)}>
                        {student.lastName}
                   </td>
                   <td className="px-6 py-4 text-gray-800 text-xs cursor-pointer hover:text-indigo-600 hover:underline transition-colors min-w-[11rem] w-52" title={`Ver detalle de ${student.lastName} ${student.firstName}`} onClick={() => setStudentDetailModal(student)}>
                        {student.firstName}
                   </td>
                  <td className="px-6 py-4 text-gray-600 text-sm w-80 min-w-[20rem] whitespace-nowrap" title={student.email || undefined}>
                    {student.email || <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                       <Users className="w-3 h-3 mr-1" />
                       {student.group || 'General'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      student.status === 'Formación' ? 'bg-green-100 text-green-800' :
                      student.status === 'Cancelado' ? 'bg-yellow-100 text-yellow-800' :
                      student.status === 'Retiro Voluntario' ? 'bg-orange-100 text-orange-800' :
                      student.status === 'Deserción' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {student.status || 'Formación'}
                    </span>
                  </td>
                  {/* Sticky actions column for mobile/overflow support */}
                  <td className="px-6 py-4 text-right sticky right-0 bg-white group-hover:bg-gray-50 transition-colors z-10 shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.05)]">
                    <div className="flex justify-end space-x-2">
                        <button
                            onClick={() => startEdit(student)}
                            className="text-gray-400 hover:text-indigo-600 p-2 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                            title="Editar Aprendiz"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                        <button
                        onClick={() => promptDelete(student.id)}
                        className="text-gray-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                        title="Eliminar Aprendiz"
                        >
                        <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 sticky left-0 flex-wrap gap-2">
          <span className="text-sm text-gray-500">
            {showAllStudents
              ? `Mostrando todos (${filteredStudents.length} aprendices)`
              : `Mostrando ${((currentPage - 1) * ITEMS_PER_PAGE) + 1} a ${Math.min(currentPage * ITEMS_PER_PAGE, filteredStudents.length)} de ${filteredStudents.length} resultados`}
          </span>
          <div className="flex items-center gap-3">
            {showAllStudents ? (
              <button
                type="button"
                onClick={() => setShowAllStudents(false)}
                className="text-indigo-600 hover:text-indigo-700 font-medium text-sm"
              >
                Mostrar 15 por página
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowAllStudents(true)}
                  className="text-indigo-600 hover:text-indigo-700 font-medium text-sm"
                >
                  Mostrar todos
                </button>
                {totalPages > 1 && (
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
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Student detail modal (click on Apellidos/Nombres) */}
      {studentDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setStudentDetailModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Detalle del aprendiz</h3>
              <button onClick={() => setStudentDetailModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div><span className="font-medium text-gray-500">Documento:</span> <span className="text-gray-900 font-mono">{studentDetailModal.documentNumber || '-'}</span></div>
              <div><span className="font-medium text-gray-500">Apellidos:</span> <span className="text-gray-900">{studentDetailModal.lastName}</span></div>
              <div><span className="font-medium text-gray-500">Nombres:</span> <span className="text-gray-900">{studentDetailModal.firstName}</span></div>
              <div><span className="font-medium text-gray-500">Correo:</span> <span className="text-gray-900">{studentDetailModal.email || '-'}</span></div>
              <div><span className="font-medium text-gray-500">Ficha:</span> <span className="text-gray-900">{studentDetailModal.group || 'General'}</span></div>
              <div><span className="font-medium text-gray-500">Estado:</span> <span className="text-gray-900">{studentDetailModal.status || 'Formación'}</span></div>
              {studentDetailModal.description && (
                <div><span className="font-medium text-gray-500">Descripción:</span> <span className="text-gray-900">{studentDetailModal.description}</span></div>
              )}
            </div>
            <div className="pt-4 mt-4">
              <button onClick={() => setStudentDetailModal(null)} className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {studentToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in">
              <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar aprendiz?</h3>
                  <p className="text-gray-500 text-sm mb-6">
                      Esta acción eliminará al aprendiz y todo su historial de asistencia. No se puede deshacer.
                  </p>
                  <div className="flex space-x-3">
                      <button 
                          onClick={() => setStudentToDelete(null)}
                          className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                      >
                          Cancelar
                      </button>
                      <button 
                          onClick={confirmDelete}
                          className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
                      >
                          Sí, Eliminar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Edit Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Editar Aprendiz</h3>
                    <button onClick={() => setEditingStudent(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Documento</label>
                        <input 
                            type="text"
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            value={editForm.documentNumber}
                            onChange={e => setEditForm({...editForm, documentNumber: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombres</label>
                        <input 
                            type="text"
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            value={editForm.firstName}
                            onChange={e => setEditForm({...editForm, firstName: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Apellidos</label>
                        <input 
                            type="text"
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            value={editForm.lastName}
                            onChange={e => setEditForm({...editForm, lastName: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                        <input 
                            type="email"
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            value={editForm.email}
                            onChange={e => setEditForm({...editForm, email: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ficha / Grupo</label>
                        <select
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            value={editForm.group}
                            onChange={(e) => setEditForm({...editForm, group: e.target.value})}
                        >
                            {fichas.map(f => (
                                <option key={f.id} value={f.code}>{f.code} - {f.program}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                        <select
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            value={editForm.status}
                            onChange={(e) => setEditForm({...editForm, status: e.target.value as 'Formación' | 'Cancelado' | 'Retiro Voluntario' | 'Deserción'})}
                        >
                            <option value="Formación">Formación</option>
                            <option value="Cancelado">Cancelado</option>
                            <option value="Retiro Voluntario">Retiro Voluntario</option>
                            <option value="Deserción">Deserción</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción / Comentarios</label>
                        <textarea
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                            rows={3}
                            placeholder="Comentarios y novedades sobre el aprendiz..."
                            value={editForm.description}
                            onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                        />
                    </div>
                    <div className="pt-2 flex space-x-3">
                        <button 
                            onClick={() => setEditingStudent(null)}
                            className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleUpdate}
                            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
                        >
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
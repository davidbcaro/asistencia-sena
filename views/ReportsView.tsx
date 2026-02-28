import React, { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { FileDown, Search, Filter, ChevronLeft, ChevronRight, Users, ArrowUpDown } from 'lucide-react';
import { getStudents, getAttendance, getFichas, getSessions } from '../services/db';
import { Ficha } from '../types';

export const ReportsView: React.FC = () => {
  const [students, setStudents] = useState(getStudents());
  const [allRecords, setAllRecords] = useState(getAttendance());
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [sessions, setSessions] = useState(getSessions());

  // Local State for Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFicha, setSelectedFicha] = useState('Todas');
  const [sortOrder, setSortOrder] = useState<'lastname' | 'firstname'>('lastname');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const loadData = () => {
    setStudents(getStudents());
    setAllRecords(getAttendance());
    setFichas(getFichas());
    setSessions(getSessions());
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  // 1. Calculate base stats for ALL students first based on SESSIONS (Clases)
  const baseStudentStats = useMemo(() => {
    return students.map(student => {
      // Find valid sessions for this student's group
      const validSessions = sessions.filter(s => 
          s.group === 'Todas' || s.group === 'Todos' || s.group === student.group
      );

      const totalDays = validSessions.length;

      // Calculate Present: Record exists AND date is in a valid session
      const validDates = new Set(validSessions.map(s => s.date));
      const presentCount = allRecords.filter(r => 
          r.studentId === student.id && r.present && validDates.has(r.date)
      ).length;

      // Absent = Total Possible - Present
      const absentCount = totalDays - presentCount;
      
      return {
        fullName: `${student.firstName} ${student.lastName}`,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email, 
        document: student.documentNumber || '',
        group: student.group || 'General',
        present: presentCount,
        absent: absentCount,
        total: totalDays,
        rate: totalDays > 0 ? (presentCount / totalDays) * 100 : 0
      };
    }).sort((a, b) => b.absent - a.absent); // Sort by most absences by default for charts
  }, [students, allRecords, sessions]);

  // 2. Filter by Ficha (This dataset drives Charts, KPIs, and is the base for the table)
  const statsByFicha = useMemo(() => {
      if (selectedFicha === 'Todas') return baseStudentStats;
      return baseStudentStats.filter(s => s.group === selectedFicha);
  }, [baseStudentStats, selectedFicha]);

  // 3. Calculate Global Stats (KPIs) based on the Ficha Filter
  const activeGlobalStats = useMemo(() => {
    const totalPresent = statsByFicha.reduce((acc, curr) => acc + curr.present, 0);
    const totalAbsent = statsByFicha.reduce((acc, curr) => acc + curr.absent, 0);
    const total = totalPresent + totalAbsent;
    
    return {
        present: totalPresent,
        absent: totalAbsent,
        rate: total > 0 ? (totalPresent / total) * 100 : 0
    };
  }, [statsByFicha]);

  // 4. Filter for Table (Applies Search Term AND Sort)
  const statsForTable = useMemo(() => {
      return statsByFicha
        .filter(stat => {
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = 
              stat.fullName.toLowerCase().includes(searchLower) || 
              stat.document.includes(searchLower) ||
              stat.email.toLowerCase().includes(searchLower);
            return matchesSearch;
        })
        .sort((a, b) => {
            if (sortOrder === 'lastname') {
                const cmp = a.lastName.localeCompare(b.lastName);
                return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName);
            } else {
                const cmp = a.firstName.localeCompare(b.firstName);
                return cmp !== 0 ? cmp : a.lastName.localeCompare(b.lastName);
            }
        });
  }, [statsByFicha, searchTerm, sortOrder]);

  // --- PAGINATION LOGIC ---
  const totalPages = Math.ceil(statsForTable.length / ITEMS_PER_PAGE);
  const paginatedStats = statsForTable.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
  );

  // Reset page on filter change
  useEffect(() => {
      setCurrentPage(1);
  }, [searchTerm, selectedFicha, sortOrder]);

  const pieData = [
    { name: 'Asistencias', value: activeGlobalStats.present },
    { name: 'Fallas', value: activeGlobalStats.absent },
  ];
  const COLORS = ['#4f46e5', '#ef4444'];

  // Dynamic height for the ranking chart
  const chartHeight = Math.max(statsByFicha.length * 40, 300);

  const downloadExcel = () => {
    // Added Email to headers and rows
    const headers = ['Documento', 'Nombres', 'Apellidos', 'Ficha/Grupo', 'Email', 'Total Clases', 'Asistencias', 'Fallas', '% Asistencia'];
    const rows = statsForTable.map(s => [
        `"${s.document}"`, 
        `"${s.firstName}"`,
        `"${s.lastName}"`,
        `"${s.group}"`,
        `"${s.email}"`,
        s.total,
        s.present,
        s.absent,
        `${s.rate.toFixed(1)}%`
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `reporte_asistencia_${selectedFicha}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Reportes de Asistencia</h2>
           <p className="text-gray-500">Visualiza el rendimiento acumulado {selectedFicha !== 'Todas' ? `de la ficha ${selectedFicha}` : 'del curso'}.</p>
        </div>
      </div>

      {/* KPI Cards (Reactive to Ficha Filter) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <Users className="w-16 h-16 text-indigo-600" />
            </div>
            <h3 className="text-sm font-medium text-gray-500">Asistencia Promedio</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{activeGlobalStats.rate.toFixed(1)}%</p>
            <p className="text-xs text-gray-400 mt-1">
                {selectedFicha === 'Todas' ? 'Global' : `Ficha ${selectedFicha}`}
            </p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500">Total Fallas Acumuladas</h3>
            <p className="text-3xl font-bold text-red-600 mt-2">{activeGlobalStats.absent}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500">Aprendices en Riesgo (+3 fallas)</h3>
            <p className="text-3xl font-bold text-orange-600 mt-2">
                {statsByFicha.filter(s => s.absent >= 3).length}
            </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Absences Chart (Reactive to Ficha) */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[500px]">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Ranking de Fallas</h3>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">
                    {selectedFicha === 'Todas' ? 'Todos los grupos' : `Ficha ${selectedFicha}`}
                </span>
            </div>
            
             <div className="flex-1 overflow-y-auto pr-2 border border-gray-50 rounded-lg">
                <div style={{ height: `${chartHeight}px`, minWidth: '400px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                            data={statsByFicha} // Uses filtered data
                            layout="vertical" 
                            margin={{ left: 0, right: 30, top: 10, bottom: 10 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                            <XAxis type="number" hide />
                            <YAxis 
                                dataKey="fullName" 
                                type="category" 
                                width={140} 
                                tick={{fontSize: 11, fill: '#4b5563'}}
                                interval={0} 
                            />
                            <Tooltip 
                                cursor={{fill: '#f9fafb'}}
                                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="absent" radius={[0, 4, 4, 0]} barSize={20} name="Fallas">
                                {statsByFicha.map((entry, index) => (
                                    <Cell 
                                        key={`cell-${index}`} 
                                        fill={entry.absent >= 5 ? '#dc2626' : entry.absent >= 3 ? '#f97316' : '#4f46e5'} 
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
             </div>
          </div>

          {/* Global Distribution (Reactive to Ficha) */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-[500px]">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Distribución de Asistencia</h3>
                 <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500">
                    {selectedFicha === 'Todas' ? 'Global' : `Ficha ${selectedFicha}`}
                </span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={pieData} // Uses recalculated global stats
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={120}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                </PieChart>
            </ResponsiveContainer>
          </div>
      </div>

      {/* Detailed Table Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Controls Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="font-semibold text-gray-800 whitespace-nowrap">Detalle Acumulado</h3>
              
              <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                 {/* Search */}
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text"
                        placeholder="Buscar aprendiz..."
                        className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 bg-white shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                 </div>

                 <div className="flex gap-2">
                    {/* Filter - Controls Charts AND Table now */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <select
                            className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white shadow-sm w-full md:w-auto font-medium text-gray-700"
                            value={selectedFicha}
                            onChange={(e) => setSelectedFicha(e.target.value)}
                        >
                            <option value="Todas">Todas las Fichas</option>
                            {fichas.map(f => (
                                <option key={f.id} value={f.code}>{f.code}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => setSortOrder(prev => prev === 'firstname' ? 'lastname' : 'firstname')}
                        className={`px-3 py-2 rounded-lg border shadow-sm transition-colors ${
                            sortOrder === 'lastname' 
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                            : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                        }`}
                        title="Orden: Nombre vs Apellido"
                    >
                        <ArrowUpDown className="w-4 h-4" />
                    </button>
                 </div>

                 {/* Download */}
                 <button 
                    onClick={downloadExcel}
                    className="flex items-center justify-center space-x-2 text-sm text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors font-medium border border-indigo-100"
                  >
                      <FileDown className="w-4 h-4" />
                      <span>Excel</span>
                  </button>
              </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                            Apellidos
                            {sortOrder === 'lastname' && <span className="ml-1 text-indigo-600">↓</span>}
                        </th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                            Nombres
                            {sortOrder === 'firstname' && <span className="ml-1 text-indigo-600">↓</span>}
                        </th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Ficha</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Total Clases</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-green-600">Asistencias</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-red-600">Fallas</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">% Asistencia</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {paginatedStats.length === 0 ? (
                        <tr>
                            <td colSpan={8} className="text-center py-8 text-gray-500">
                                {statsByFicha.length === 0 ? "No hay datos para esta ficha." : "No se encontraron coincidencias con la búsqueda."}
                            </td>
                        </tr>
                    ) : paginatedStats.map(stat => (
                        <tr key={stat.fullName} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                {stat.firstName}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              <div>
                                  {stat.lastName}
                                  <span className="block text-gray-400 font-normal">{stat.document}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-500 text-sm">{stat.group}</td>
                            <td className="px-6 py-4 text-gray-500 text-sm">{stat.email}</td>
                            <td className="px-6 py-4 text-gray-600 text-sm">{stat.total}</td>
                            <td className="px-6 py-4 text-green-600 font-medium text-sm">{stat.present}</td>
                            <td className="px-6 py-4 text-red-600 font-medium text-sm">{stat.absent}</td>
                            <td className="px-6 py-4 text-sm">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    stat.rate >= 80 ? 'bg-green-100 text-green-700' :
                                    stat.rate >= 60 ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-red-100 text-red-700'
                                }`}>
                                    {stat.rate.toFixed(0)}%
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
          </div>
          
          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 sticky left-0">
                <span className="text-sm text-gray-500">
                    Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, statsForTable.length)} de {statsForTable.length} resultados
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
    </div>
  );
};
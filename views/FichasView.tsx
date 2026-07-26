import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Layers, BookOpen, Pencil, X, AlertTriangle, ArrowRightLeft, ArrowRight, Users, EyeOff, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Ficha, Student } from '../types';
import { getFichas, addFicha, deleteFicha, updateFicha, getStudents, previewFichaMigration, migrateFichaStudents, FichaMigrationResult, getHiddenFichaIds, setFichaHidden } from '../services/db';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'Formación':       { label: 'Formación',       color: '#16a34a', bg: '#dcfce7' },
  'Cancelado':       { label: 'Cancelado',        color: '#ca8a04', bg: '#fef9c3' },
  'Retiro Voluntario': { label: 'Retiro Vol.',    color: '#ea580c', bg: '#ffedd5' },
  'Deserción':       { label: 'Deserción',        color: '#dc2626', bg: '#fee2e2' },
};

export const FichasView: React.FC = () => {
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const navigate = useNavigate();
  
  // Create State
  const [newCode, setNewCode] = useState('');
  const [newProgram, setNewProgram] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCronogramaProgramName, setNewCronogramaProgramName] = useState('');
  const [newCronogramaCenter, setNewCronogramaCenter] = useState('');
  const [newCronogramaStartDate, setNewCronogramaStartDate] = useState('');
  const [newCronogramaTrainingStartDate, setNewCronogramaTrainingStartDate] = useState('');
  const [newCronogramaEndDate, setNewCronogramaEndDate] = useState('');
  const [newCronogramaDownloadUrl, setNewCronogramaDownloadUrl] = useState('');

  // Edit State
  const [editingFicha, setEditingFicha] = useState<Ficha | null>(null);
  const [editForm, setEditForm] = useState({
    code: '',
    program: '',
    description: '',
    cronogramaProgramName: '',
    cronogramaCenter: '',
    cronogramaStartDate: '',
    cronogramaTrainingStartDate: '',
    cronogramaEndDate: '',
    cronogramaDownloadUrl: ''
  });

  // Delete State
  const [fichaToDelete, setFichaToDelete] = useState<{id: string, code: string} | null>(null);

  // Migration State
  const [migratingFicha, setMigratingFicha] = useState<Ficha | null>(null);
  const [migrateDestCode, setMigrateDestCode] = useState('');
  const [migrateResult, setMigrateResult] = useState<FichaMigrationResult | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  // Safe ID Generator
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  const loadData = () => {
    setFichas(getFichas());
    setStudents(getStudents());
    setHiddenIds(getHiddenFichaIds());
  };

  const toggleHidden = (ficha: Ficha) => {
    const isHidden = hiddenIds.includes(ficha.id);
    setHiddenIds(setFichaHidden(ficha.id, !isHidden));
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  const handleAdd = () => {
    if (!newCode || !newProgram) return;
    
    const newFicha: Ficha = {
      id: generateId(),
      code: newCode,
      program: newProgram,
      description: newDesc,
      cronogramaProgramName: newCronogramaProgramName || undefined,
      cronogramaCenter: newCronogramaCenter || undefined,
      cronogramaStartDate: newCronogramaStartDate || undefined,
      cronogramaTrainingStartDate: newCronogramaTrainingStartDate || undefined,
      cronogramaEndDate: newCronogramaEndDate || undefined,
      cronogramaDownloadUrl: newCronogramaDownloadUrl || undefined
    };

    addFicha(newFicha);
    setNewCode('');
    setNewProgram('');
    setNewDesc('');
    setNewCronogramaProgramName('');
    setNewCronogramaCenter('');
    setNewCronogramaStartDate('');
    setNewCronogramaTrainingStartDate('');
    setNewCronogramaEndDate('');
    setNewCronogramaDownloadUrl('');
    setIsAdding(false);
  };

  const startEdit = (ficha: Ficha) => {
    setEditingFicha(ficha);
    setEditForm({
        code: ficha.code,
        program: ficha.program,
        description: ficha.description || '',
        cronogramaProgramName: ficha.cronogramaProgramName || '',
        cronogramaCenter: ficha.cronogramaCenter || '',
        cronogramaStartDate: ficha.cronogramaStartDate || '',
        cronogramaTrainingStartDate: ficha.cronogramaTrainingStartDate || '',
        cronogramaEndDate: ficha.cronogramaEndDate || '',
        cronogramaDownloadUrl: ficha.cronogramaDownloadUrl || ''
    });
  };

  const handleUpdate = () => {
    if (!editingFicha) return;
    const updated: Ficha = {
        ...editingFicha,
        code: editForm.code,
        program: editForm.program,
        description: editForm.description,
        cronogramaProgramName: editForm.cronogramaProgramName || undefined,
        cronogramaCenter: editForm.cronogramaCenter || undefined,
        cronogramaStartDate: editForm.cronogramaStartDate || undefined,
        cronogramaTrainingStartDate: editForm.cronogramaTrainingStartDate || undefined,
        cronogramaEndDate: editForm.cronogramaEndDate || undefined,
        cronogramaDownloadUrl: editForm.cronogramaDownloadUrl || undefined
    };
    updateFicha(updated);
    setEditingFicha(null);
  };

  const promptDelete = (ficha: Ficha) => {
      setFichaToDelete({ id: ficha.id, code: ficha.code });
  };

  const confirmDelete = () => {
    if (fichaToDelete) {
      deleteFicha(fichaToDelete.id);
      setFichaToDelete(null);
    }
  };

  // --- Migration ---
  const startMigrate = (ficha: Ficha) => {
    setMigratingFicha(ficha);
    setMigrateDestCode('');
    setMigrateResult(null);
  };

  const closeMigrate = () => {
    setMigratingFicha(null);
    setMigrateDestCode('');
    setMigrateResult(null);
    setIsMigrating(false);
  };

  const migratePreview = useMemo(() => {
    if (!migratingFicha || !migrateDestCode) return null;
    return previewFichaMigration(migratingFicha.code, migrateDestCode);
  }, [migratingFicha, migrateDestCode, students]);

  const confirmMigrate = async () => {
    if (!migratingFicha || !migrateDestCode) return;
    setIsMigrating(true);
    try {
      // Se espera la migración completa (incluidas las escrituras a la nube)
      // para poder avisar si el cambio no quedó guardado en el servidor.
      const res = await migrateFichaStudents(migratingFicha.code, migrateDestCode);
      setMigrateResult(res);
    } finally {
      setIsMigrating(false);
      loadData();
    }
  };

  /** Status counts per ficha code */
  const fichaStats = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    fichas.forEach(f => map.set(f.code, {}));
    students.forEach(s => {
      const code = s.group || '';
      if (!map.has(code)) return;
      const status = s.status || 'Formación';
      const entry = map.get(code)!;
      entry[status] = (entry[status] ?? 0) + 1;
    });
    return map;
  }, [fichas, students]);

  const handleOpenCronograma = (ficha: Ficha) => {
    navigate(`/instructor/fichas/${ficha.id}/cronograma`);
  };

  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const hiddenCount = useMemo(() => fichas.filter(f => hiddenSet.has(f.id)).length, [fichas, hiddenSet]);
  const visibleFichas = useMemo(
    () => (showHidden ? fichas : fichas.filter(f => !hiddenSet.has(f.id))),
    [fichas, hiddenSet, showHidden]
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Fichas</h2>
          <p className="text-gray-500">Administra los grupos y programas de formación.</p>
        </div>
        <div className="flex items-center gap-2">
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(v => !v)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors border ${
                showHidden
                  ? 'bg-gray-800 text-white border-gray-800 hover:bg-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
              title={showHidden ? 'Ocultar las fichas archivadas' : 'Mostrar las fichas ocultas'}
            >
              {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span>{showHidden ? 'Ocultando' : 'Ver ocultas'} ({hiddenCount})</span>
            </button>
          )}
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center space-x-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {isAdding ? <span>Cancelar</span> : <><Plus className="w-4 h-4" /> <span>Nueva Ficha</span></>}
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Registrar Nueva Ficha
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                    type="text"
                    placeholder="Código Ficha (Ej: 2902090)"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Programa (Ej: ADSO)"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    value={newProgram}
                    onChange={(e) => setNewProgram(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Descripción (Opcional)"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                />
            </div>
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                <p className="text-sm font-semibold text-gray-800">Datos del cronograma (opcional)</p>
                <p className="text-xs text-gray-500">Estos datos personalizan el cronograma por ficha.</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                        type="text"
                        placeholder="Nombre completo del programa"
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        value={newCronogramaProgramName}
                        onChange={(e) => setNewCronogramaProgramName(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Centro / Regional"
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        value={newCronogramaCenter}
                        onChange={(e) => setNewCronogramaCenter(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Fecha de inicio (Ej: 29 DE SEPTIEMBRE 2025)"
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        value={newCronogramaStartDate}
                        onChange={(e) => setNewCronogramaStartDate(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Inicio de formación (Ej: 14 DE OCTUBRE 2025)"
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        value={newCronogramaTrainingStartDate}
                        onChange={(e) => setNewCronogramaTrainingStartDate(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Fecha fin (Ej: 27 DE JUNIO 2027)"
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        value={newCronogramaEndDate}
                        onChange={(e) => setNewCronogramaEndDate(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="URL cronograma descargable"
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        value={newCronogramaDownloadUrl}
                        onChange={(e) => setNewCronogramaDownloadUrl(e.target.value)}
                    />
                </div>
            </div>
            <div className="mt-4 flex justify-end">
                <button
                    onClick={handleAdd}
                    className="bg-gray-900 text-white px-6 py-2 rounded-lg hover:bg-black transition-colors"
                >
                    Guardar Ficha
                </button>
            </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleFichas.map(ficha => {
          const isHidden = hiddenSet.has(ficha.id);
          return (
            <div key={ficha.id} className={`bg-white p-6 rounded-xl border shadow-sm hover:shadow-md transition-shadow relative ${isHidden ? 'border-gray-300 border-dashed opacity-60' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between">
                    <div className="p-3 bg-teal-50 text-teal-600 rounded-lg">
                        <BookOpen className="w-6 h-6" />
                    </div>

                    <div className="flex space-x-1">
                        {ficha.code !== 'General' && (
                            <button
                                onClick={() => startMigrate(ficha)}
                                className="text-gray-400 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded"
                                title="Migrar aprendices a otra ficha"
                            >
                                <ArrowRightLeft className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            onClick={() => startEdit(ficha)}
                            className="text-gray-400 hover:text-teal-600 p-1.5 hover:bg-teal-50 rounded"
                            title="Editar Ficha"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                        {ficha.code !== 'General' && (
                            <button
                                onClick={() => toggleHidden(ficha)}
                                className="text-gray-400 hover:text-amber-600 p-1.5 hover:bg-amber-50 rounded"
                                title={isHidden ? 'Mostrar ficha (quitar de ocultas)' : 'Ocultar ficha (archivar)'}
                            >
                                {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                        )}
                        {ficha.code !== 'General' && (
                            <button
                                onClick={() => promptDelete(ficha)}
                                className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded"
                                title="Eliminar Ficha"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="mt-4">
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-900">{ficha.code}</h3>
                        {isHidden && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                <EyeOff className="w-3 h-3" /> Oculta
                            </span>
                        )}
                    </div>
                    <p className="text-teal-600 font-medium text-sm">{ficha.program}</p>
                    {ficha.description && <p className="text-gray-500 text-sm mt-2">{ficha.description}</p>}
                </div>
                {/* Status distribution */}
                {(() => {
                  const stats = fichaStats.get(ficha.code) ?? {};
                  const total = Object.values(stats).reduce((a, b) => a + b, 0);
                  if (total === 0) return (
                    <p className="text-xs text-gray-400 mt-3">Sin aprendices registrados</p>
                  );
                  return (
                    <div className="mt-3">
                      {/* Mini stacked bar */}
                      <div className="flex h-2 rounded-full overflow-hidden gap-px mb-2">
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                          const count = stats[key] ?? 0;
                          if (count === 0) return null;
                          const pct = (count / total) * 100;
                          return (
                            <div
                              key={key}
                              style={{ width: `${pct}%`, backgroundColor: cfg.color }}
                              title={`${cfg.label}: ${count}`}
                            />
                          );
                        })}
                      </div>
                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                          const count = stats[key] ?? 0;
                          if (count === 0) return null;
                          return (
                            <span
                              key={key}
                              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: cfg.bg, color: cfg.color }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: cfg.color }} />
                              {cfg.label} <span className="font-bold">{count}</span>
                            </span>
                          );
                        })}
                        <span className="inline-flex items-center text-[11px] text-gray-400 ml-auto font-medium">
                          {total} total
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-4">
                    <button
                        onClick={() => handleOpenCronograma(ficha)}
                        className="w-full rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-100"
                    >
                        Ver cronograma por fases
                    </button>
                    <button
                        onClick={() => navigate(`/instructor/fichas/${ficha.id}/planeacion-semanal`)}
                        className="w-full mt-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                    >
                        Planeación Semanal
                    </button>
                    <button
                        onClick={() => navigate(`/instructor/fichas/${ficha.id}/cronograma-general`)}
                        className="w-full mt-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100"
                    >
                        Cronograma General
                    </button>
                </div>
            </div>
          );
        })}
      </div>

       {/* Edit Modal */}
       {editingFicha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Editar Ficha</h3>
                    <button onClick={() => setEditingFicha(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Código Ficha</label>
                        <input
                            type="text"
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                            value={editForm.code}
                            onChange={e => setEditForm({...editForm, code: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Programa</label>
                        <input
                            type="text"
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                            value={editForm.program}
                            onChange={e => setEditForm({...editForm, program: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                        <input
                            type="text"
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                            value={editForm.description}
                            onChange={e => setEditForm({...editForm, description: e.target.value})}
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                            <input
                                type="date"
                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                value={editForm.cronogramaStartDate}
                                onChange={e => setEditForm({...editForm, cronogramaStartDate: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio de formación</label>
                            <input
                                type="date"
                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                value={editForm.cronogramaTrainingStartDate}
                                onChange={e => setEditForm({...editForm, cronogramaTrainingStartDate: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin</label>
                            <input
                                type="date"
                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                value={editForm.cronogramaEndDate}
                                onChange={e => setEditForm({...editForm, cronogramaEndDate: e.target.value})}
                            />
                        </div>
                    </div>
                    
                    <div className="pt-2 flex space-x-3">
                        <button 
                            onClick={() => setEditingFicha(null)}
                            className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleUpdate}
                            className="flex-1 bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700"
                        >
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Migration Modal */}
      {migratingFicha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                Migrar aprendices
              </h3>
              <button onClick={closeMigrate} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!migrateResult ? (
              <>
                {/* Source → Dest */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Origen</p>
                    <p className="text-lg font-bold text-gray-900">{migratingFicha.code}</p>
                    <p className="text-xs text-teal-600 font-medium">{migratingFicha.program}</p>
                  </div>
                  <ArrowRight className="w-6 h-6 text-indigo-500 flex-shrink-0" />
                  <div className="flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-indigo-400 font-semibold">Destino</p>
                    <p className="text-lg font-bold text-indigo-900">{migrateDestCode || '—'}</p>
                    <p className="text-xs text-indigo-500 font-medium">
                      {fichas.find(f => f.code === migrateDestCode)?.program || 'Sin seleccionar'}
                    </p>
                  </div>
                </div>

                {/* Destination select */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ficha destino</label>
                  <select
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={migrateDestCode}
                    onChange={e => setMigrateDestCode(e.target.value)}
                  >
                    <option value="">Selecciona la ficha destino…</option>
                    {fichas
                      .filter(f => f.code !== migratingFicha.code && f.code !== 'General')
                      .map(f => (
                        <option key={f.id} value={f.code}>{f.code} — {f.program}</option>
                      ))}
                  </select>
                </div>

                {/* Preview */}
                {migratePreview && (
                  <div className="rounded-lg border border-gray-200 bg-white p-4 mb-4">
                    <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-indigo-500" /> Qué se moverá
                    </p>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li className="flex justify-between"><span>Aprendices en <b>Formación</b> (con todo su historial)</span><span className="font-bold text-gray-900">{migratePreview.movedStudents}</span></li>
                      <li className="flex justify-between"><span>Actividades de calificación</span><span className="font-bold text-gray-900">{migratePreview.movedActivities}</span></li>
                      <li className="flex justify-between"><span>Sesiones de clase</span><span className="font-bold text-gray-900">{migratePreview.movedSessions}</span></li>
                      {migratePreview.movedJuicioEntries > 0 && (
                        <li className="flex justify-between"><span>Juicios Sofia (fichaCode)</span><span className="font-bold text-gray-900">{migratePreview.movedJuicioEntries}</span></li>
                      )}
                      {migratePreview.nonFormacionStudents > 0 && (
                        <li className="flex justify-between text-gray-500"><span>Se quedan (Cancelado/Retiro/Deserción…)</span><span className="font-bold">{migratePreview.nonFormacionStudents}</span></li>
                      )}
                      {migratePreview.skippedStudents > 0 && (
                        <li className="flex justify-between text-amber-600"><span>Aprendices omitidos (ya existen en destino)</span><span className="font-bold">{migratePreview.skippedStudents}</span></li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 mb-5 text-xs text-blue-800">
                  Solo se migran los aprendices en estado <b>Formación</b>; los de otros estados
                  (Cancelado, Retiro, Deserción…) se quedan en la ficha origen. El historial de cada
                  aprendiz movido (asistencia, notas, juicios, debido proceso) viaja con él.
                  <b> No se mueven</b> la planeación semanal ni los cronogramas.
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={closeMigrate}
                    className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmMigrate}
                    disabled={!migrateDestCode || isMigrating || (migratePreview?.movedStudents ?? 0) === 0}
                    className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isMigrating ? 'Migrando…' : 'Migrar aprendices'}
                  </button>
                </div>
              </>
            ) : (
              /* Result */
              <div className="text-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  migrateResult.cloudSynced ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                }`}>
                  {migrateResult.cloudSynced
                    ? <ArrowRightLeft className="w-6 h-6" />
                    : <AlertTriangle className="w-6 h-6" />}
                </div>
                <h4 className="text-lg font-bold text-gray-900 mb-1">
                  {migrateResult.cloudSynced ? 'Migración completada' : 'Migración NO guardada en la nube'}
                </h4>
                <p className="text-sm text-gray-500 mb-4">
                  De <b>{migrateResult.sourceCode}</b> a <b>{migrateResult.destCode}</b>
                </p>

                {!migrateResult.cloudSynced && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-4 text-left flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">
                      El cambio se guardó en este equipo pero <b>no se pudo confirmar en el servidor</b>.
                      Al recargar la app se revertirá. Revisa tu conexión y vuelve a ejecutar la migración.
                    </p>
                  </div>
                )}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-5 text-left">
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li className="flex justify-between"><span>Aprendices movidos</span><span className="font-bold">{migrateResult.movedStudents}</span></li>
                    <li className="flex justify-between"><span>Actividades reasignadas</span><span className="font-bold">{migrateResult.movedActivities}</span></li>
                    <li className="flex justify-between"><span>Sesiones reasignadas</span><span className="font-bold">{migrateResult.movedSessions}</span></li>
                    {migrateResult.movedJuicioEntries > 0 && (
                      <li className="flex justify-between"><span>Juicios Sofia actualizados</span><span className="font-bold">{migrateResult.movedJuicioEntries}</span></li>
                    )}
                    {migrateResult.nonFormacionStudents > 0 && (
                      <li className="flex justify-between text-gray-500"><span>Se quedaron (no Formación)</span><span className="font-bold">{migrateResult.nonFormacionStudents}</span></li>
                    )}
                    {migrateResult.skippedStudents > 0 && (
                      <li className="flex justify-between text-amber-600"><span>Aprendices omitidos</span><span className="font-bold">{migrateResult.skippedStudents}</span></li>
                    )}
                  </ul>
                </div>
                <button
                  onClick={closeMigrate}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                >
                  Listo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {fichaToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in">
              <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar Ficha {fichaToDelete.code}?</h3>
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-6 text-left">
                      <p className="text-red-800 text-xs font-bold mb-1">⚠️ ADVERTENCIA CRÍTICA</p>
                      <p className="text-red-700 text-xs">
                          Al eliminar esta ficha, <b>se eliminarán permanentemente todos los estudiantes</b> asociados a ella y su historial de asistencia.
                      </p>
                  </div>
                  <div className="flex space-x-3">
                      <button 
                          onClick={() => setFichaToDelete(null)}
                          className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                      >
                          Cancelar
                      </button>
                      <button 
                          onClick={confirmDelete}
                          className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
                      >
                          Sí, Eliminar Todo
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
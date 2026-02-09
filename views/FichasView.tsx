import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Layers, BookOpen, Pencil, X, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Ficha } from '../types';
import { getFichas, addFicha, deleteFicha, updateFicha } from '../services/db';

export const FichasView: React.FC = () => {
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [isAdding, setIsAdding] = useState(false);
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

  // Safe ID Generator
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  const loadData = () => {
      setFichas(getFichas());
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

  const handleOpenCronograma = (ficha: Ficha) => {
    navigate(`/instructor/fichas/${ficha.id}/cronograma`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Fichas</h2>
          <p className="text-gray-500">Administra los grupos y programas de formación.</p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          {isAdding ? <span>Cancelar</span> : <><Plus className="w-4 h-4" /> <span>Nueva Ficha</span></>}
        </button>
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
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Programa (Ej: ADSO)"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    value={newProgram}
                    onChange={(e) => setNewProgram(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Descripción (Opcional)"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={newCronogramaProgramName}
                        onChange={(e) => setNewCronogramaProgramName(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Centro / Regional"
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={newCronogramaCenter}
                        onChange={(e) => setNewCronogramaCenter(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Fecha de inicio (Ej: 29 DE SEPTIEMBRE 2025)"
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={newCronogramaStartDate}
                        onChange={(e) => setNewCronogramaStartDate(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Inicio de formación (Ej: 14 DE OCTUBRE 2025)"
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={newCronogramaTrainingStartDate}
                        onChange={(e) => setNewCronogramaTrainingStartDate(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Fecha fin (Ej: 27 DE JUNIO 2027)"
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={newCronogramaEndDate}
                        onChange={(e) => setNewCronogramaEndDate(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="URL cronograma descargable"
                        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
        {fichas.map(ficha => (
            <div key={ficha.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow relative">
                <div className="flex items-start justify-between">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                        <BookOpen className="w-6 h-6" />
                    </div>
                    
                    <div className="flex space-x-1">
                        <button 
                            onClick={() => startEdit(ficha)}
                            className="text-gray-400 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded"
                            title="Editar Ficha"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
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
                    <h3 className="text-lg font-bold text-gray-900">{ficha.code}</h3>
                    <p className="text-indigo-600 font-medium text-sm">{ficha.program}</p>
                    {ficha.description && <p className="text-gray-500 text-sm mt-2">{ficha.description}</p>}
                </div>
                <div className="mt-4">
                    <button
                        onClick={() => handleOpenCronograma(ficha)}
                        className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                    >
                        Ver cronograma por fases
                    </button>
                </div>
            </div>
        ))}
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
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            value={editForm.code}
                            onChange={e => setEditForm({...editForm, code: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Programa</label>
                        <input 
                            type="text"
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            value={editForm.program}
                            onChange={e => setEditForm({...editForm, program: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                        <input 
                            type="text"
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            value={editForm.description}
                            onChange={e => setEditForm({...editForm, description: e.target.value})}
                        />
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                        <p className="text-sm font-semibold text-gray-800">Datos del cronograma</p>
                        <p className="text-xs text-gray-500">Opcional: personaliza el cronograma para esta ficha.</p>
                        <div className="mt-3 grid grid-cols-1 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo del programa</label>
                                <input
                                    type="text"
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    value={editForm.cronogramaProgramName}
                                    onChange={e => setEditForm({...editForm, cronogramaProgramName: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Centro / Regional</label>
                                <input
                                    type="text"
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    value={editForm.cronogramaCenter}
                                    onChange={e => setEditForm({...editForm, cronogramaCenter: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de inicio</label>
                                <input
                                    type="text"
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    value={editForm.cronogramaStartDate}
                                    onChange={e => setEditForm({...editForm, cronogramaStartDate: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Inicio de formación</label>
                                <input
                                    type="text"
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    value={editForm.cronogramaTrainingStartDate}
                                    onChange={e => setEditForm({...editForm, cronogramaTrainingStartDate: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha fin</label>
                                <input
                                    type="text"
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    value={editForm.cronogramaEndDate}
                                    onChange={e => setEditForm({...editForm, cronogramaEndDate: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">URL cronograma descargable</label>
                                <input
                                    type="text"
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    value={editForm.cronogramaDownloadUrl}
                                    onChange={e => setEditForm({...editForm, cronogramaDownloadUrl: e.target.value})}
                                />
                            </div>
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
                            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
                        >
                            Guardar Cambios
                        </button>
                    </div>
                </div>
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
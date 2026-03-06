import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Student, Ficha } from '../types';
import { getStudents, getFichas, getDebidoProcesoState, saveDebidoProcesoStep, getRetiroVoluntarioState, saveRetiroVoluntarioStep, getPlanMejoramientoState, savePlanMejoramientoStep, updateStudent, getEstadoStepperTooltip } from '../services/db';

const STEPS: { step: number; tooltip: string }[] = [
  { step: 0, tooltip: 'Sin novedad' },
  { step: 1, tooltip: 'Correo riesgo de deserción' },
  { step: 2, tooltip: 'Agregar novedad al acta' },
  { step: 3, tooltip: 'Correo Coordinación (5 días)' },
  { step: 4, tooltip: 'Cancelación' },
  { step: 5, tooltip: 'Cancelación en Sofia Plus' },
];

const RETIRO_STEPS: { step: number; tooltip: string }[] = [
  { step: 1, tooltip: 'Sin novedad' },
  { step: 2, tooltip: 'Intención de retiro' },
  { step: 3, tooltip: 'Solicitud de retiro' },
  { step: 4, tooltip: 'Agregar novedad de retiro al acta' },
  { step: 5, tooltip: 'Retiro efectuado en Sofia Plus' },
];

const PMA_STEPS: { step: number; tooltip: string }[] = [
  { step: 0, tooltip: 'Sin PMA' },
  { step: 1, tooltip: 'Se asigna PMA' },
  { step: 2, tooltip: 'Aprobación de PMA' },
];

export const DebidoProcesoView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [stateMap, setStateMap] = useState<Record<string, number>>({});
  const [retiroMap, setRetiroMap] = useState<Record<string, number>>({});
  const [pmaMap, setPmaMap] = useState<Record<string, number>>({});
  const [filterFicha, setFilterFicha] = useState<string>('Todas');
  const [filterEstado, setFilterEstado] = useState<string>('Todos'); // Cancelación (stateMap)
  const [filterEstadoStudent, setFilterEstadoStudent] = useState<string>('Todos'); // Estado del aprendiz
  const [filterRetiro, setFilterRetiro] = useState<string>('Todos');
  const [filterPma, setFilterPma] = useState<string>('Todos');
  const [showFilterFicha, setShowFilterFicha] = useState(false);
  const [showFilterEstado, setShowFilterEstado] = useState(false);
  const [showFilterCancelacion, setShowFilterCancelacion] = useState(false);
  const [showFilterRetiro, setShowFilterRetiro] = useState(false);
  const [showFilterPma, setShowFilterPma] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const openFilter = (e: React.MouseEvent, setter: (v: boolean) => void) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setFilterAnchor({ left: rect.left, bottom: rect.bottom });
    setShowFilterFicha(false);
    setShowFilterEstado(false);
    setShowFilterCancelacion(false);
    setShowFilterRetiro(false);
    setShowFilterPma(false);
    setter(true);
  };

  const closeAllFilters = () => {
    setShowFilterFicha(false);
    setShowFilterEstado(false);
    setShowFilterCancelacion(false);
    setShowFilterRetiro(false);
    setShowFilterPma(false);
    setFilterAnchor(null);
  };

  const filterDropdownClass = 'flex flex-col min-w-[12rem] max-h-[min(20rem,70vh)] overflow-y-auto overflow-x-visible rounded-lg border border-gray-200 bg-white shadow-xl py-1 z-50';
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [sortOrder, setSortOrder] = useState<'lastname' | 'firstname'>('lastname');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const ITEMS_PER_PAGE = 15;

  const handleSort = (column: 'lastname' | 'firstname') => {
    if (sortOrder === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortOrder(column);
    setSortDirection('asc');
  };

  const loadData = () => {
    setStudents(getStudents());
    setFichas(getFichas());
    setStateMap(getDebidoProcesoState());
    setRetiroMap(getRetiroVoluntarioState());
    setPmaMap(getPlanMejoramientoState());
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  const filteredList = useMemo(() => {
    let list = [...students];
    if (filterFicha !== 'Todas') {
      list = list.filter((s) => (s.group || '') === filterFicha);
    }
    if (filterEstadoStudent !== 'Todos') {
      list = list.filter((s) => (s.status || 'Formación') === filterEstadoStudent);
    }
    if (filterEstado !== 'Todos') {
      const step = parseInt(filterEstado, 10);
      if (!Number.isNaN(step)) {
        list = list.filter((s) => (stateMap[s.id] ?? 0) === step);
      }
    }
    if (filterRetiro !== 'Todos') {
      const step = parseInt(filterRetiro, 10);
      if (!Number.isNaN(step)) {
        list = list.filter((s) => (retiroMap[s.id] ?? 1) === step);
      }
    }
    if (filterPma !== 'Todos') {
      const step = parseInt(filterPma, 10);
      if (!Number.isNaN(step)) {
        list = list.filter((s) => (pmaMap[s.id] ?? 0) === step);
      }
    }
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      list = list.filter((s) => {
        const full = `${s.firstName} ${s.lastName}`.toLowerCase();
        const doc = (s.documentNumber || '').toLowerCase();
        const email = (s.email || '').toLowerCase();
        const group = (s.group || '').toLowerCase();
        return full.includes(term) || doc.includes(term) || email.includes(term) || group.includes(term);
      });
    }
    const direction = sortDirection === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const cmp =
        sortOrder === 'lastname'
          ? (a.lastName || '').localeCompare(b.lastName || '', 'es') ||
            (a.firstName || '').localeCompare(b.firstName || '', 'es')
          : (a.firstName || '').localeCompare(b.firstName || '', 'es') ||
            (a.lastName || '').localeCompare(b.lastName || '', 'es');
      return direction * cmp;
    });
    return list;
  }, [students, stateMap, retiroMap, pmaMap, filterFicha, filterEstado, filterEstadoStudent, filterRetiro, filterPma, searchTerm, sortOrder, sortDirection]);

  const totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE);
  const paginatedList = showAll
    ? filteredList
    : filteredList.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
      );

  useEffect(() => {
    setCurrentPage(1);
  }, [filterFicha, filterEstado, filterEstadoStudent, filterRetiro, filterPma, searchTerm, sortOrder, sortDirection]);

  useEffect(() => {
    setCurrentPage(1);
  }, [showAll]);

  const saveState = (studentId: string, step: number) => {
    saveDebidoProcesoStep(studentId, step);
    setStateMap(getDebidoProcesoState());
  };

  const saveRetiroState = (studentId: string, step: number) => {
    saveRetiroVoluntarioStep(studentId, step);
    setRetiroMap(getRetiroVoluntarioState());
  };

  const savePmaState = (studentId: string, step: number) => {
    savePlanMejoramientoStep(studentId, step);
    setPmaMap(getPlanMejoramientoState());
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Debido proceso</h2>
        <p className="text-gray-500">
          Seguimiento del proceso de deserción por aprendiz. Use el stepper para actualizar el estado.
        </p>
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, documento, correo o ficha..."
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none w-full bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm text-gray-500">
            <strong className="text-gray-900">{filteredList.length}</strong> aprendices
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-700 font-medium">
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap">No</th>
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap">Documento</th>
                <th
                  className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap cursor-pointer select-none hover:text-teal-700"
                  onClick={() => handleSort('firstname')}
                  title="Ordenar por nombres"
                >
                  <span className={sortOrder === 'firstname' ? 'text-teal-700' : ''}>
                    Nombres
                    {sortOrder === 'firstname' && (
                      <span className="text-teal-600 ml-0.5">{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                    )}
                  </span>
                </th>
                <th
                  className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap cursor-pointer select-none hover:text-teal-700"
                  onClick={() => handleSort('lastname')}
                  title="Ordenar por apellidos"
                >
                  <span className={sortOrder === 'lastname' ? 'text-teal-700' : ''}>
                    Apellidos
                    {sortOrder === 'lastname' && (
                      <span className="text-teal-600 ml-0.5">{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                    )}
                  </span>
                </th>
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap">Correo</th>
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap min-w-[100px]">
                  <div className="inline-flex items-center gap-1">
                    <button type="button" onClick={(e) => openFilter(e, setShowFilterFicha)} className="inline-flex items-center gap-1 hover:text-teal-700 text-left">
                      Ficha
                      <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {filterFicha !== 'Todas' && <span className="text-teal-600 text-xs">({filterFicha})</span>}
                    </button>
                  </div>
                </th>
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap min-w-[100px]">
                  <div className="inline-flex items-center gap-1">
                    <button type="button" onClick={(e) => openFilter(e, setShowFilterEstado)} className="inline-flex items-center gap-1 hover:text-teal-700 text-left">
                      Estado
                      <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {filterEstadoStudent !== 'Todos' && <span className="text-teal-600 text-xs">({filterEstadoStudent})</span>}
                    </button>
                  </div>
                </th>
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap min-w-[120px]">
                  <div className="inline-flex items-center gap-1">
                    <button type="button" onClick={(e) => openFilter(e, setShowFilterCancelacion)} className="inline-flex items-center gap-1 hover:text-teal-700 text-left">
                      Cancelación
                      <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {filterEstado !== 'Todos' && <span className="text-teal-600 text-xs">(Paso {filterEstado})</span>}
                    </button>
                  </div>
                </th>
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap min-w-[120px]">
                  <div className="inline-flex items-center gap-1">
                    <button type="button" onClick={(e) => openFilter(e, setShowFilterRetiro)} className="inline-flex items-center gap-1 hover:text-teal-700 text-left">
                      Retiro voluntario
                      <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {filterRetiro !== 'Todos' && <span className="text-teal-600 text-xs">(Paso {filterRetiro})</span>}
                    </button>
                  </div>
                </th>
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm min-w-[140px]">
                  <div className="inline-flex items-center gap-1">
                    <button type="button" onClick={(e) => openFilter(e, setShowFilterPma)} className="inline-flex items-center gap-1 hover:text-teal-700 text-left">
                      Plan de mejoramiento
                      <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {filterPma !== 'Todos' && <span className="text-teal-600 text-xs">(Paso {filterPma})</span>}
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedList.map((student, index) => (
                <tr
                  key={student.id}
                  className="border-b border-gray-100 hover:bg-gray-50/80"
                >
                  <td className="px-4 py-4 text-gray-500 text-xs tabular-nums text-center">
                    {showAll ? index + 1 : (currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                  </td>
                  <td className="px-4 py-4 text-gray-600 font-mono text-xs">{student.documentNumber || '—'}</td>
                  <td className="px-4 py-4 text-gray-800 text-xs">{student.firstName}</td>
                  <td className="px-4 py-4 font-medium text-gray-900 text-xs">{student.lastName}</td>
                  <td className="px-4 py-4 text-gray-600 text-sm">{student.email || '—'}</td>
                  <td className="px-4 py-4 text-gray-600 text-xs">{student.group || '—'}</td>
                  <td className="px-4 py-4">
                    <select
                      value={student.status || 'Formación'}
                      onChange={(e) => {
                        const value = e.target.value as Student['status'];
                        if (value) updateStudent({ ...student, status: value });
                        loadData();
                      }}
                      title={getEstadoStepperTooltip(student.id, student.status)}
                      className={`cursor-pointer rounded border-0 px-2 py-0.5 text-xs font-medium focus:ring-2 focus:ring-teal-500 focus:ring-offset-0 ${
                        student.status === 'Formación' ? 'bg-green-100 text-green-800' :
                        student.status === 'Cancelado' ? 'bg-yellow-100 text-yellow-800' :
                        student.status === 'Retiro Voluntario' ? 'bg-orange-100 text-orange-800' :
                        student.status === 'Deserción' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}
                    >
                      <option value="Formación">Formación</option>
                      <option value="Cancelado">Cancelado</option>
                      <option value="Retiro Voluntario">Retiro Voluntario</option>
                      <option value="Deserción">Deserción</option>
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <DebidoProcesoStepper
                      currentStep={stateMap[student.id] ?? 0}
                      onStepClick={(step) => saveState(student.id, step)}
                      steps={STEPS}
                      defaultStep={0}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <DebidoProcesoStepper
                      currentStep={retiroMap[student.id] ?? 1}
                      onStepClick={(step) => saveRetiroState(student.id, step)}
                      steps={RETIRO_STEPS}
                      defaultStep={1}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <DebidoProcesoStepper
                      currentStep={pmaMap[student.id] ?? 0}
                      onStepClick={(step) => savePmaState(student.id, step)}
                      steps={PMA_STEPS}
                      defaultStep={0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Filtros en portal (posición fija, opciones en vertical, sin scroll horizontal) */}
        {(showFilterFicha || showFilterEstado || showFilterCancelacion || showFilterRetiro || showFilterPma) && filterAnchor &&
          createPortal(
            <>
              <div className="fixed inset-0 z-40" onClick={closeAllFilters} aria-hidden />
              <div
                className={filterDropdownClass}
                style={{ position: 'fixed', left: filterAnchor.left, top: filterAnchor.bottom + 4, zIndex: 50 }}
                role="menu"
              >
                {showFilterFicha && (
                  <>
                    <button type="button" onClick={() => { setFilterFicha('Todas'); closeAllFilters(); }} className={`w-full text-left px-3 py-2 text-sm whitespace-nowrap ${filterFicha === 'Todas' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Todas las Fichas</button>
                    {fichas.map((f) => (
                      <button key={f.id} type="button" onClick={() => { setFilterFicha(f.code); closeAllFilters(); }} className={`w-full text-left px-3 py-2 text-sm whitespace-nowrap ${filterFicha === f.code ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>{f.code}</button>
                    ))}
                  </>
                )}
                {showFilterEstado && (
                  <>
                    {['Todos', 'Formación', 'Cancelado', 'Retiro Voluntario', 'Deserción'].map((opt) => (
                      <button key={opt} type="button" onClick={() => { setFilterEstadoStudent(opt); closeAllFilters(); }} className={`w-full text-left px-3 py-2 text-sm whitespace-nowrap ${filterEstadoStudent === opt ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>{opt === 'Todos' ? 'Todos los estados' : opt}</button>
                    ))}
                  </>
                )}
                {showFilterCancelacion && (
                  <>
                    <button type="button" onClick={() => { setFilterEstado('Todos'); closeAllFilters(); }} className={`w-full text-left px-3 py-2 text-sm whitespace-nowrap ${filterEstado === 'Todos' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Todos</button>
                    {STEPS.map(({ step, tooltip }) => (
                      <button key={step} type="button" onClick={() => { setFilterEstado(String(step)); closeAllFilters(); }} className={`w-full text-left px-3 py-2 text-sm whitespace-nowrap ${filterEstado === String(step) ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>{step === 0 ? tooltip : `Paso ${step}: ${tooltip}`}</button>
                    ))}
                  </>
                )}
                {showFilterRetiro && (
                  <>
                    <button type="button" onClick={() => { setFilterRetiro('Todos'); closeAllFilters(); }} className={`w-full text-left px-3 py-2 text-sm whitespace-nowrap ${filterRetiro === 'Todos' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Todos</button>
                    {RETIRO_STEPS.map(({ step, tooltip }) => (
                      <button key={step} type="button" onClick={() => { setFilterRetiro(String(step)); closeAllFilters(); }} className={`w-full text-left px-3 py-2 text-sm whitespace-nowrap ${filterRetiro === String(step) ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>{step === 1 ? tooltip : `Paso ${step}: ${tooltip}`}</button>
                    ))}
                  </>
                )}
                {showFilterPma && (
                  <>
                    <button type="button" onClick={() => { setFilterPma('Todos'); closeAllFilters(); }} className={`w-full text-left px-3 py-2 text-sm whitespace-nowrap ${filterPma === 'Todos' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>Todos</button>
                    {PMA_STEPS.map(({ step, tooltip }) => (
                      <button key={step} type="button" onClick={() => { setFilterPma(String(step)); closeAllFilters(); }} className={`w-full text-left px-3 py-2 text-sm whitespace-nowrap ${filterPma === String(step) ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>{step === 0 ? tooltip : `Paso ${step}: ${tooltip}`}</button>
                    ))}
                  </>
                )}
              </div>
            </>,
            document.body
          )}

        {filteredList.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No hay aprendices que coincidan con los filtros.
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 flex-wrap gap-2">
            <span className="text-sm text-gray-500">
              {showAll
                ? `Mostrando todos (${filteredList.length} aprendices)`
                : `Mostrando ${(currentPage - 1) * ITEMS_PER_PAGE + 1} a ${Math.min(currentPage * ITEMS_PER_PAGE, filteredList.length)} de ${filteredList.length} resultados`}
            </span>
            <div className="flex items-center gap-3">
              {showAll ? (
                <button
                  type="button"
                  onClick={() => setShowAll(false)}
                  className="text-teal-600 hover:text-teal-700 font-medium text-sm"
                >
                  Mostrar 15 por página
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="text-teal-600 hover:text-teal-700 font-medium text-sm"
                  >
                    Mostrar todos
                  </button>
                  {totalPages > 1 && (
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                      </button>
                      <span className="text-sm font-medium text-gray-700">
                        Página {currentPage} de {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
        )}
      </div>
    </div>
  );
};

interface DebidoProcesoStepperProps {
  steps: { step: number; tooltip: string }[];
  currentStep: number;
  defaultStep: number;
  onStepClick: (step: number) => void;
}

const DebidoProcesoStepper: React.FC<DebidoProcesoStepperProps> = ({
  steps,
  currentStep,
  defaultStep,
  onStepClick,
}) => {
  const effective = steps.some((s) => s.step === currentStep) ? currentStep : defaultStep;
  const current = effective;

  return (
    <div className="flex items-center gap-0" role="group" aria-label="Estado">
      {steps.map(({ step, tooltip }, i) => {
        const isDone = step < current;
        const isCurrent = step === current;

        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div
                className={`h-0.5 w-4 flex-shrink-0 ${
                  isDone ? 'bg-teal-500' : 'bg-gray-200'
                }`}
                aria-hidden
              />
            )}
            <button
              type="button"
              title={tooltip}
              onClick={() => onStepClick(step)}
              className={`flex-shrink-0 rounded-full p-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 ${
                isDone
                  ? 'bg-teal-500 text-white hover:bg-teal-600'
                  : isCurrent
                    ? 'bg-teal-500 text-white ring-2 ring-teal-300 ring-offset-1 hover:bg-teal-600'
                    : 'bg-gray-200 text-gray-400 hover:bg-gray-300'
              }`}
              style={{ width: 22, height: 22 }}
            >
              {isDone ? (
                <svg className="w-full h-full" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              ) : (
                <span className="sr-only">{step}. {tooltip}</span>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

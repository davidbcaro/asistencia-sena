import React, { useEffect, useMemo, useState } from 'react';
import { Filter, Search } from 'lucide-react';
import { Student, Ficha } from '../types';
import { getStudents, getFichas, getDebidoProcesoState, saveDebidoProcesoStep } from '../services/db';

const STEPS: { step: number; tooltip: string }[] = [
  { step: 0, tooltip: 'Sin novedad' },
  { step: 1, tooltip: 'Correo riesgo de deserción' },
  { step: 2, tooltip: 'Agregar novedad al acta' },
  { step: 3, tooltip: 'Correo Coordinación (5 días)' },
  { step: 4, tooltip: 'Cancelación' },
  { step: 5, tooltip: 'Cancelación en Sofia Plus' },
];

export const DebidoProcesoView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [stateMap, setStateMap] = useState<Record<string, number>>({});
  const [filterFicha, setFilterFicha] = useState<string>('Todas');
  const [filterEstado, setFilterEstado] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = () => {
    setStudents(getStudents());
    setFichas(getFichas());
    setStateMap(getDebidoProcesoState());
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
    if (filterEstado !== 'Todos') {
      const step = parseInt(filterEstado, 10);
      if (!Number.isNaN(step)) {
        list = list.filter((s) => (stateMap[s.id] ?? 0) === step);
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
    return list;
  }, [students, stateMap, filterFicha, filterEstado, searchTerm]);

  const saveState = (studentId: string, step: number) => {
    saveDebidoProcesoStep(studentId, step);
    setStateMap(getDebidoProcesoState());
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
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
            >
              <option value="Todos">Todos los estados</option>
              {STEPS.map(({ step, tooltip }) => (
                <option key={step} value={step}>
                  {step === 0 ? tooltip : `Paso ${step}: ${tooltip}`}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-gray-500">
            <strong className="text-gray-900">{filteredList.length}</strong> aprendices
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-700 font-medium">
                <th className="px-4 py-3 whitespace-nowrap">No</th>
                <th className="px-4 py-3 whitespace-nowrap">Documento</th>
                <th className="px-4 py-3 whitespace-nowrap">Nombres</th>
                <th className="px-4 py-3 whitespace-nowrap">Apellidos</th>
                <th className="px-4 py-3 whitespace-nowrap">Correo</th>
                <th className="px-4 py-3 whitespace-nowrap">Ficha</th>
                <th className="px-4 py-3 whitespace-nowrap">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((student, index) => (
                <tr
                  key={student.id}
                  className="border-b border-gray-100 hover:bg-gray-50/80"
                >
                  <td className="px-4 py-3 text-gray-600">{index + 1}</td>
                  <td className="px-4 py-3">{student.documentNumber || '—'}</td>
                  <td className="px-4 py-3">{student.firstName}</td>
                  <td className="px-4 py-3">{student.lastName}</td>
                  <td className="px-4 py-3 text-gray-600">{student.email || '—'}</td>
                  <td className="px-4 py-3">{student.group || '—'}</td>
                  <td className="px-4 py-3">
                    <DebidoProcesoStepper
                      currentStep={stateMap[student.id] ?? 0}
                      onStepClick={(step) => saveState(student.id, step)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredList.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            No hay aprendices que coincidan con los filtros.
          </div>
        )}
      </div>
    </div>
  );
};

interface DebidoProcesoStepperProps {
  currentStep: number;
  onStepClick: (step: number) => void;
}

const DebidoProcesoStepper: React.FC<DebidoProcesoStepperProps> = ({
  currentStep,
  onStepClick,
}) => {
  const effective = currentStep < 0 ? 0 : currentStep;
  const current = effective;

  return (
    <div className="flex items-center gap-0" role="group" aria-label="Estado del debido proceso">
      {STEPS.map(({ step, tooltip }, i) => {
        const isDone = step < current;
        const isCurrent = step === current;

        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div
                className={`h-0.5 w-4 flex-shrink-0 ${
                  isDone ? 'bg-indigo-500' : 'bg-gray-200'
                }`}
                aria-hidden
              />
            )}
            <button
              type="button"
              title={tooltip}
              onClick={() => onStepClick(step)}
              className={`flex-shrink-0 rounded-full p-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                isDone
                  ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                  : isCurrent
                    ? 'bg-indigo-500 text-white ring-2 ring-indigo-300 ring-offset-1 hover:bg-indigo-600'
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

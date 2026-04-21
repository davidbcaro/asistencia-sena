import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Search, ChevronLeft, ChevronRight, Download, X, CheckCircle, XCircle, ChevronDown, Copy, ListChecks } from 'lucide-react';
import ExcelJS from 'exceljs';
import { Student, Ficha, GradeActivity, GradeEntry } from '../types';
import {
  getStudents, getFichas,
  getDebidoProcesoState, saveDebidoProcesoStep,
  getRetiroVoluntarioState, saveRetiroVoluntarioStep,
  getPlanMejoramientoState, savePlanMejoramientoStep,
  getPmaDetails, savePmaDetail, PmaDetail,
  getCancelacionDetails, saveCancelacionDetail, CancelacionDetail,
  getRetiroDetails, saveRetiroDetail, RetiroDetail,
  updateStudent, getEstadoStepperTooltip,
  DEBIDO_PROCESO_STEP_LABELS, RETIRO_VOLUNTARIO_STEP_LABELS, PLAN_MEJORAMIENTO_STEP_LABELS,
  getLmsLastAccess, getGradeActivities, getGrades,
} from '../services/db';
import {
  ALL_EVIDENCE_AREAS,
  buildEvidenceAreaOptions,
  filterActsForPendingEvidence,
  shortEvidenceLabel,
  activityMatchesEvidenceArea,
  type EvidencePendingScope,
} from '../services/evidenceMeta';

// ─── Email helpers (copied from AlertsView pattern) ─────────────────────────

const DP_TEMPLATES_KEY = 'asistenciapro_email_templates';
const DP_ALL_PHASES_LABEL = 'Todas las fases';
const DP_PASSING_SCORE = 70;

interface DpEmailTemplate { id: string; name: string; subject: string; body: string; }

function dpLoadEmailTemplates(): DpEmailTemplate[] {
  try {
    const raw = localStorage.getItem(DP_TEMPLATES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DpEmailTemplate[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [{
    id: 'default',
    name: 'Deserción (por defecto)',
    subject: 'Notificación de Inicio de Proceso de Deserción',
    body: 'Estimado(a) Aprendiz:<br><br><strong>{estudiante}</strong><br><strong>C.C.</strong> {documento}<br><strong>Ficha:</strong> {grupo}<br><br>',
  }];
}

function dpEscapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dpHtmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent ?? div.innerText ?? '').trim();
}

function dpBuildEmailHtml(body: string): string {
  const BASE = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#222222;';
  const styled = body
    .replace(/<p(?=[^>]*>)/gi, `<p style="margin:0.5em 0;${BASE}"`)
    .replace(/<ul(?=[^>]*>)/gi, '<ul style="margin:0.5em 0;padding-left:1.5em;"')
    .replace(/<ol(?=[^>]*>)/gi, '<ol style="margin:0.5em 0;padding-left:1.5em;"')
    .replace(/<li(?=[^>]*>)/gi, `<li style="margin:0.2em 0;${BASE}"`)
    .replace(/<blockquote(?=[^>]*>)/gi, '<blockquote style="border-left:3px solid #ccc;margin:0.5em 0;padding-left:1em;color:#555555;"');
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td style="${BASE}word-wrap:break-word;">${styled}</td></tr></table>`;
}

function dpDaysSince(dateStr: string): number {
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return -1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

// ─────────────────────────────────────────────────────────────────────────────

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

// ─── PMA Detail Modal ────────────────────────────────────────────────────────

interface PmaModalProps {
  student: Student;
  currentStep: number;
  detail: PmaDetail;
  onSave: (step: number, detail: PmaDetail) => void;
  onClose: () => void;
}

const PmaModal: React.FC<PmaModalProps> = ({ student, currentStep, detail, onSave, onClose }) => {
  const [step, setStep] = useState(currentStep);
  const [aprobado, setAprobado] = useState<boolean | null>(detail.aprobado);
  const [fechaAsignacion, setFechaAsignacion] = useState(detail.fechaAsignacion ?? '');
  const [fechaAprobacion, setFechaAprobacion] = useState(detail.fechaAprobacion ?? '');
  const [observaciones, setObservaciones] = useState(detail.observaciones ?? '');

  const handleSave = () => {
    onSave(step, { aprobado, fechaAsignacion, fechaAprobacion, observaciones });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-teal-600 px-5 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-white font-semibold text-base leading-tight">Plan de Mejoramiento</h3>
            <p className="text-teal-100 text-xs mt-0.5">{student.firstName} {student.lastName}</p>
          </div>
          <button type="button" onClick={onClose} className="text-teal-200 hover:text-white mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Step selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Paso del plan</label>
            <div className="flex gap-2 flex-wrap">
              {PMA_STEPS.map(({ step: s, tooltip }) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStep(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    step === s
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'
                  }`}
                >
                  {s === 0 ? tooltip : `${s}. ${tooltip}`}
                </button>
              ))}
            </div>
          </div>

          {/* Aprobado / No aprobado — only relevant for steps 1 and 2 */}
          {step > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Resultado</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAprobado(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    aprobado === true
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Aprobó
                </button>
                <button
                  type="button"
                  onClick={() => setAprobado(false)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    aprobado === false
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-red-400'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  No aprobó
                </button>
                {aprobado !== null && (
                  <button
                    type="button"
                    onClick={() => setAprobado(null)}
                    className="px-3 py-1.5 rounded-full text-xs text-gray-400 border border-gray-200 hover:border-gray-400"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Dates */}
          {step > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha de asignación</label>
                <input
                  type="date"
                  value={fechaAsignacion}
                  onChange={(e) => setFechaAsignacion(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  {aprobado === true ? 'Fecha de aprobación' : aprobado === false ? 'Fecha de vencimiento' : 'Fecha de referencia'}
                </label>
                <input
                  type="date"
                  value={fechaAprobacion}
                  onChange={(e) => setFechaAprobacion(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* Observations */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              placeholder="Notas adicionales sobre el plan de mejoramiento..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Cancelación Modal ───────────────────────────────────────────────────────

interface CancelacionModalProps {
  student: Student;
  currentStep: number;
  detail: CancelacionDetail;
  onSave: (step: number, detail: CancelacionDetail) => void;
  onClose: () => void;
}

const CANCELACION_DATE_LABELS: Record<number, { key: keyof CancelacionDetail; label: string }> = {
  1: { key: 'fechaCorreoRiesgo', label: 'Fecha correo riesgo de deserción' },
  2: { key: 'fechaNotaActa', label: 'Fecha nota en acta' },
  3: { key: 'fechaCorreoCoordinacion', label: 'Fecha correo coordinación' },
  4: { key: 'fechaCancelacion', label: 'Fecha de cancelación' },
  5: { key: 'fechaSofiaPlus', label: 'Fecha cancelación en Sofia Plus' },
};

const CancelacionModal: React.FC<CancelacionModalProps> = ({ student, currentStep, detail, onSave, onClose }) => {
  const [step, setStep] = useState(currentStep);
  const [dates, setDates] = useState<Omit<CancelacionDetail, 'observaciones'>>({
    fechaCorreoRiesgo: detail.fechaCorreoRiesgo ?? '',
    fechaNotaActa: detail.fechaNotaActa ?? '',
    fechaCorreoCoordinacion: detail.fechaCorreoCoordinacion ?? '',
    fechaCancelacion: detail.fechaCancelacion ?? '',
    fechaSofiaPlus: detail.fechaSofiaPlus ?? '',
  });
  const [observaciones, setObservaciones] = useState(detail.observaciones ?? '');

  const handleSave = () => onSave(step, { ...dates, observaciones });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-teal-600 px-5 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-white font-semibold text-base leading-tight">Cancelación</h3>
            <p className="text-teal-100 text-xs mt-0.5">{student.firstName} {student.lastName}</p>
          </div>
          <button type="button" onClick={onClose} className="text-teal-200 hover:text-white mt-0.5"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Step selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Paso actual</label>
            <div className="flex gap-2 flex-wrap">
              {STEPS.map(({ step: s, tooltip }) => (
                <button key={s} type="button" onClick={() => setStep(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${step === s ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'}`}>
                  {s === 0 ? tooltip : `${s}. ${tooltip}`}
                </button>
              ))}
            </div>
          </div>
          {/* Dates for completed steps */}
          {step > 0 && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-600">Fechas por paso</label>
              {Object.entries(CANCELACION_DATE_LABELS)
                .filter(([s]) => Number(s) <= step)
                .map(([s, { key, label }]) => (
                  <div key={s}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input type="date" value={dates[key as keyof typeof dates] as string}
                      onChange={(e) => setDates((d) => ({ ...d, [key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-teal-500 outline-none" />
                  </div>
                ))}
            </div>
          )}
          {/* Observations */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Observaciones</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3}
              placeholder="Notas adicionales sobre el proceso de cancelación..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
          </div>
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
          <button type="button" onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors">Guardar</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Retiro Voluntario Modal ──────────────────────────────────────────────────

interface RetiroModalProps {
  student: Student;
  currentStep: number;
  detail: RetiroDetail;
  onSave: (step: number, detail: RetiroDetail) => void;
  onClose: () => void;
}

const RETIRO_DATE_LABELS: Record<number, { key: keyof RetiroDetail; label: string }> = {
  2: { key: 'fechaIntencion', label: 'Fecha intención de retiro' },
  3: { key: 'fechaSolicitud', label: 'Fecha solicitud de retiro' },
  4: { key: 'fechaNotaActa', label: 'Fecha nota en acta' },
  5: { key: 'fechaRetiroSofia', label: 'Fecha retiro en Sofia Plus' },
};

const RetiroModal: React.FC<RetiroModalProps> = ({ student, currentStep, detail, onSave, onClose }) => {
  const [step, setStep] = useState(currentStep);
  const [dates, setDates] = useState<Omit<RetiroDetail, 'observaciones'>>({
    fechaIntencion: detail.fechaIntencion ?? '',
    fechaSolicitud: detail.fechaSolicitud ?? '',
    fechaNotaActa: detail.fechaNotaActa ?? '',
    fechaRetiroSofia: detail.fechaRetiroSofia ?? '',
  });
  const [observaciones, setObservaciones] = useState(detail.observaciones ?? '');

  const handleSave = () => onSave(step, { ...dates, observaciones });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-teal-600 px-5 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-white font-semibold text-base leading-tight">Retiro Voluntario</h3>
            <p className="text-teal-100 text-xs mt-0.5">{student.firstName} {student.lastName}</p>
          </div>
          <button type="button" onClick={onClose} className="text-teal-200 hover:text-white mt-0.5"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Step selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Paso actual</label>
            <div className="flex gap-2 flex-wrap">
              {RETIRO_STEPS.map(({ step: s, tooltip }) => (
                <button key={s} type="button" onClick={() => setStep(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${step === s ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'}`}>
                  {s === 1 ? tooltip : `${s}. ${tooltip}`}
                </button>
              ))}
            </div>
          </div>
          {/* Dates for completed steps */}
          {step > 1 && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-600">Fechas por paso</label>
              {Object.entries(RETIRO_DATE_LABELS)
                .filter(([s]) => Number(s) <= step)
                .map(([s, { key, label }]) => (
                  <div key={s}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input type="date" value={dates[key as keyof typeof dates] as string}
                      onChange={(e) => setDates((d) => ({ ...d, [key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-teal-500 outline-none" />
                  </div>
                ))}
            </div>
          )}
          {/* Observations */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Observaciones</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3}
              placeholder="Notas adicionales sobre el retiro voluntario..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
          </div>
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
          <button type="button" onClick={handleSave} className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors">Guardar</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Main View ───────────────────────────────────────────────────────────────

export const DebidoProcesoView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [stateMap, setStateMap] = useState<Record<string, number>>({});
  const [retiroMap, setRetiroMap] = useState<Record<string, number>>({});
  const [pmaMap, setPmaMap] = useState<Record<string, number>>({});
  const [pmaDetails, setPmaDetails] = useState<Record<string, PmaDetail>>({});
  const [cancelacionDetails, setCancelacionDetails] = useState<Record<string, CancelacionDetail>>({});
  const [retiroDetails, setRetiroDetails] = useState<Record<string, RetiroDetail>>({});
  // LMS + grades data
  const [lmsLastAccess, setLmsLastAccess] = useState<Record<string, string>>({});
  const [gradeActivities, setGradeActivities] = useState<GradeActivity[]>([]);
  const [grades, setGrades] = useState<GradeEntry[]>([]);

  // Evidence / fase filters
  const [dpFilterFase, setDpFilterFase] = useState<string[]>([]);
  const [dpFaseDropdownOpen, setDpFaseDropdownOpen] = useState(false);
  const dpFaseDropdownRef = useRef<HTMLDivElement>(null);
  const [showDpFichaFilter, setShowDpFichaFilter] = useState(false);
  const dpFichaFilterRef = useRef<HTMLDivElement>(null);
  const [dpFilterEvidenceAreas, setDpFilterEvidenceAreas] = useState<string[]>([]);
  const [dpAreaDropdownOpen, setDpAreaDropdownOpen] = useState(false);
  const [dpSelectedEvidenceIds, setDpSelectedEvidenceIds] = useState<string[]>([]);
  const [dpEvidencePickerOpen, setDpEvidencePickerOpen] = useState(false);
  const dpEvidencePickerRef = useRef<HTMLDivElement>(null);

  const [copyEmailFeedback, setCopyEmailFeedback] = useState<string | null>(null);

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

  // Cloud save feedback toast
  const [cloudSaveStatus, setCloudSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modals
  const [pmaModalStudent, setPmaModalStudent] = useState<Student | null>(null);
  const [cancelacionModalStudent, setCancelacionModalStudent] = useState<Student | null>(null);
  const [retiroModalStudent, setRetiroModalStudent] = useState<Student | null>(null);

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
    setPmaDetails(getPmaDetails());
    setCancelacionDetails(getCancelacionDetails());
    setRetiroDetails(getRetiroDetails());
    setLmsLastAccess(getLmsLastAccess());
    setGradeActivities(getGradeActivities());
    setGrades(getGrades());
  };

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  useEffect(() => {
    const TRACKED_KEYS = new Set(['plan_mejoramiento', 'pma_details', 'debido_proceso', 'retiro_voluntario', 'cancelacion_details', 'retiro_details']);
    const handler = (e: Event) => {
      const { key, ok } = (e as CustomEvent<{ key: string; ok: boolean }>).detail;
      if (!TRACKED_KEYS.has(key)) return;
      setCloudSaveStatus(ok ? 'saved' : 'error');
      if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
      if (ok) {
        cloudSaveTimer.current = setTimeout(() => setCloudSaveStatus('idle'), 3000);
      }
    };
    window.addEventListener('asistenciapro-cloud-save', handler);
    return () => window.removeEventListener('asistenciapro-cloud-save', handler);
  }, []);

  // ─── Evidence / grade memos ───────────────────────────────────────────────

  const gradeMap = useMemo(() => {
    const m = new Map<string, GradeEntry>();
    grades.forEach((g) => m.set(`${g.studentId}-${g.activityId}`, g));
    return m;
  }, [grades]);

  const dpPhaseOptions = useMemo(() => {
    const phases = new Set<string>();
    gradeActivities.forEach((a) => { if (a.phase) phases.add(a.phase); });
    return [...phases].sort((a, b) => a.localeCompare(b, 'es'));
  }, [gradeActivities]);

  const dpEvBasePool = useMemo(() => gradeActivities, [gradeActivities]);

  const dpEvAreaOptions = useMemo(
    () => buildEvidenceAreaOptions(dpEvBasePool),
    [dpEvBasePool]
  );

  const dpEvidencePickerPool = useMemo(() => {
    let pool = dpEvBasePool;
    if (dpFilterFase.length > 0) {
      pool = pool.filter((a) => dpFilterFase.includes(a.phase ?? ''));
    }
    if (dpFilterEvidenceAreas.length > 0) {
      pool = pool.filter((a) => dpFilterEvidenceAreas.some((ar) => activityMatchesEvidenceArea(a, ar)));
    }
    return pool;
  }, [dpEvBasePool, dpFilterFase, dpFilterEvidenceAreas]);

  const dpSelectedEvidenceIdSet = useMemo(
    () => new Set(dpSelectedEvidenceIds),
    [dpSelectedEvidenceIds]
  );

  const dpPendingScope = useMemo<EvidencePendingScope>(() => ({
    phaseFilter: dpFilterFase,
    allPhasesLabel: DP_ALL_PHASES_LABEL,
    areaFilter: dpFilterEvidenceAreas,
    selectedActivityIds: dpSelectedEvidenceIdSet,
  }), [dpFilterFase, dpFilterEvidenceAreas, dpSelectedEvidenceIdSet]);

  const getDpPendingCount = (student: Student): number => {
    const group = student.group || '';
    const fichaSpecific = gradeActivities.filter((a) => a.group === group);
    const fichaActs = fichaSpecific.length > 0 ? fichaSpecific : gradeActivities.filter((a) => a.group === '');
    const acts = filterActsForPendingEvidence(fichaActs, dpPendingScope);
    let count = 0;
    acts.forEach((a) => {
      const g = gradeMap.get(`${student.id}-${a.id}`);
      if (!g || g.score < DP_PASSING_SCORE) count++;
    });
    return count;
  };

  const getDpPendingList = (student: Student): GradeActivity[] => {
    const group = student.group || '';
    const fichaSpecific = gradeActivities.filter((a) => a.group === group);
    const fichaActs = fichaSpecific.length > 0 ? fichaSpecific : gradeActivities.filter((a) => a.group === '');
    const acts = filterActsForPendingEvidence(fichaActs, dpPendingScope);
    return acts.filter((a) => {
      const g = gradeMap.get(`${student.id}-${a.id}`);
      return !g || g.score < DP_PASSING_SCORE;
    });
  };

  const getDpDaysSince = (student: Student): number | null => {
    const last = lmsLastAccess[student.id];
    if (!last) return null;
    const d = dpDaysSince(last);
    return d >= 0 ? d : null;
  };

  const copyEmailForStudent = async (student: Student) => {
    const ficha = fichas.find((f) => f.code === (student.group || ''));
    const days = getDpDaysSince(student);
    const daysStr = days !== null ? String(days) : 'N/D';
    const lastAccessStr = lmsLastAccess[student.id]
      ? new Date(lmsLastAccess[student.id].replace(' ', 'T')).toLocaleDateString('es-CO')
      : 'N/D';
    const today = new Date().toLocaleDateString('es-CO');
    const pendingActs = getDpPendingList(student);
    const evidenciasHtml = pendingActs.length > 0
      ? '<ul>' + pendingActs.map((a) => `<li>${dpEscapeHtml(shortEvidenceLabel(a.name))}</li>`).join('') + '</ul>'
      : 'Sin evidencias pendientes';
    const evidenciasPlain = pendingActs.length > 0
      ? pendingActs.map((a) => `• ${shortEvidenceLabel(a.name)}`).join('\n')
      : 'Sin evidencias pendientes';

    const templates = dpLoadEmailTemplates();
    const tpl = templates[0];
    const substituteHtml = (body: string) =>
      body
        .replace(/\{estudiante\}/g, dpEscapeHtml(`${student.firstName} ${student.lastName}`))
        .replace(/\{documento\}/g, dpEscapeHtml(student.documentNumber || ''))
        .replace(/\{programa\}/g, dpEscapeHtml(ficha?.program || student.group || ''))
        .replace(/\{grupo\}/g, dpEscapeHtml(student.group || ''))
        .replace(/\{dias_sin_ingresar\}/g, daysStr)
        .replace(/\{fecha\}/g, today)
        .replace(/\{fecha_ultimo_ingreso\}/g, lastAccessStr)
        .replace(/\{evidencias\}/g, evidenciasHtml)
        .replace(/\{novedad\}/g, dpEscapeHtml(days !== null && days >= 20 ? 'Riesgo de deserción' : 'Plan de mejoramiento'));

    const substitutePlain = (body: string) =>
      dpHtmlToPlainText(body
        .replace(/\{estudiante\}/g, `${student.firstName} ${student.lastName}`)
        .replace(/\{documento\}/g, student.documentNumber || '')
        .replace(/\{programa\}/g, ficha?.program || student.group || '')
        .replace(/\{grupo\}/g, student.group || '')
        .replace(/\{dias_sin_ingresar\}/g, daysStr)
        .replace(/\{fecha\}/g, today)
        .replace(/\{fecha_ultimo_ingreso\}/g, lastAccessStr)
        .replace(/\{evidencias\}/g, evidenciasPlain)
        .replace(/\{novedad\}/g, days !== null && days >= 20 ? 'Riesgo de deserción' : 'Plan de mejoramiento')
      );

    try {
      const htmlBody = substituteHtml(tpl.body);
      const fullHtml = dpBuildEmailHtml(htmlBody);
      const plainBody = substitutePlain(tpl.body);
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([fullHtml], { type: 'text/html' }),
          'text/plain': new Blob([plainBody], { type: 'text/plain' }),
        }),
      ]);
      setCopyEmailFeedback(student.id);
      setTimeout(() => setCopyEmailFeedback(null), 2000);
    } catch {
      try {
        const plainBody = substitutePlain(tpl.body);
        await navigator.clipboard.writeText(plainBody);
        setCopyEmailFeedback(student.id);
        setTimeout(() => setCopyEmailFeedback(null), 2000);
      } catch {}
    }
  };

  // click-outside for evidence picker and fase dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dpEvidencePickerOpen && dpEvidencePickerRef.current && !dpEvidencePickerRef.current.contains(e.target as Node)) {
        setDpEvidencePickerOpen(false);
        setDpAreaDropdownOpen(false);
      }
      if (dpFaseDropdownOpen && dpFaseDropdownRef.current && !dpFaseDropdownRef.current.contains(e.target as Node)) {
        setDpFaseDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dpEvidencePickerOpen, dpFaseDropdownOpen]);

  // ─────────────────────────────────────────────────────────────────────────

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

  const handlePmaStepClick = (student: Student) => {
    setPmaModalStudent(student);
  };

  const handlePmaModalSave = (step: number, detail: PmaDetail) => {
    if (!pmaModalStudent) return;
    savePlanMejoramientoStep(pmaModalStudent.id, step);
    savePmaDetail(pmaModalStudent.id, detail);
    setPmaMap(getPlanMejoramientoState());
    setPmaDetails(getPmaDetails());
    setPmaModalStudent(null);
  };

  const handleCancelacionModalSave = (step: number, detail: CancelacionDetail) => {
    if (!cancelacionModalStudent) return;
    saveDebidoProcesoStep(cancelacionModalStudent.id, step);
    saveCancelacionDetail(cancelacionModalStudent.id, detail);
    setStateMap(getDebidoProcesoState());
    setCancelacionDetails(getCancelacionDetails());
    setCancelacionModalStudent(null);
  };

  const handleRetiroModalSave = (step: number, detail: RetiroDetail) => {
    if (!retiroModalStudent) return;
    saveRetiroVoluntarioStep(retiroModalStudent.id, step);
    saveRetiroDetail(retiroModalStudent.id, detail);
    setRetiroMap(getRetiroVoluntarioState());
    setRetiroDetails(getRetiroDetails());
    setRetiroModalStudent(null);
  };

  // ─── Excel Export ───────────────────────────────────────────────────────────

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Debido Proceso');

    const headers = [
      'No', 'Documento', 'Nombres', 'Apellidos', 'Correo', 'Ficha',
      'Estado Aprendiz',
      'Cancelación (paso)', 'Cancelación (descripción)',
      'F. Correo Riesgo', 'F. Nota Acta', 'F. Correo Coord.', 'F. Cancelación', 'F. Sofia Plus (Cancel.)',
      'Observaciones Cancelación',
      'Retiro Voluntario (paso)', 'Retiro Voluntario (descripción)',
      'F. Intención Retiro', 'F. Solicitud Retiro', 'F. Nota Acta (Retiro)', 'F. Retiro Sofia Plus',
      'Observaciones Retiro',
      'PMA (paso)', 'PMA (descripción)',
      'PMA Resultado', 'F. Asignación PMA', 'F. Referencia PMA', 'Observaciones PMA',
    ];

    // Header row
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // teal-700
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 48;

    // Data rows
    filteredList.forEach((s, idx) => {
      const cancelStep = stateMap[s.id] ?? 0;
      const retiroStep = retiroMap[s.id] ?? 1;
      const pmaStep = pmaMap[s.id] ?? 0;
      const pmaD = pmaDetails[s.id];
      const cancelD = cancelacionDetails[s.id];
      const retiroD = retiroDetails[s.id];

      const row = sheet.addRow([
        idx + 1,
        s.documentNumber || '',
        s.firstName,
        s.lastName,
        s.email || '',
        s.group || '',
        s.status || 'Formación',
        cancelStep,
        DEBIDO_PROCESO_STEP_LABELS[cancelStep] ?? `Paso ${cancelStep}`,
        cancelD?.fechaCorreoRiesgo || '',
        cancelD?.fechaNotaActa || '',
        cancelD?.fechaCorreoCoordinacion || '',
        cancelD?.fechaCancelacion || '',
        cancelD?.fechaSofiaPlus || '',
        cancelD?.observaciones || '',
        retiroStep,
        RETIRO_VOLUNTARIO_STEP_LABELS[retiroStep] ?? `Paso ${retiroStep}`,
        retiroD?.fechaIntencion || '',
        retiroD?.fechaSolicitud || '',
        retiroD?.fechaNotaActa || '',
        retiroD?.fechaRetiroSofia || '',
        retiroD?.observaciones || '',
        pmaStep,
        PLAN_MEJORAMIENTO_STEP_LABELS[pmaStep] ?? `Paso ${pmaStep}`,
        pmaStep === 0 ? '' : pmaD?.aprobado === true ? 'Aprobó' : pmaD?.aprobado === false ? 'No aprobó' : '',
        pmaD?.fechaAsignacion || '',
        pmaD?.fechaAprobacion || '',
        pmaD?.observaciones || '',
      ]);

      row.alignment = { vertical: 'middle', wrapText: false };
      row.height = 18;

      // Zebra striping
      if (idx % 2 === 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }

      // Estado aprendiz badge color (col 7)
      const estadoCell = row.getCell(7);
      const status = s.status || 'Formación';
      const estadoColor =
        status === 'Formación' ? 'FFD1FAE5' :
        status === 'Cancelado' ? 'FFFEF9C3' :
        status === 'Retiro Voluntario' ? 'FFFFEDD5' :
        status === 'Deserción' ? 'FFFEE2E2' : 'FFF3F4F6';
      estadoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: estadoColor } };
      estadoCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // PMA resultado badge color (col 25)
      const pmaResCell = row.getCell(25);
      if (pmaD?.aprobado === true) {
        pmaResCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        pmaResCell.font = { color: { argb: 'FF065F46' }, bold: true };
      } else if (pmaD?.aprobado === false) {
        pmaResCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        pmaResCell.font = { color: { argb: 'FF991B1B' }, bold: true };
      }
      pmaResCell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Borders
    sheet.eachRow((row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
    });

    // Column widths
    const colWidths = [5, 14, 20, 20, 28, 10, 16, 8, 26, 14, 14, 16, 14, 18, 32, 8, 28, 16, 16, 18, 18, 32, 6, 20, 12, 18, 18, 35];
    sheet.columns = colWidths.map((w) => ({ width: w }));

    // Freeze header
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte_debido_proceso_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Debido proceso</h2>
        <p className="text-gray-500">
          Seguimiento del proceso de deserción por aprendiz. Use el stepper para actualizar el estado.
        </p>
      </div>

      {cloudSaveStatus === 'saved' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          Guardado en Supabase correctamente
        </div>
      )}
      {cloudSaveStatus === 'error' && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-800 text-sm font-medium">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            Solo guardado localmente — no se pudo sincronizar con Supabase. Verifique que la Edge Function <code className="font-mono bg-yellow-100 px-1 rounded">save-app-data</code> esté desplegada.
          </div>
          <button type="button" onClick={() => setCloudSaveStatus('idle')} className="ml-2 text-yellow-600 hover:text-yellow-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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

          <div className="hidden sm:block w-px h-6 bg-gray-200" />

          {/* Filtro Ficha */}
          <div className="relative" ref={dpFichaFilterRef}>
            <button
              type="button"
              onClick={() => { setShowDpFichaFilter((o) => !o); setDpFaseDropdownOpen(false); setDpEvidencePickerOpen(false); closeAllFilters(); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm whitespace-nowrap ${showDpFichaFilter ? 'bg-teal-600 border-teal-600 text-white' : filterFicha !== 'Todas' ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              <Filter className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Ficha</span>
              {filterFicha !== 'Todas' && (
                <span className={`text-xs font-semibold max-w-[6rem] truncate ${showDpFichaFilter ? 'text-teal-100' : 'text-teal-600'}`}>{filterFicha}</span>
              )}
            </button>
            {showDpFichaFilter && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDpFichaFilter(false)} />
                <div className="absolute left-0 mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1 max-h-72 overflow-y-auto">
                  {[{ code: 'Todas', label: 'Todas las fichas' }, ...fichas.map((f) => ({ code: f.code, label: `${f.code} — ${f.program || f.code}` }))].map((opt) => (
                    <button key={opt.code} type="button"
                      onClick={() => { setFilterFicha(opt.code); setShowDpFichaFilter(false); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-teal-50 hover:text-teal-700 transition-colors ${filterFicha === opt.code ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}
                    >{opt.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Filtro Fase */}
          <div className="relative" ref={dpFaseDropdownRef}>
            <button
              type="button"
              onClick={() => { setDpFaseDropdownOpen((o) => !o); setDpEvidencePickerOpen(false); closeAllFilters(); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm whitespace-nowrap ${dpFaseDropdownOpen ? 'bg-teal-600 border-teal-600 text-white' : dpFilterFase.length > 0 ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              <Filter className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Fase</span>
              {dpFilterFase.length === 1 && (
                <span className={`text-xs font-semibold max-w-[7rem] truncate ${dpFaseDropdownOpen ? 'text-teal-100' : 'text-teal-600'}`}>{dpFilterFase[0].replace(/^Fase \d+:?\s*/, '')}</span>
              )}
              {dpFilterFase.length > 1 && (
                <span className={`text-xs font-semibold ${dpFaseDropdownOpen ? 'text-teal-100' : 'text-teal-600'}`}>{dpFilterFase.length} fases</span>
              )}
            </button>
            {dpFaseDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDpFaseDropdownOpen(false)} />
                <div className="absolute left-0 mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-xl z-50 py-1 max-h-72 overflow-y-auto">
                  <button type="button" onClick={() => setDpFilterFase([])}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-teal-50 hover:text-teal-700 transition-colors ${dpFilterFase.length === 0 ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}>
                    📋 Todas las fases
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  {dpPhaseOptions.map((phase) => {
                    const checked = dpFilterFase.includes(phase);
                    return (
                      <label key={phase} className={`flex items-center gap-2.5 px-4 py-2 text-sm cursor-pointer hover:bg-teal-50 hover:text-teal-700 transition-colors ${checked ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setDpFilterFase((prev) => checked ? prev.filter((p) => p !== phase) : [...prev, phase])}
                          className="w-3.5 h-3.5 rounded accent-teal-600 flex-shrink-0" />
                        {phase}
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Filtro Evidencias */}
          <div className="relative" ref={dpEvidencePickerRef}>
            <button
              type="button"
              onClick={() => { setDpEvidencePickerOpen((o) => !o); setDpFaseDropdownOpen(false); closeAllFilters(); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shadow-sm whitespace-nowrap ${
                dpEvidencePickerOpen
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : (dpFilterEvidenceAreas.length > 0 || dpSelectedEvidenceIds.length > 0)
                    ? 'bg-teal-50 border-teal-300 text-teal-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Evidencias</span>
              {(dpFilterEvidenceAreas.length > 0 || dpSelectedEvidenceIds.length > 0) && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${dpEvidencePickerOpen ? 'bg-white/20 text-white' : 'bg-teal-500 text-white'}`}>
                  {dpSelectedEvidenceIds.length > 0 ? dpSelectedEvidenceIds.length : dpEvidencePickerPool.length}
                </span>
              )}
            </button>
            {dpEvidencePickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => { setDpEvidencePickerOpen(false); setDpAreaDropdownOpen(false); }} />
                <div className="absolute left-0 mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl w-72 overflow-visible">
                  {/* Area sub-filter */}
                  <div className="px-3 pt-3 pb-2 border-b border-gray-100">
                    <div className="relative">
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); setDpAreaDropdownOpen((o) => !o); }}
                        className={`w-full inline-flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${dpFilterEvidenceAreas.length > 0 ? 'bg-teal-50 border-teal-400 text-teal-700' : 'bg-white border-gray-300 text-gray-600 hover:border-teal-400'}`}
                      >
                        <span>{dpFilterEvidenceAreas.length === 0 ? 'Todas las áreas' : `${dpFilterEvidenceAreas.length} área(s)`}</span>
                        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${dpAreaDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {dpAreaDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1 z-[60] bg-white border border-gray-200 rounded-lg shadow-xl min-w-full py-1 max-h-48 overflow-y-auto">
                          <button type="button" onClick={() => setDpFilterEvidenceAreas([])}
                            className={`w-full text-left px-3 py-2 text-xs ${dpFilterEvidenceAreas.length === 0 ? 'text-teal-700 font-medium bg-teal-50' : 'text-gray-700 hover:bg-gray-50'}`}>
                            Todas las áreas
                          </button>
                          {dpEvAreaOptions.filter((a) => a !== ALL_EVIDENCE_AREAS).map((area) => (
                            <label key={area} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                              <input type="checkbox" checked={dpFilterEvidenceAreas.includes(area)}
                                onChange={(e) => setDpFilterEvidenceAreas(e.target.checked ? [...dpFilterEvidenceAreas, area] : dpFilterEvidenceAreas.filter((a) => a !== area))}
                                className="accent-teal-600" />
                              {area}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Evidence list */}
                  <div className="max-h-56 overflow-y-auto px-2 py-2 space-y-0.5">
                    {dpEvidencePickerPool.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">Sin evidencias</p>
                    ) : (
                      <>
                        {dpSelectedEvidenceIds.length > 0 && (
                          <button type="button" onClick={() => setDpSelectedEvidenceIds([])}
                            className="w-full text-left px-2 py-1 text-xs text-teal-600 hover:text-teal-700 font-medium">
                            Limpiar selección ({dpSelectedEvidenceIds.length})
                          </button>
                        )}
                        {dpEvidencePickerPool.map((act) => (
                          <label key={act.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={dpSelectedEvidenceIdSet.has(act.id)}
                              onChange={(e) => setDpSelectedEvidenceIds(e.target.checked ? [...dpSelectedEvidenceIds, act.id] : dpSelectedEvidenceIds.filter((id) => id !== act.id))}
                              className="accent-teal-600 flex-shrink-0" />
                            <span className="text-xs text-gray-700 truncate" title={act.name}>{shortEvidenceLabel(act.name)}</span>
                          </label>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={exportToExcel}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Exportar Excel
          </button>
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
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap">Días sin ingresar</th>
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap">Pendientes</th>
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
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm min-w-[160px]">
                  <div className="inline-flex items-center gap-1">
                    <button type="button" onClick={(e) => openFilter(e, setShowFilterPma)} className="inline-flex items-center gap-1 hover:text-teal-700 text-left">
                      Plan de mejoramiento
                      <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {filterPma !== 'Todos' && <span className="text-teal-600 text-xs">(Paso {filterPma})</span>}
                    </button>
                  </div>
                </th>
                <th className="px-4 py-4 font-semibold text-gray-600 text-sm whitespace-nowrap">Correo</th>
              </tr>
            </thead>
            <tbody>
              {paginatedList.map((student, index) => {
                const pmaStep = pmaMap[student.id] ?? 0;
                const detail = pmaDetails[student.id];
                return (
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
                    {/* Días sin ingresar */}
                    {(() => {
                      const days = getDpDaysSince(student);
                      return (
                        <td className="px-4 py-4 text-center tabular-nums">
                          {days === null ? (
                            <span className="text-gray-400 text-xs">—</span>
                          ) : (
                            <span className={`text-xs font-semibold ${days >= 20 ? 'text-red-600' : days >= 10 ? 'text-orange-500' : 'text-gray-700'}`}>
                              {days}
                            </span>
                          )}
                        </td>
                      );
                    })()}
                    {/* Pendientes */}
                    {(() => {
                      const count = getDpPendingCount(student);
                      return (
                        <td className="px-4 py-4 text-center tabular-nums">
                          {count === 0 ? (
                            <span className="text-xs text-green-600 font-semibold">0</span>
                          ) : (
                            <span className="text-xs font-semibold text-red-600">{count}</span>
                          )}
                        </td>
                      );
                    })()}
                    <td className="px-4 py-4">
                      <DebidoProcesoStepper
                        currentStep={stateMap[student.id] ?? 0}
                        onStepClick={() => setCancelacionModalStudent(student)}
                        steps={STEPS}
                        defaultStep={0}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <DebidoProcesoStepper
                        currentStep={retiroMap[student.id] ?? 1}
                        onStepClick={() => setRetiroModalStudent(student)}
                        steps={RETIRO_STEPS}
                        defaultStep={1}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <DebidoProcesoStepper
                          currentStep={pmaStep}
                          onStepClick={() => handlePmaStepClick(student)}
                          steps={PMA_STEPS}
                          defaultStep={0}
                        />
                        {/* Resultado badge */}
                        {pmaStep > 0 && detail?.aprobado !== undefined && detail.aprobado !== null && (
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                              detail.aprobado
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {detail.aprobado ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {detail.aprobado ? 'Aprobó' : 'No aprobó'}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Correo copy button */}
                    <td className="px-4 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => copyEmailForStudent(student)}
                        title="Copiar correo al portapapeles"
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                          copyEmailFeedback === student.id
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600 hover:bg-teal-50 hover:text-teal-700'
                        }`}
                      >
                        {copyEmailFeedback === student.id ? (
                          <CheckCircle className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copyEmailFeedback === student.id ? 'Copiado' : 'Copiar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Filtros en portal */}
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

      {/* PMA Detail Modal */}
      {pmaModalStudent && (
        <PmaModal
          student={pmaModalStudent}
          currentStep={pmaMap[pmaModalStudent.id] ?? 0}
          detail={pmaDetails[pmaModalStudent.id] ?? { aprobado: null, fechaAsignacion: '', fechaAprobacion: '', observaciones: '' }}
          onSave={handlePmaModalSave}
          onClose={() => setPmaModalStudent(null)}
        />
      )}

      {/* Cancelación Detail Modal */}
      {cancelacionModalStudent && (
        <CancelacionModal
          student={cancelacionModalStudent}
          currentStep={stateMap[cancelacionModalStudent.id] ?? 0}
          detail={cancelacionDetails[cancelacionModalStudent.id] ?? { fechaCorreoRiesgo: '', fechaNotaActa: '', fechaCorreoCoordinacion: '', fechaCancelacion: '', fechaSofiaPlus: '', observaciones: '' }}
          onSave={handleCancelacionModalSave}
          onClose={() => setCancelacionModalStudent(null)}
        />
      )}

      {/* Retiro Voluntario Detail Modal */}
      {retiroModalStudent && (
        <RetiroModal
          student={retiroModalStudent}
          currentStep={retiroMap[retiroModalStudent.id] ?? 1}
          detail={retiroDetails[retiroModalStudent.id] ?? { fechaIntencion: '', fechaSolicitud: '', fechaNotaActa: '', fechaRetiroSofia: '', observaciones: '' }}
          onSave={handleRetiroModalSave}
          onClose={() => setRetiroModalStudent(null)}
        />
      )}
    </div>
  );
};

// ─── Stepper Component ───────────────────────────────────────────────────────

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
              className={`relative flex-shrink-0 rounded-full p-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 ${
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

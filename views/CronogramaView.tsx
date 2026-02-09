import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calendar } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ficha } from '../types';
import { getFichas } from '../services/db';
import cronogramaHtml from '../assets/cronogramaGeneral.html?raw';

type CronogramaSection = {
  id: string;
  label: string;
  html: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const extractSection = (html: string, startMarker: string, endMarker?: string) => {
  const startIndex = html.indexOf(startMarker);
  if (startIndex === -1) return '';
  const sliceStart = startIndex + startMarker.length;
  const endIndex = endMarker ? html.indexOf(endMarker, sliceStart) : html.length;
  if (endIndex === -1) return html.slice(sliceStart).trim();
  return html.slice(sliceStart, endIndex).trim();
};

const replaceRowValue = (html: string, label: string, value: string) => {
  const safeValue = escapeHtml(value);
  const pattern = new RegExp(
    `(<td[^>]*>\\s*<strong>${label}:<\\/strong>\\s*<\\/td>\\s*<td[^>]*>)(.*?)(<\\/td>)`,
    'i',
  );
  return html.replace(pattern, `$1${safeValue}$3`);
};

const replaceDownloadUrl = (html: string, url: string) => {
  const safeUrl = escapeHtml(url);
  const pattern = /(<a\s+href=")([^"]*)(".*?>\s*<u>AQUÍ<\/u>\s*<\/a>)/i;
  return html.replace(pattern, `$1${safeUrl}$3`);
};

const personalizeHtml = (html: string, ficha: Ficha | null) => {
  if (!ficha) return html;
  const safeProgram = ficha.program ? escapeHtml(ficha.program) : '';
  const safeProgramFull = ficha.cronogramaProgramName
    ? escapeHtml(ficha.cronogramaProgramName)
    : '';
  const safeCode = ficha.code ? escapeHtml(ficha.code) : '';
  const programHtml = safeProgramFull
    ? `<b>${safeProgramFull}</b>`
    : safeProgram
    ? `<b>${safeProgram}</b>`
    : '<b>Programa</b>';

  let result = html;
  result = result.replace(
    /(PROGRAMA DE FORMACIÓN TITULADA VIRTUAL:\s*)(.*?)(<br>)/i,
    `$1${programHtml}$3`,
  );
  result = result.replace(
    /(Ficha:&nbsp;<span[^>]*>)(.*?)(<\/span>)/i,
    `$1${safeCode}$3`,
  );
  if (ficha.cronogramaCenter) {
    const safeCenter = escapeHtml(ficha.cronogramaCenter);
    result = result.replace(/<h4>(.*?)<\/h4>/i, `<h4>${safeCenter}</h4>`);
  }
  if (ficha.cronogramaStartDate) {
    result = replaceRowValue(result, 'FECHA DE INICIO', ficha.cronogramaStartDate);
  }
  if (ficha.cronogramaTrainingStartDate) {
    result = replaceRowValue(result, 'FECHA DE INICIO DE FORMACIÓN', ficha.cronogramaTrainingStartDate);
  }
  if (ficha.cronogramaEndDate) {
    result = replaceRowValue(result, 'FECHA FIN', ficha.cronogramaEndDate);
  }
  if (ficha.cronogramaDownloadUrl) {
    result = replaceDownloadUrl(result, ficha.cronogramaDownloadUrl);
  }
  return result;
};

const sectionMarkers = [
  {
    id: 'induccion',
    label: 'Fase Inducción',
    start: '<!-- Fase Inducción -->',
    end: '<!-- Fase 1: Análisis -->',
  },
  {
    id: 'analisis',
    label: 'Fase 1: Análisis',
    start: '<!-- Fase 1: Análisis -->',
    end: '<!-- Fase 2: Planeación -->',
  },
  {
    id: 'planeacion',
    label: 'Fase 2: Planeación',
    start: '<!-- Fase 2: Planeación -->',
    end: '<!-- Fase 3: Ejecución -->',
  },
  {
    id: 'ejecucion',
    label: 'Fase 3: Ejecución',
    start: '<!-- Fase 3: Ejecución -->',
    end: '<!-- Fase 4: Evaluación -->',
  },
  {
    id: 'evaluacion',
    label: 'Fase 4: Evaluación',
    start: '<!-- Fase 4: Evaluación -->',
    end: undefined,
  },
];

export const CronogramaView: React.FC = () => {
  const { fichaId } = useParams();
  const navigate = useNavigate();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState(sectionMarkers[0].id);

  useEffect(() => {
    const loadFicha = () => {
      const allFichas = getFichas();
      const found = allFichas.find(item => item.id === fichaId) || null;
      setFicha(found);
    };
    loadFicha();
    window.addEventListener('asistenciapro-storage-update', loadFicha);
    return () => window.removeEventListener('asistenciapro-storage-update', loadFicha);
  }, [fichaId]);

  const personalizedHtml = useMemo(() => personalizeHtml(cronogramaHtml, ficha), [ficha]);

  const infoHtml = useMemo(() => {
    const split = personalizedHtml.split('<!-- Fase Inducción -->');
    return split[0]?.trim() ?? '';
  }, [personalizedHtml]);

  const sections = useMemo<CronogramaSection[]>(() => {
    return sectionMarkers.map(marker => ({
      id: marker.id,
      label: marker.label,
      html: extractSection(personalizedHtml, marker.start, marker.end),
    }));
  }, [personalizedHtml]);

  const activeSection = sections.find(section => section.id === selectedPhaseId) || sections[0];

  return (
    <div className="space-y-6">
      <style>{`
        .cronograma-wrapper table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
          background: #ffffff;
        }
        .cronograma-wrapper.no-bg th,
        .cronograma-wrapper.no-bg td {
          background: transparent;
        }
        .cronograma-wrapper th,
        .cronograma-wrapper td {
          border: 1px solid #d1d5db;
          padding: 8px;
          vertical-align: top;
          font-size: 0.85rem;
          background: #f0f0f0;
        }
        .cronograma-wrapper th {
          background: #f3f4f6;
          font-weight: 600;
          text-align: center;
        }
        .cronograma-wrapper td strong {
          font-weight: 600;
        }
        .cronograma-wrapper img {
          display: inline-block;
        }
      `}</style>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/instructor/fichas')}
            className="mt-1 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
            aria-label="Volver a fichas"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Cronograma general</h2>
            <p className="text-gray-500">
              {ficha
                ? `Ficha ${ficha.code} · ${ficha.program}`
                : 'Ficha no encontrada o eliminada.'}
            </p>
          </div>
        </div>
        {ficha && (
          <div className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>Consulta por fases y actividades del programa.</span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Información general</h3>
        <p className="text-sm text-gray-500">Resumen oficial del cronograma y fechas clave.</p>
        <div className="mt-4 overflow-x-auto">
          <div className="cronograma-wrapper no-bg" dangerouslySetInnerHTML={{ __html: infoHtml }} />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setSelectedPhaseId(section.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                section.id === selectedPhaseId
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          {activeSection?.html ? (
            <div className="cronograma-wrapper" dangerouslySetInnerHTML={{ __html: activeSection.html }} />
          ) : (
            <p className="text-sm text-gray-500">No hay información disponible para esta fase.</p>
          )}
        </div>
      </div>
    </div>
  );
};

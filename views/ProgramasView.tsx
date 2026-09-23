import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookMarked, ChevronDown, ChevronRight, FileSpreadsheet, FileCode, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Programa } from '../types';
import {
  ProgramaBuildReport, buildProgramaFases, countEvidencias, countFichasWithPrograma, deletePrograma,
  getProgramas, parseCronogramaHtml, parseProgramaExcel, savePrograma,
} from '../services/programas';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).substring(2);

/** Formulario de creación / actualización: nombre + Excel de evidencias + plantilla HTML (opcional) */
interface Draft {
  programaId: string | null; // null = programa nuevo
  nombre: string;
  excelFile: File | null;
  htmlFile: File | null;
  preview: { fases: Programa['fases']; report: ProgramaBuildReport } | null;
  error: string;
  reading: boolean;
}

const EMPTY_DRAFT: Draft = { programaId: null, nombre: '', excelFile: null, htmlFile: null, preview: null, error: '', reading: false };

const CodeList: React.FC<{ title: string; codes: string[]; tone: 'amber' | 'red' | 'gray' }> = ({ title, codes, tone }) => {
  const [open, setOpen] = useState(false);
  if (codes.length === 0) return null;
  const toneCls = tone === 'red' ? 'border-red-200 bg-red-50 text-red-800'
    : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-gray-200 bg-gray-50 text-gray-700';
  return (
    <div className={`rounded-lg border p-3 text-xs ${toneCls}`}>
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-1 text-left font-semibold">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title} ({codes.length})
      </button>
      {open && <p className="mt-2 break-words font-mono leading-relaxed">{codes.join(', ')}</p>}
    </div>
  );
};

export const ProgramasView: React.FC = () => {
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Programa | null>(null);

  const loadData = () => setProgramas(getProgramas());

  useEffect(() => {
    loadData();
    window.addEventListener('asistenciapro-storage-update', loadData);
    return () => window.removeEventListener('asistenciapro-storage-update', loadData);
  }, []);

  const fichaCounts = useMemo(() => {
    const map = new Map<string, number>();
    programas.forEach(p => map.set(p.id, countFichasWithPrograma(p.id)));
    return map;
  }, [programas]);

  const readFiles = async () => {
    if (!draft?.excelFile) return;
    setDraft({ ...draft, reading: true, error: '', preview: null });
    try {
      const excel = parseProgramaExcel(await draft.excelFile.arrayBuffer());
      if (excel.evidencias.length === 0) {
        setDraft(d => d && { ...d, reading: false, error: excel.advertencias[0] ?? 'El Excel no tiene evidencias con código reconocible.' });
        return;
      }
      const plantilla = draft.htmlFile ? parseCronogramaHtml(await draft.htmlFile.text()) : null;
      const preview = buildProgramaFases(excel, plantilla);
      setDraft(d => d && { ...d, reading: false, preview });
    } catch (err) {
      setDraft(d => d && { ...d, reading: false, error: `No se pudo leer el archivo: ${(err as Error).message}` });
    }
  };

  const saveDraft = () => {
    if (!draft?.preview || !draft.nombre.trim()) return;
    const now = new Date().toISOString();
    const existing = draft.programaId ? programas.find(p => p.id === draft.programaId) : null;
    savePrograma({
      id: existing?.id ?? generateId(),
      nombre: draft.nombre.trim(),
      fases: draft.preview.fases,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    setDraft(null);
  };

  const confirmDelete = () => {
    if (toDelete) deletePrograma(toDelete.id);
    setToDelete(null);
  };

  const fileInputCls = 'block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-teal-700 hover:file:bg-teal-100';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Programas de formación</h2>
          <p className="text-gray-500">Cada programa define sus fases y evidencias. Al crear una ficha le asignas un programa.</p>
        </div>
        <button
          onClick={() => setDraft(draft ? null : { ...EMPTY_DRAFT })}
          className="flex items-center space-x-2 rounded-lg bg-teal-600 px-4 py-2 text-white transition-colors hover:bg-teal-700"
        >
          {draft ? <span>Cancelar</span> : <><Plus className="h-4 w-4" /> <span>Nuevo programa</span></>}
        </button>
      </div>

      {draft && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
            <BookMarked className="h-4 w-4" />
            {draft.programaId ? 'Actualizar programa' : 'Registrar nuevo programa'}
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nombre del programa</label>
              <input
                type="text"
                placeholder="Ej: Implementación y Gestión de Bases de Datos"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={draft.nombre}
                onChange={e => setDraft({ ...draft, nombre: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
                <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel de evidencias por fase
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                className={fileInputCls}
                onChange={e => setDraft({ ...draft, excelFile: e.target.files?.[0] ?? null, preview: null, error: '' })}
              />
              <p className="mt-1 text-xs text-gray-500">Hoja EVIDENCIAS: fase, evidencia, código, tipo (área).</p>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
                <FileCode className="h-4 w-4 text-blue-600" /> Plantilla HTML del cronograma (recomendada)
              </label>
              <input
                type="file"
                accept=".html,.htm"
                className={fileInputCls}
                onChange={e => setDraft({ ...draft, htmlFile: e.target.files?.[0] ?? null, preview: null, error: '' })}
              />
              <p className="mt-1 text-xs text-gray-500">Aporta actividad de proyecto, actividad de aprendizaje, RAP y tipo de evidencia.</p>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={readFiles}
              disabled={!draft.excelFile || draft.reading}
              className="rounded-lg border border-teal-300 bg-teal-50 px-5 py-2 text-sm font-medium text-teal-700 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {draft.reading ? 'Leyendo…' : 'Leer archivos'}
            </button>
          </div>

          {draft.error && (
            <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {draft.error}
            </div>
          )}

          {draft.preview && (
            <div className="mt-5 space-y-3 border-t border-gray-100 pt-5">
              <p className="text-sm font-semibold text-gray-800">
                Se leyeron {draft.preview.report.totalEvidencias} evidencias
              </p>
              <div className="flex flex-wrap gap-2">
                {draft.preview.fases.map(f => (
                  <span key={f.nombre} className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: f.color }}>
                    {f.nombre}: {draft.preview!.report.porFase[f.nombre] ?? 0}
                  </span>
                ))}
              </div>
              {!draft.htmlFile && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Sin plantilla HTML: las evidencias se agrupan solo por código, sin títulos de actividad de proyecto, actividad de aprendizaje ni RAP.
                </p>
              )}
              <CodeList tone="amber" title="En el Excel pero no en la plantilla (sin títulos de AP/AA/RAP)" codes={draft.preview.report.sinPlantilla} />
              <CodeList tone="red" title="En la plantilla pero no en el Excel (no se incluyen)" codes={draft.preview.report.soloEnPlantilla} />
              <CodeList tone="amber" title="La plantilla las ubica en otra fase (se respeta la del Excel)" codes={draft.preview.report.faseDistinta} />
              <CodeList tone="gray" title="Sin área reconocible en el Excel (se deduce del código)" codes={draft.preview.report.sinArea} />
              <CodeList tone="gray" title="Otras advertencias" codes={draft.preview.report.advertencias} />
              {draft.programaId && (
                <p className="text-xs text-gray-500">
                  Las fichas que ya usan este programa no se modifican. Para aplicar los cambios a una ficha, vuelve a cargar su Excel desde Fichas.
                </p>
              )}
              <div className="flex justify-end">
                <button
                  onClick={saveDraft}
                  disabled={!draft.nombre.trim()}
                  className="rounded-lg bg-gray-900 px-6 py-2 text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                  title={!draft.nombre.trim() ? 'Escribe el nombre del programa' : undefined}
                >
                  Guardar programa
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {programas.map(p => {
          const isOpen = expanded === p.id;
          const fichas = fichaCounts.get(p.id) ?? 0;
          return (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900">{p.nombre}</h3>
                    {p.builtin && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Programa base</span>}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {countEvidencias(p)} evidencias · {fichas} {fichas === 1 ? 'ficha' : 'fichas'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.fases.map(f => (
                      <span key={f.nombre} className="rounded px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${f.color}1a`, color: f.color }}>
                        {f.nombre}: {f.actividadesProyecto.reduce((s, ap) => s + ap.actividades.reduce((s2, aa) => s2 + aa.evidencias.length, 0), 0)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {isOpen ? 'Ocultar evidencias' : 'Ver evidencias'}
                  </button>
                  {!p.builtin && (
                    <>
                      <button
                        onClick={() => setDraft({ ...EMPTY_DRAFT, programaId: p.id, nombre: p.nombre })}
                        className="rounded p-1.5 text-gray-400 hover:bg-teal-50 hover:text-teal-600"
                        title="Actualizar con un nuevo Excel / plantilla"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setToDelete(p)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        title="Eliminar programa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="space-y-4 border-t border-gray-100 p-5">
                  {p.fases.map(f => (
                    <div key={f.nombre}>
                      <h4 className="mb-2 text-sm font-bold" style={{ color: f.color }}>Fase {f.nombre}</h4>
                      <div className="space-y-2">
                        {f.actividadesProyecto.map(ap => (
                          <div key={ap.codigo} className="rounded-lg border p-3" style={{ borderColor: `${f.color}33` }}>
                            <p className="text-sm font-semibold text-gray-800">{ap.titulo}</p>
                            {ap.actividades.map(aa => (
                              <div key={aa.codigo} className="mt-2 pl-3">
                                <p className="text-xs font-medium text-gray-700">{aa.titulo}</p>
                                {aa.rapTitulo && <p className="text-[11px] text-gray-500">RAP {aa.rapTitulo}</p>}
                                <ul className="mt-1 space-y-0.5 pl-3">
                                  {aa.evidencias.map(ev => (
                                    <li key={ev.id} className="text-xs text-gray-600">
                                      <span className="font-mono font-semibold text-gray-500">{ev.id}</span> {ev.descripcion}
                                      {ev.tipo && <span className="ml-1 text-[10px] uppercase text-gray-400">· {ev.tipo}</span>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-gray-900">¿Eliminar el programa {toDelete.nombre}?</h3>
            {(fichaCounts.get(toDelete.id) ?? 0) > 0 ? (
              <>
                <p className="mb-6 text-sm text-red-700">
                  No se puede eliminar: {fichaCounts.get(toDelete.id)} ficha(s) lo usan. Asígnales otro programa o elimínalas primero.
                </p>
                <button onClick={() => setToDelete(null)} className="w-full rounded-lg bg-gray-100 py-2.5 font-medium text-gray-700 hover:bg-gray-200">
                  Entendido
                </button>
              </>
            ) : (
              <>
                <p className="mb-6 text-sm text-gray-500">Ninguna ficha usa este programa.</p>
                <div className="flex space-x-3">
                  <button onClick={() => setToDelete(null)} className="flex-1 rounded-lg bg-gray-100 py-2.5 font-medium text-gray-700 hover:bg-gray-200">
                    Cancelar
                  </button>
                  <button onClick={confirmDelete} className="flex-1 rounded-lg bg-red-600 py-2.5 font-medium text-white hover:bg-red-700">
                    Sí, eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

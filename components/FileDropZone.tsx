import React, { useRef, useState } from 'react';
import { FileUp, X } from 'lucide-react';

interface FileDropZoneProps {
  file: File | null;
  onFile: (file: File | null) => void;
  /** Extensiones aceptadas, p. ej. ['.xlsx', '.xls'] */
  accept: string[];
  /** Texto corto del tipo de archivo, p. ej. "Excel (.xlsx)" */
  typeLabel: string;
}

/** Zona para soltar un archivo (arrastrar y soltar o clic para elegirlo) */
export const FileDropZone: React.FC<FileDropZoneProps> = ({ file, onFile, accept, typeLabel }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const pick = (candidate: File | undefined) => {
    if (!candidate) return;
    const name = candidate.name.toLowerCase();
    if (!accept.some(ext => name.endsWith(ext))) {
      setError(`"${candidate.name}" no es un archivo ${typeLabel}.`);
      return;
    }
    setError('');
    onFile(candidate);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setError('');
    onFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 ${
          dragging
            ? 'border-teal-500 bg-teal-50'
            : file
              ? 'border-teal-300 bg-teal-50/50'
              : 'border-gray-300 bg-white hover:border-teal-400 hover:bg-gray-50'
        }`}
      >
        <FileUp className={`h-5 w-5 flex-shrink-0 ${dragging || file ? 'text-teal-600' : 'text-gray-400'}`} />
        {file ? (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800" title={file.name}>{file.name}</span>
            <button
              type="button"
              onClick={clear}
              className="rounded p-1 text-gray-400 hover:bg-white hover:text-red-500"
              title="Quitar archivo"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <span className="text-sm text-gray-500">
            {dragging ? 'Suelta el archivo aquí' : <>Arrastra el {typeLabel} aquí o <span className="font-medium text-teal-700">haz clic para elegirlo</span></>}
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept.join(',')}
          className="hidden"
          onChange={e => pick(e.target.files?.[0])}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

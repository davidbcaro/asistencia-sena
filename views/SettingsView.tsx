import React, { useState, useEffect } from 'react';
import { Download, Upload, Trash2, CheckCircle, FileJson, Cloud, CloudUpload, CloudDownload, RefreshCw, XCircle, AlertCircle, AlertTriangle, Database, Copy, Check, Lock } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { 
    exportFullBackup, 
    importFullBackup, 
    clearDatabase, 
    isSupabaseConfigured,
    getStudents, getFichas, getAttendance, getSessions,
    syncFromCloud,
    verifyInstructorPassword,
    saveInstructorPassword,
    sendStudentsToCloud,
    sendAttendanceToCloud
} from '../services/db';

export const SettingsView: React.FC = () => {
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  
  // SQL Modal State
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState(false);

  // Password Change State
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passMessage, setPassMessage] = useState({ text: '', type: 'success' });
  const [passLoading, setPassLoading] = useState(false);

  useEffect(() => {
    // Check connection status on load
    if (isSupabaseConfigured()) {
      checkConnection();
    } else {
      setConnectionStatus('error');
    }
  }, []);

  const getSupabaseClient = () => {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!url || !key) return null;
      try {
        return createClient(url, key);
      } catch (e) {
        console.error("Invalid Supabase URL/Key", e);
        return null;
      }
  };

  const checkConnection = async () => {
      setConnectionStatus('checking');
      const supabase = getSupabaseClient();
      if (!supabase) {
          setConnectionStatus('error');
          return;
      }
      try {
          // Try a lightweight query to check access
          const { error } = await supabase.from('fichas').select('id', { count: 'exact', head: true });
          
          if (error && error.code !== 'PGRST204') { // PGRST204 = op success but no content (head)
             if (error.message.includes('fetch') || error.message.includes('apikey')) throw error;
          }
          setConnectionStatus('connected');
      } catch (e) {
          console.error(e);
          setConnectionStatus('error');
      }
  };

  // PASSWORD CHANGE
  const handleChangePassword = async () => {
      setPassMessage({ text: '', type: 'success' });
      setPassLoading(true);
      
      try {
        const isCorrect = await verifyInstructorPassword(currentPass);
        
        if (!isCorrect) {
            setPassMessage({ text: 'La contraseña actual no es correcta.', type: 'error' });
            setPassLoading(false);
            return;
        }
        
        if (newPass.length < 4) {
            setPassMessage({ text: 'La nueva contraseña debe tener al menos 4 caracteres.', type: 'error' });
            setPassLoading(false);
            return;
        }

        if (newPass !== confirmPass) {
            setPassMessage({ text: 'Las nuevas contraseñas no coinciden.', type: 'error' });
            setPassLoading(false);
            return;
        }

        await saveInstructorPassword(newPass);
        setPassMessage({ text: 'Contraseña encriptada y actualizada en la nube.', type: 'success' });
        setCurrentPass('');
        setNewPass('');
        setConfirmPass('');
      } catch (e) {
        setPassMessage({ text: 'Error al actualizar.', type: 'error' });
      } finally {
        setPassLoading(false);
      }
  };

  // UPLOAD: Local -> Cloud (via Edge Functions)
  const handleCloudUpload = async () => {
    if (!isSupabaseConfigured()) {
      setSyncStatus('error');
      setSyncMessage('Supabase no está configurado. Configura las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      return;
    }

    if (!confirm("⚠️ ADVERTENCIA DE SEGURIDAD\n\nEsto subirá los datos locales a la Nube (Supabase) usando Edge Functions.\n\n¿Estás seguro de continuar?")) return;

    setSyncStatus('loading');
    setSyncMessage('Iniciando subida...');

    try {
        const students = getStudents();
        const attendance = getAttendance();

        // Upload Students via Edge Function
        if (students.length > 0) {
            setSyncMessage(`Subiendo ${students.length} estudiantes...`);
            await sendStudentsToCloud(students);
        }

        // Upload Attendance via Edge Function
        if (attendance.length > 0) {
            setSyncMessage(`Subiendo ${attendance.length} registros de asistencia...`);
            await sendAttendanceToCloud(attendance);
        }

        setSyncStatus('success');
        setSyncMessage(`¡Éxito! Se sincronizaron ${students.length} estudiantes y ${attendance.length} registros de asistencia.`);

    } catch (e: any) {
        console.error(e);
        setSyncStatus('error');
        setSyncMessage(`FALLÓ LA SUBIDA: ${e.message}`);
    }
  };

  // DOWNLOAD logic
  const handleCloudDownload = async () => {
    if (!confirm("⚠️ REEMPLAZAR DATOS LOCALES\n\nSe descargarán los datos de la nube y se sobrescribirá lo que tienes aquí.\n\n¿Continuar?")) return;

    setSyncStatus('loading');
    setSyncMessage('Descargando...');
    try {
        await syncFromCloud();
        setSyncStatus('success');
        setSyncMessage('¡Datos sincronizados!');
    } catch (e: any) {
        setSyncStatus('error');
        setSyncMessage(`Error descarga: ${e.message}`);
    }
  };

  const handleDownload = () => {
    const json = exportFullBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `asistenciapro_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const success = importFullBackup(text);
      setImportStatus(success ? 'success' : 'error');
    };
    reader.readAsText(file);
  };
  const handleReset = () => {
    if (confirm("¿Borrar todo?")) { clearDatabase(); window.location.reload(); }
  };

  const sqlScript = `
-- 1. LIMPIEZA TOTAL
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS fichas;
DROP TABLE IF EXISTS app_settings;

-- 2. CREAR TABLAS (IDs como TEXT para máxima compatibilidad)
create table public.fichas (
  id text primary key,
  code text not null,
  program text,
  description text
);

create table public.sessions (
  id text primary key,
  date text not null,
  "group" text not null,
  description text
);

create table public.students (
  id text primary key,
  document_number text,
  first_name text not null,
  last_name text not null,
  email text,
  active boolean default true,
  "group" text,
  status text default 'Formación',
  description text
);

create table public.attendance (
  date text not null,
  student_id text references public.students(id) ON DELETE CASCADE,
  present boolean default false,
  primary key (date, student_id)
);

create table public.app_settings (
    id text primary key,
    value text
);

-- 3. DESACTIVAR SEGURIDAD (RLS)
-- Esto permite que la API Key (anon) escriba libremente sin bloqueo de políticas.
ALTER TABLE public.fichas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;

-- 4. PERMISOS BASICOS
GRANT ALL ON TABLE public.fichas TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.sessions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.students TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.attendance TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.app_settings TO anon, authenticated, service_role;

-- 5. MIGRACIÓN: Agregar columnas status y description a tabla students existente
-- (Solo ejecutar si las columnas no existen. Si ya existen, estos comandos fallarán pero no afectarán los datos)
DO $$ 
BEGIN
    -- Agregar columna status si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'students' 
                   AND column_name = 'status') THEN
        ALTER TABLE public.students ADD COLUMN status text DEFAULT 'Formación';
    END IF;
    
    -- Agregar columna description si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'students' 
                   AND column_name = 'description') THEN
        ALTER TABLE public.students ADD COLUMN description text;
    END IF;
    
    -- Actualizar registros existentes sin status a 'Formación'
    UPDATE public.students SET status = 'Formación' WHERE status IS NULL;
END $$;

-- 6. NOTA IMPORTANTE SOBRE ELIMINACIÓN DE FICHAS
-- La eliminación de fichas ahora permite eliminar fichas incluso si tienen estudiantes asociados.
-- El Edge Function 'delete-ficha' maneja automáticamente:
--   - Eliminación de todos los registros de asistencia de estudiantes en la ficha
--   - Eliminación de todos los estudiantes asociados a la ficha
--   - Eliminación de la ficha
-- Esto se hace mediante lógica en el Edge Function, no mediante restricciones de foreign key.
-- La relación entre students.group y fichas.code es por valor de texto, no por foreign key.
`;

  const copyToClipboard = () => {
      navigator.clipboard.writeText(sqlScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl pb-10">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Configuración y Datos</h2>
        <p className="text-gray-500">Gestiona el almacenamiento y sincronización.</p>
      </div>

      {/* --- CLOUD SYNC SECTION --- */}
      <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-md animate-fade-in relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-400 to-purple-500"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                    <Cloud className="w-8 h-8" />
                </div>
                <div>
                    <h3 className="font-bold text-gray-900 text-lg">Base de Datos en la Nube (Supabase)</h3>
                    <p className="text-gray-500 text-sm">Estado: {connectionStatus === 'connected' ? 'Conectado' : 'Desconectado'}</p>
                </div>
            </div>
            
            {/* Fix Database Button */}
            <button 
                onClick={() => setShowSql(true)}
                className="flex items-center gap-2 bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-yellow-100 transition-colors"
            >
                <Database className="w-4 h-4" />
                Script de Instalación (Reparar)
            </button>
        </div>

        {/* Configuration Info */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
            <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900 mb-1">Configuración de Supabase</p>
                    <p className="text-xs text-blue-700">
                        La configuración de Supabase ahora se realiza mediante variables de entorno.
                        Configura <code className="bg-blue-100 px-1 rounded">VITE_SUPABASE_URL</code> y{' '}
                        <code className="bg-blue-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> en tu archivo <code className="bg-blue-100 px-1 rounded">.env</code>.
                    </p>
                    {!isSupabaseConfigured() && (
                        <p className="text-xs text-red-600 mt-2 font-medium">
                            ⚠️ Supabase no está configurado. Las funciones de sincronización no estarán disponibles.
                        </p>
                    )}
                </div>
            </div>
        </div>

        {/* Sync Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
                onClick={handleCloudDownload}
                disabled={connectionStatus !== 'connected' || syncStatus === 'loading'}
                className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 transition-all ${
                    connectionStatus === 'connected' 
                    ? 'border-indigo-100 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 cursor-pointer' 
                    : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                }`}
            >
                {syncStatus === 'loading' ? <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" /> : <CloudDownload className="w-8 h-8 text-indigo-600" />}
                <div className="text-center">
                    <span className="block font-bold text-indigo-900">Bajar datos de Nube a App</span>
                    <span className="text-xs text-indigo-700 px-4">Recuperar mis datos guardados.</span>
                </div>
            </button>

            <button 
                onClick={handleCloudUpload}
                disabled={connectionStatus !== 'connected' || syncStatus === 'loading'}
                className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 transition-all ${
                    connectionStatus === 'connected' 
                    ? 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md cursor-pointer' 
                    : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                }`}
            >
                {syncStatus === 'loading' ? <RefreshCw className="w-8 h-8 text-gray-600 animate-spin" /> : <CloudUpload className="w-8 h-8 text-gray-600" />}
                <div className="text-center">
                    <span className="block font-bold text-gray-800">Subir mis datos a la Nube</span>
                    <span className="text-xs text-gray-500 px-4">Respalda lo que ves en pantalla.</span>
                </div>
            </button>
        </div>
        
        {syncMessage && (
            <div className={`mt-4 p-4 rounded-lg flex items-center justify-center gap-3 text-sm font-bold border ${
                syncStatus === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 
                syncStatus === 'success' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-blue-50 text-blue-700 border-blue-100'
            }`}>
                {syncStatus === 'error' && <AlertTriangle className="w-5 h-5 flex-shrink-0"/>}
                {syncStatus === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0"/>}
                <span>{syncMessage}</span>
            </div>
        )}
      </div>

      {/* --- PASSWORD MANAGEMENT --- */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-start gap-4">
                <div className="p-3 bg-gray-100 text-gray-600 rounded-lg">
                    <Lock className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="font-bold text-gray-900">Seguridad / Cambiar Contraseña</h3>
                    <p className="text-sm text-gray-500 mt-1">Actualiza la contraseña de acceso al Panel Instructor.</p>
                </div>
          </div>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Contraseña Actual</label>
                  <input 
                      type="password"
                      className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={currentPass}
                      onChange={e => setCurrentPass(e.target.value)}
                  />
              </div>
              <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Nueva Contraseña</label>
                  <input 
                      type="password"
                      className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={newPass}
                      onChange={e => setNewPass(e.target.value)}
                  />
              </div>
               <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Confirmar Nueva</label>
                  <input 
                      type="password"
                      className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={confirmPass}
                      onChange={e => setConfirmPass(e.target.value)}
                  />
              </div>
          </div>
          
          {passMessage.text && (
             <div className={`mt-3 text-sm font-bold ${passMessage.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                 {passMessage.text}
             </div>
          )}

          <div className="mt-4 flex justify-end">
               <button 
                  onClick={handleChangePassword}
                  disabled={!currentPass || !newPass || !confirmPass || passLoading}
                  className="bg-gray-800 hover:bg-black disabled:bg-gray-300 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
               >
                   {passLoading ? <RefreshCw className="w-4 h-4 animate-spin"/> : null}
                   Actualizar Contraseña
               </button>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-gray-100 text-gray-600 rounded-lg">
                    <Download className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="font-bold text-gray-900">Respaldo Manual (Archivo)</h3>
                    <p className="text-sm text-gray-500 mt-1">Descarga un archivo .json</p>
                </div>
            </div>
            <button onClick={handleDownload} className="mt-6 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium">
                Descargar Archivo
            </button>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-gray-100 text-gray-600 rounded-lg">
                    <Upload className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="font-bold text-gray-900">Restaurar Archivo</h3>
                    <p className="text-sm text-gray-500 mt-1">Carga un respaldo .json</p>
                </div>
            </div>
            <label className="mt-6 cursor-pointer w-full flex items-center justify-center bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 py-2 rounded-lg font-medium">
                Seleccionar JSON
                <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
            </label>
        </div>
      </div>

      <div className="bg-red-50 p-6 rounded-xl border border-red-100 mt-4 mb-8">
            <h3 className="font-bold text-red-800 flex items-center gap-2"><Trash2 className="w-5 h-5" /> Zona de Peligro</h3>
            <button onClick={handleReset} className="mt-4 bg-white border border-red-200 text-red-600 hover:bg-red-600 hover:text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                Borrar Todo (Local)
            </button>
      </div>

      {/* SQL SCRIPT MODAL */}
      {showSql && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                          <Database className="w-6 h-6 text-indigo-600"/>
                          Script de Instalación (SQL)
                      </h3>
                      <button onClick={() => setShowSql(false)} className="text-gray-400 hover:text-gray-600"><XCircle className="w-6 h-6"/></button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                      <div className="mb-4 text-sm text-gray-600">
                          <p className="font-bold text-gray-800 mb-2">Instrucciones:</p>
                          <ol className="list-decimal ml-5 space-y-1">
                              <li>Copia el código de abajo.</li>
                              <li>Ve a tu proyecto en <b>Supabase</b>.</li>
                              <li>Entra en la sección <b>SQL Editor</b> (icono de terminal en la izquierda).</li>
                              <li>Pega el código y dale al botón <b>RUN</b>.</li>
                              <li>Vuelve aquí e intenta subir tus datos de nuevo.</li>
                          </ol>
                      </div>
                      <div className="relative">
                          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed border border-gray-700">
                              {sqlScript}
                          </pre>
                          <button 
                              onClick={copyToClipboard}
                              className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white p-2 rounded-md backdrop-blur-sm transition-colors"
                              title="Copiar código"
                          >
                              {copied ? <Check className="w-4 h-4 text-green-400"/> : <Copy className="w-4 h-4"/>}
                          </button>
                      </div>
                  </div>
                  <div className="p-4 border-t border-gray-100 flex justify-end">
                      <button onClick={() => setShowSql(false)} className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-black font-medium">
                          Entendido, cerrar
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
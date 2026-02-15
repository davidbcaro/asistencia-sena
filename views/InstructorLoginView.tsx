import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, Loader2, ArrowLeft } from 'lucide-react';
import { UserRole } from '../types';
import { isInstructorPasswordSet, saveInstructorPassword, verifyInstructorPassword } from '../services/db';

interface InstructorLoginViewProps {
  onSelectRole: (role: UserRole) => void;
}

export const InstructorLoginView: React.FC<InstructorLoginViewProps> = ({ onSelectRole }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordInitialized, setIsPasswordInitialized] = useState<boolean | null>(null);
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupError, setSetupError] = useState('');
  const [isSetupLoading, setIsSetupLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setError('');
    setSetupError('');
    isInstructorPasswordSet()
      .then(result => {
        if (isMounted) setIsPasswordInitialized(result);
      })
      .catch(() => {
        if (isMounted) setIsPasswordInitialized(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleInstructorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const isValid = await verifyInstructorPassword(password);
      if (isValid) {
        onSelectRole('professor');
      } else {
        setError('Contraseña incorrecta');
        setPassword('');
      }
    } catch {
      setError('Error al verificar credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');
    setIsSetupLoading(true);

    try {
      if (setupPassword.length < 4) {
        setSetupError('La contraseña debe tener al menos 4 caracteres.');
        setIsSetupLoading(false);
        return;
      }
      if (setupPassword !== setupConfirm) {
        setSetupError('Las contraseñas no coinciden.');
        setIsSetupLoading(false);
        return;
      }

      await saveInstructorPassword(setupPassword);
      onSelectRole('professor');
    } catch {
      setSetupError('Error al guardar la contraseña.');
    } finally {
      setIsSetupLoading(false);
    }
  };

  if (isPasswordInitialized === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <Link
        to="/"
        className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition-colors text-sm font-medium p-2 rounded-lg hover:bg-gray-100"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver al inicio
      </Link>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 animate-fade-in-up">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Acceso Instructor</h1>
          <p className="text-sm text-gray-500 mt-1 text-center">
            {isPasswordInitialized === false
              ? 'Crea tu contraseña de seguridad'
              : 'Ingresa tu contraseña de seguridad'}
          </p>
        </div>

        {isPasswordInitialized === false ? (
          <form onSubmit={handleSetupPassword} className="space-y-4" autoComplete="off">
            <div>
              <input
                type="password"
                id="setup-password"
                name="new-password"
                autoComplete="new-password"
                autoFocus
                placeholder="Nueva contraseña"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-center text-lg tracking-widest"
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
                disabled={isSetupLoading}
              />
            </div>
            <div>
              <input
                type="password"
                id="setup-password-confirm"
                name="confirm-password"
                autoComplete="new-password"
                placeholder="Confirmar contraseña"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-center text-lg tracking-widest"
                value={setupConfirm}
                onChange={(e) => setSetupConfirm(e.target.value)}
                disabled={isSetupLoading}
              />
            </div>

            {setupError && (
              <p className="text-sm text-red-600 text-center font-medium bg-red-50 py-2 rounded-lg">
                {setupError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSetupLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isSetupLoading && <Loader2 className="w-5 h-5 animate-spin" />}
              Guardar contraseña
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleInstructorLogin}
            className="space-y-4"
            autoComplete="on"
            method="post"
            action={window.location.origin + '/login/instructor'}
          >
            {/* Campo fijo para que el navegador reconozca usuario+contraseña y ofrezca guardar/sugerir */}
            <div className="sr-only" aria-hidden="true">
              <label htmlFor="instructor-username">Usuario</label>
              <input
                type="text"
                id="instructor-username"
                name="username"
                autoComplete="username"
                defaultValue="instructor"
                readOnly
                tabIndex={-1}
                className="absolute opacity-0 pointer-events-none h-0 w-0"
              />
            </div>
            <div>
              <input
                type="password"
                id="instructor-password"
                name="password"
                autoComplete="current-password"
                autoFocus
                placeholder="Contraseña"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-center text-lg tracking-widest"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 text-center font-medium bg-red-50 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
              Ingresar
            </button>
          </form>
        )}
      </div>

      <div className="mt-8 text-center text-xs text-gray-400">
        <p>© {new Date().getFullYear()} AsistenciaPro. Todos los derechos reservados.</p>
      </div>
    </div>
  );
};

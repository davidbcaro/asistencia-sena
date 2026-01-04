import React, { useState } from 'react';
import { GraduationCap, UserCheck, ShieldCheck, Lock, X, ArrowRight, Loader2 } from 'lucide-react';
import { UserRole } from '../types';
import { verifyInstructorPassword } from '../services/db';

interface LoginViewProps {
  onSelectRole: (role: UserRole) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSelectRole }) => {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
    } catch (e) {
        setError('Error al verificar credenciales.');
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 relative">
      
      {/* Botón Instructor (Superior Izquierda) */}
      <button 
        onClick={() => setShowPasswordModal(true)}
        className="absolute top-6 left-6 flex items-center gap-2 text-gray-400 hover:text-indigo-600 transition-colors text-sm font-medium p-2 rounded-lg hover:bg-gray-100"
      >
        <ShieldCheck className="w-4 h-4" />
        <span>Acceso Instructor</span>
      </button>

      <div className="text-center mb-10 animate-fade-in mt-10 md:mt-0">
        <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-200 transform rotate-3">
            <GraduationCap className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">AsistenciaPro</h1>
        <p className="text-gray-500 text-lg">Sistema de Gestión Académica</p>
      </div>

      <div className="w-full max-w-md animate-fade-in-up">
        {/* Student Card - Main Focus */}
        <button 
            onClick={() => onSelectRole('student')}
            className="w-full group relative bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl border-2 border-transparent hover:border-green-500 transition-all duration-300 text-left flex flex-col items-center text-center"
        >
             <div className="absolute top-4 right-4 bg-green-50 text-green-700 p-2 rounded-lg group-hover:bg-green-600 group-hover:text-white transition-colors">
                <ArrowRight className="w-5 h-5" />
            </div>

            <div className="p-4 bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mb-6 text-green-700 group-hover:scale-110 transition-transform">
                <UserCheck className="w-10 h-10" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Soy Aprendiz</h2>
            <p className="text-gray-500 text-sm max-w-xs">
                Ingresa al Portal del Aprendiz para registrar tu asistencia diaria y consultar tu histórico de fallas.
            </p>
        </button>
      </div>

      <div className="mt-12 text-center text-xs text-gray-400">
        <p>© {new Date().getFullYear()} AsistenciaPro. Todos los derechos reservados.</p>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 relative">
                <button 
                    onClick={() => { setShowPasswordModal(false); setError(''); setPassword(''); }}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex flex-col items-center mb-6">
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-3">
                        <Lock className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">Acceso Instructor</h3>
                    <p className="text-sm text-gray-500">Ingresa tu contraseña de seguridad</p>
                </div>

                <form onSubmit={handleInstructorLogin} className="space-y-4" autoComplete="on">
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
                        <p className="text-sm text-red-600 text-center font-medium bg-red-50 py-2 rounded-lg">{error}</p>
                    )}

                    <button 
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                    >
                        {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                        Ingresar
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
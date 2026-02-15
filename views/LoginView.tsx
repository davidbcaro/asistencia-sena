import React from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, UserCheck, ShieldCheck, ArrowRight } from 'lucide-react';
import { UserRole } from '../types';

interface LoginViewProps {
  onSelectRole: (role: UserRole) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSelectRole }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 relative">
      {/* Enlace Acceso Instructor (Superior Izquierda) */}
      <Link
        to="/login/instructor"
        className="absolute top-6 left-6 flex items-center gap-2 text-gray-400 hover:text-indigo-600 transition-colors text-sm font-medium p-2 rounded-lg hover:bg-gray-100"
      >
        <ShieldCheck className="w-4 h-4" />
        <span>Acceso Instructor</span>
      </Link>

      <Link to="/" className="text-center mb-10 animate-fade-in mt-10 md:mt-0">
        <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-200 transform rotate-3">
            <GraduationCap className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">AsistenciaPro</h1>
        <p className="text-gray-500 text-lg">Sistema de Gestión Académica</p>
      </Link>

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
    </div>
  );
};
/**
 * AsistenciaPro — Shared UI Component Library
 * Design reference: Linear.app — clean, minimal, teal primary
 *
 * Components:
 *  Button       — primary | secondary | outline | ghost | danger
 *  IconButton   — square icon-only button
 *  Badge        — success | warning | danger | neutral | info | primary
 *  Input        — text field with optional label, icon, helper & error states
 *  Select       — native select with same visual language as Input
 *  Card         — white surface with subtle border + shadow
 *  PageHeader   — page-level title + optional subtitle + action slot
 *  SectionTitle — sub-section heading
 *  Spinner      — loading indicator
 *  EmptyState   — empty/no-data placeholder
 *  Divider      — horizontal rule
 */

import React, { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

/* ─────────────────────────── BUTTON ──────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize    = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant;
  size?:     ButtonSize;
  loading?:  boolean;
  icon?:     ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
}

const buttonBase =
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 select-none whitespace-nowrap shrink-0';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-teal-600 text-white border-teal-600 hover:bg-teal-700 hover:border-teal-700 focus-visible:ring-teal-500 active:bg-teal-800',
  secondary:
    'bg-teal-50 text-teal-700 border-teal-100 hover:bg-teal-100 hover:border-teal-200 focus-visible:ring-teal-400 active:bg-teal-200',
  outline:
    'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300 focus-visible:ring-teal-400 active:bg-gray-100',
  ghost:
    'bg-transparent text-gray-600 border-transparent hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-teal-400 active:bg-gray-200',
  danger:
    'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-300 focus-visible:ring-red-400 active:bg-red-200',
};

const buttonSizes: Record<ButtonSize, string> = {
  xs: 'px-2 py-1 text-[11px] gap-1.5',
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size    = 'md',
  loading = false,
  icon,
  iconRight,
  children,
  disabled,
  className = '',
  ...props
}) => {
  const isDisabled = disabled || loading;
  return (
    <button
      disabled={isDisabled}
      className={`${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
};

/* ─────────────────────────── ICON BUTTON ─────────────────── */

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?:    ButtonSize;
  label:    string;    /* required for accessibility */
  children: ReactNode;
  loading?: boolean;
}

const iconButtonSizes: Record<ButtonSize, string> = {
  xs: 'w-6 h-6 text-[11px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-9 h-9 text-sm',
};

export const IconButton: React.FC<IconButtonProps> = ({
  variant  = 'ghost',
  size     = 'md',
  label,
  children,
  loading  = false,
  disabled,
  className = '',
  ...props
}) => {
  const isDisabled = disabled || loading;
  return (
    <button
      aria-label={label}
      title={label}
      disabled={isDisabled}
      className={`${buttonBase} ${buttonVariants[variant]} ${iconButtonSizes[size]} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : children}
    </button>
  );
};

/* ─────────────────────────── BADGE ───────────────────────── */

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'primary';
type BadgeSize    = 'sm' | 'md';

interface BadgeProps {
  variant?:  BadgeVariant;
  size?:     BadgeSize;
  dot?:      boolean;
  children:  ReactNode;
  className?: string;
}

const badgeVariants: Record<BadgeVariant, string> = {
  success: 'bg-green-50  text-green-700  border border-green-200',
  warning: 'bg-amber-50  text-amber-700  border border-amber-200',
  danger:  'bg-red-50    text-red-700    border border-red-200',
  neutral: 'bg-gray-100  text-gray-600   border border-gray-200',
  info:    'bg-blue-50   text-blue-700   border border-blue-200',
  primary: 'bg-teal-50   text-teal-700   border border-teal-200',
};

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
  neutral: 'bg-gray-400',
  info:    'bg-blue-500',
  primary: 'bg-teal-500',
};

const badgeSizes: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
};

export const Badge: React.FC<BadgeProps> = ({
  variant   = 'neutral',
  size      = 'md',
  dot       = false,
  children,
  className = '',
}) => (
  <span className={`inline-flex items-center gap-1 font-semibold rounded-full whitespace-nowrap leading-snug ${badgeVariants[variant]} ${badgeSizes[size]} ${className}`}>
    {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} />}
    {children}
  </span>
);

/* ─────────────────────────── INPUT ───────────────────────── */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:     string;
  helper?:    string;
  error?:     string;
  icon?:      ReactNode;
  iconRight?: ReactNode;
  wrapperClassName?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  helper,
  error,
  icon,
  iconRight,
  wrapperClassName = '',
  className        = '',
  id,
  ...props
}) => {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  const hasError = !!error;
  return (
    <div className={`flex flex-col gap-1 ${wrapperClassName}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={`
            w-full bg-white border rounded-lg text-sm text-gray-900 placeholder:text-gray-400
            px-3 py-2 transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-offset-0
            ${icon      ? 'pl-9'  : ''}
            ${iconRight ? 'pr-9'  : ''}
            ${hasError
              ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
              : 'border-gray-200 focus:border-teal-400 focus:ring-teal-100 hover:border-gray-300'}
            ${props.disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}
            ${className}
          `}
          {...props}
        />
        {iconRight && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {iconRight}
          </span>
        )}
      </div>
      {(helper || error) && (
        <p className={`text-xs mt-0.5 ${hasError ? 'text-red-600' : 'text-gray-400'}`}>
          {error ?? helper}
        </p>
      )}
    </div>
  );
};

/* ─────────────────────────── SELECT ──────────────────────── */

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?:    string;
  helper?:   string;
  error?:    string;
  icon?:     ReactNode;
  wrapperClassName?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  helper,
  error,
  icon,
  wrapperClassName = '',
  className        = '',
  id,
  children,
  ...props
}) => {
  const inputId  = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  const hasError = !!error;
  return (
    <div className={`flex flex-col gap-1 ${wrapperClassName}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
            {icon}
          </span>
        )}
        <select
          id={inputId}
          className={`
            w-full bg-white border rounded-lg text-sm text-gray-900 appearance-none
            px-3 py-2 pr-8 transition-colors duration-150 cursor-pointer
            focus:outline-none focus:ring-2 focus:ring-offset-0
            ${icon ? 'pl-9' : ''}
            ${hasError
              ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
              : 'border-gray-200 focus:border-teal-400 focus:ring-teal-100 hover:border-gray-300'}
            ${props.disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}
            ${className}
          `}
          {...props}
        >
          {children}
        </select>
        {/* Chevron icon */}
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>
      {(helper || error) && (
        <p className={`text-xs mt-0.5 ${hasError ? 'text-red-600' : 'text-gray-400'}`}>
          {error ?? helper}
        </p>
      )}
    </div>
  );
};

/* ─────────────────────────── CARD ────────────────────────── */

interface CardProps {
  children:   ReactNode;
  className?: string;
  padding?:   'none' | 'sm' | 'md' | 'lg';
  /** Remove border + shadow to make it a flat section */
  flat?:      boolean;
}

const cardPadding = {
  none: '',
  sm:   'p-4',
  md:   'p-5',
  lg:   'p-6',
};

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding   = 'md',
  flat      = false,
}) => (
  <div
    className={`
      bg-white rounded-xl
      ${flat
        ? 'border border-gray-100'
        : 'border border-gray-200 shadow-sm'}
      ${cardPadding[padding]}
      ${className}
    `}
  >
    {children}
  </div>
);

/* ─────────────────────────── PAGE HEADER ─────────────────── */

interface PageHeaderProps {
  title:      ReactNode;
  subtitle?:  ReactNode;
  actions?:   ReactNode;
  icon?:      ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  icon,
  className = '',
}) => (
  <div className={`flex items-start justify-between gap-4 mb-6 ${className}`}>
    <div className="flex items-center gap-3 min-w-0">
      {icon && (
        <div className="p-2 bg-teal-50 rounded-lg text-teal-600 flex-shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-snug truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
    {actions && (
      <div className="flex items-center gap-2 flex-shrink-0">
        {actions}
      </div>
    )}
  </div>
);

/* ─────────────────────────── SECTION TITLE ───────────────── */

interface SectionTitleProps {
  children:   ReactNode;
  subtitle?:  ReactNode;
  actions?:   ReactNode;
  className?: string;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({
  children,
  subtitle,
  actions,
  className = '',
}) => (
  <div className={`flex items-center justify-between gap-2 mb-3 ${className}`}>
    <div>
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{children}</h2>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-1.5">{actions}</div>}
  </div>
);

/* ─────────────────────────── SPINNER ─────────────────────── */

interface SpinnerProps {
  size?:      'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const spinnerSizes = {
  xs: 'w-3 h-3 border-[1.5px]',
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-6 h-6 border-[2.5px]',
};

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className = '' }) => (
  <span
    role="status"
    aria-label="Cargando"
    className={`
      inline-block rounded-full
      border-gray-200 border-t-teal-600
      animate-spin flex-shrink-0
      ${spinnerSizes[size]}
      ${className}
    `}
  />
);

/* ─────────────────────────── EMPTY STATE ─────────────────── */

interface EmptyStateProps {
  icon?:       ReactNode;
  title:       string;
  description?: string;
  action?:     ReactNode;
  className?:  string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className}`}>
    {icon && (
      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-gray-300 mb-1">
        {icon}
      </div>
    )}
    <div>
      <p className="text-sm font-semibold text-gray-600">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1 max-w-xs">{description}</p>}
    </div>
    {action && <div className="mt-1">{action}</div>}
  </div>
);

/* ─────────────────────────── DIVIDER ─────────────────────── */

interface DividerProps {
  className?: string;
  label?:     string;
}

export const Divider: React.FC<DividerProps> = ({ className = '', label }) => {
  if (label) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
    );
  }
  return <div className={`h-px bg-gray-200 ${className}`} />;
};

/* ─────────────────────────── MODAL SHELL ─────────────────── */

interface ModalProps {
  onClose:     () => void;
  title?:      ReactNode;
  subtitle?:   ReactNode;
  children:    ReactNode;
  footer?:     ReactNode;
  width?:      'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  className?:  string;
}

const modalWidths = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-lg',
  xl:   'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  full: 'max-w-full',
};

export const Modal: React.FC<ModalProps> = ({
  onClose,
  title,
  subtitle,
  children,
  footer,
  width    = 'md',
  className = '',
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'rgb(0 0 0 / 0.35)', backdropFilter: 'blur(3px)' }}
    onClick={onClose}
  >
    <div
      className={`bg-white rounded-xl shadow-xl w-full flex flex-col overflow-hidden ${modalWidths[width]} ${className}`}
      style={{ maxHeight: 'calc(100vh - 2rem)', animation: 'modal-in 160ms ease' }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      {(title || subtitle) && (
        <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
          {title    && <h2 className="text-base font-semibold text-gray-900 leading-snug">{title}</h2>}
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      )}

      {/* Body */}
      <div className="overflow-y-auto flex-1">
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 flex-shrink-0 bg-gray-50/60">
          {footer}
        </div>
      )}
    </div>
  </div>
);

/* ─────────────────────────── TOOLTIP (simple) ────────────── */

interface TooltipProps {
  label:      string;
  children:   ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ label, children, className = '' }) => (
  <span className={`relative group inline-flex ${className}`}>
    {children}
    <span className="
      absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5
      pointer-events-none opacity-0 group-hover:opacity-100
      transition-opacity duration-150 z-50
      bg-gray-900 text-white text-[11px] font-medium rounded-md
      px-2 py-1 whitespace-nowrap shadow-lg
    ">
      {label}
      {/* Arrow */}
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
    </span>
  </span>
);

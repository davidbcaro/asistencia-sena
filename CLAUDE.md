# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AsistenciaPro is a React + TypeScript attendance management system for SENA (Colombian national training service). It supports two user roles: instructor (professor) and student, with features including attendance tracking, student management, grades, and integration with SENA's Sofia Plus system.

## Development Commands

```bash
npm install     # Install dependencies
npm run dev     # Start development server (Vite, port 3000)
npm run build   # Production build (outputs to dist/)
npm run preview # Preview production build
```

## Architecture

### Tech Stack
- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Routing**: React Router v7
- **UI**: Lucide React icons, Recharts for charts
- **Export**: jsPDF, ExcelJS, xlsx

### Project Structure
```
/                    # Root-level components and config
├── App.tsx          # Main routing with role-based access
├── index.tsx        # React entry point
├── types.ts         # All TypeScript interfaces
├── views/           # Page components (14 views)
├── components/      # Shared components (Layout.tsx)
├── services/db.ts   # Data layer (localStorage + Supabase sync)
└── supabase/functions/  # Edge Functions for secure writes
```

### Data Layer (`services/db.ts`)
- **Hybrid storage**: localStorage for offline-first, Supabase for cloud sync
- **Read operations**: Direct Supabase client (anon key)
- **Write operations**: All writes go through Edge Functions (service_role key)
- **Realtime**: Supabase Realtime subscriptions for attendance and sessions
- **Storage keys**: All prefixed with `asistenciapro_`

### Key Patterns
1. **Role-based routing**: `RequireRole` component guards routes by user role
2. **Data sync**: `syncFromCloud()` pulls from Supabase; writes trigger Edge Function calls
3. **Realtime updates**: Channel subscription on `attendance` and `sessions` tables
4. **Data migration shims**: `getStudents()` and `getFichas()` handle legacy formats

### Edge Functions (in `supabase/functions/`)
- `save-attendance`, `save-students`, `save-fichas`, `save-sessions` - Upsert operations
- `delete-session`, `delete-ficha`, `soft-delete-student` - Delete operations

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_EDGE_URL=https://your-project.supabase.co/functions/v1
GEMINI_API_KEY=optional-for-ai-features
```

## Deployment

Deploy Edge Functions before using cloud sync:
```bash
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy save-attendance
supabase functions deploy save-students
supabase functions deploy save-fichas
supabase functions deploy save-sessions
```

The frontend deploys to Vercel (auto-detects Vite). Set environment variables in Vercel dashboard.

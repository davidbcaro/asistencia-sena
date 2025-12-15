<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1JVL3hKs4z65a2dYcVp4COUTnmHyri6QV

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory with your environment variables:
   ```bash
   # Supabase Configuration (required for cloud sync)
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   VITE_SUPABASE_EDGE_URL=https://your-project-id.supabase.co/functions/v1
   
   # Gemini API Key (optional, if using AI features)
   GEMINI_API_KEY=your-gemini-api-key-here
   ```
   
   **Important Security Notes:**
   - Never commit the `.env` file to version control (it's already in `.gitignore`)
   - Get your Supabase keys from: Supabase Project → Settings (⚙️) → API
   - `VITE_SUPABASE_EDGE_URL` is the base URL for Edge Functions (usually `{SUPABASE_URL}/functions/v1`)
   - The app uses Edge Functions for all write operations (secure architecture)
   - For production deployment, set these as environment variables in your hosting platform

3. Run the app:
   ```bash
   npm run dev
   ```

## Supabase Edge Functions Setup

This app uses Supabase Edge Functions for secure write operations. You need to deploy the Edge Functions before using cloud sync:

1. **Install Supabase CLI:**
   ```bash
   npm install -g supabase
   ```

2. **Login and link your project:**
   ```bash
   supabase login
   supabase link --project-ref your-project-ref
   ```

3. **Deploy Edge Functions:**
   ```bash
   supabase functions deploy save-attendance
   supabase functions deploy save-students
   ```

See `supabase/README.md` for more details.

## Production Deployment

### 🚀 Desplegar en Vercel (Recomendado)

Para una guía completa paso a paso, consulta **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)**

**Resumen rápido:**

1. **Desplegar Edge Functions en Supabase:**
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref your-project-ref
   supabase functions deploy save-attendance
   supabase functions deploy save-students
   supabase functions deploy save-fichas
   ```

2. **Conectar repositorio con Vercel:**
   - Ve a [vercel.com](https://vercel.com)
   - Importa tu repositorio
   - Vercel detectará automáticamente Vite

3. **Configurar variables de entorno en Vercel:**
   - `VITE_SUPABASE_URL` - URL de tu proyecto Supabase
   - `VITE_SUPABASE_ANON_KEY` - Anon key de Supabase
   - `VITE_SUPABASE_EDGE_URL` - `{SUPABASE_URL}/functions/v1`
   - `GEMINI_API_KEY` (opcional)

4. **Desplegar** - Vercel desplegará automáticamente

### 📦 Desplegar en Otras Plataformas

Para Netlify, Railway, o otras plataformas:

1. **Set environment variables** in your hosting platform:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_EDGE_URL` (base URL for Edge Functions)
   - `GEMINI_API_KEY` (if used)

2. **Deploy Edge Functions** to Supabase (see above)

3. **Build command**: `npm run build`
4. **Output directory**: `dist`

### 🔒 Seguridad

- **Never** hardcode API keys in your source code
- **Architecture:** The app uses a secure architecture where:
  - Frontend uses `anon` key for read operations only
  - All write operations go through Edge Functions
  - Edge Functions use `service_role` key (never exposed to frontend)

# Guía de Despliegue en Vercel

Esta guía te ayudará a desplegar tu aplicación AsistenciaPro en Vercel de forma segura.

## 📋 Prerrequisitos

1. **Cuenta en Vercel**: [vercel.com](https://vercel.com) (gratis)
2. **Cuenta en Supabase**: [supabase.com](https://supabase.com) (gratis)
3. **Repositorio Git**: GitHub, GitLab o Bitbucket

## 🚀 Paso 1: Preparar el Repositorio

1. Asegúrate de que tu código esté en un repositorio Git:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/tu-usuario/asistencia-pro.git
   git push -u origin main
   ```

## 🔧 Paso 2: Desplegar Edge Functions en Supabase

**IMPORTANTE**: Debes desplegar las Edge Functions ANTES de desplegar el frontend.

### 2.1 Instalar Supabase CLI

```bash
npm install -g supabase
```

### 2.2 Iniciar sesión en Supabase

```bash
supabase login
```

Esto abrirá tu navegador para autenticarte.

### 2.3 Obtener tu Project Reference ID

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Ve a **Settings** → **General**
3. Copia el **Reference ID** (algo como `abcdefghijklmnop`)

### 2.4 Inicializar Supabase (si es necesario)

Si es la primera vez que usas Supabase CLI en este proyecto, inicializa la configuración:

```bash
supabase init
```

Esto creará el archivo `supabase/config.toml` si no existe.

### 2.5 Vincular tu proyecto local

```bash
supabase link --project-ref tu-project-ref-id
```

Cuando te pida el database password, usa la contraseña de tu proyecto Supabase.

### 2.6 Desplegar las Edge Functions

**IMPORTANTE**: Asegúrate de ejecutar estos comandos desde el **directorio raíz** del proyecto (donde está el archivo `package.json`).

```bash
# Desplegar función de asistencia
supabase functions deploy save-attendance

# Desplegar función de estudiantes
supabase functions deploy save-students

# Desplegar función de fichas
supabase functions deploy save-fichas

# Desplegar función de sesiones
supabase functions deploy save-sessions
```

**Nota sobre Docker**: Si ves un warning sobre Docker, puedes ignorarlo si solo estás desplegando funciones. Docker solo es necesario para desarrollo local.

Deberías ver mensajes de éxito como:
```
Deploying function save-attendance...
Function save-attendance deployed successfully
```

### 2.6 Verificar las funciones

Las funciones estarán disponibles en:
- `https://tu-project-ref.supabase.co/functions/v1/save-attendance`
- `https://tu-project-ref.supabase.co/functions/v1/save-students`
- `https://tu-project-ref.supabase.co/functions/v1/save-fichas`
- `https://tu-project-ref.supabase.co/functions/v1/save-sessions`

## 🌐 Paso 3: Desplegar Frontend en Vercel

### 3.1 Conectar Repositorio con Vercel

1. Ve a [vercel.com](https://vercel.com) e inicia sesión
2. Haz clic en **Add New Project**
3. Importa tu repositorio de GitHub/GitLab/Bitbucket
4. Vercel detectará automáticamente que es un proyecto Vite

### 3.2 Configurar Variables de Entorno

**📖 Para una guía detallada, consulta [CONFIGURAR_VERCEL.md](./CONFIGURAR_VERCEL.md)**

En la pantalla de configuración del proyecto, agrega estas variables de entorno:

#### Variables Requeridas:

```
VITE_SUPABASE_URL=https://tu-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
VITE_SUPABASE_EDGE_URL=https://tu-project-ref.supabase.co/functions/v1
```

**⚠️ IMPORTANTE**: Solo necesitas **UNA** variable `VITE_SUPABASE_EDGE_URL` (URL base). 
El código automáticamente construye las URLs completas:
- `{VITE_SUPABASE_EDGE_URL}/save-attendance`
- `{VITE_SUPABASE_EDGE_URL}/save-students`

#### Variables Opcionales:

```
GEMINI_API_KEY=tu-gemini-key-aqui (solo si usas funciones de IA)
```

**Cómo obtener las keys de Supabase:**
1. Ve a tu proyecto en Supabase Dashboard
2. Ve a **Settings** → **API**
3. Copia:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
   - **Edge Functions URL** → `VITE_SUPABASE_EDGE_URL` (es `{Project URL}/functions/v1`)

### 3.3 Configurar Build Settings

Vercel debería detectar automáticamente:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

Si no se detecta automáticamente, configura manualmente:
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 3.4 Desplegar

1. Haz clic en **Deploy**
2. Espera a que termine el build (1-2 minutos)
3. Tu app estará disponible en `https://tu-proyecto.vercel.app`

## ✅ Paso 4: Verificar el Despliegue

### 4.1 Verificar Variables de Entorno

1. Ve a tu proyecto en Vercel Dashboard
2. Ve a **Settings** → **Environment Variables**
3. Verifica que todas las variables estén configuradas

### 4.2 Probar la Aplicación

1. Abre tu URL de Vercel
2. Inicia sesión en la aplicación
3. Prueba crear un estudiante o tomar asistencia
4. Verifica que la sincronización con Supabase funcione

### 4.3 Verificar Edge Functions

Abre la consola del navegador (F12) y verifica que no haya errores relacionados con las Edge Functions.

## 🔒 Seguridad Post-Despliegue

### ✅ Checklist de Seguridad

- [ ] Las variables de entorno están configuradas en Vercel (no en el código)
- [ ] El archivo `.env` está en `.gitignore` (no se sube al repositorio)
- [ ] Las Edge Functions están desplegadas en Supabase
- [ ] No hay keys hardcodeadas en el código fuente
- [ ] Solo se usa `anon` key en el frontend (nunca `service_role`)

## 🔄 Actualizaciones Futuras

Cada vez que hagas `git push` a tu repositorio:
1. Vercel detectará los cambios automáticamente
2. Creará un nuevo deployment
3. Si el build es exitoso, se desplegará automáticamente

Para actualizar las Edge Functions:
```bash
supabase functions deploy save-attendance
supabase functions deploy save-students
```

## 🐛 Solución de Problemas

Para una guía más completa de solución de errores, consulta **[SOLUCION_ERRORES.md](./SOLUCION_ERRORES.md)**

### Error: "Entrypoint path does not exist"

**Solución**: 
1. Asegúrate de ejecutar el comando desde el **directorio raíz** del proyecto (donde está `package.json`)
2. Verifica que los archivos existan: `supabase/functions/save-attendance/index.ts`
3. Si falta `supabase/config.toml`, ejecuta: `supabase init`

### Error: "VITE_SUPABASE_EDGE_URL not configured"

**Solución**: Asegúrate de agregar la variable de entorno en Vercel:
- Ve a **Settings** → **Environment Variables**
- Agrega `VITE_SUPABASE_EDGE_URL` con el valor: `https://tu-project-ref.supabase.co/functions/v1`

### Error: "Failed to sync to cloud"

**Solución**: 
1. Verifica que las Edge Functions estén desplegadas
2. Verifica que `VITE_SUPABASE_EDGE_URL` esté correctamente configurada
3. Revisa los logs de las Edge Functions en Supabase Dashboard

### Error: "CORS error" en Edge Functions

**Solución**: Las Edge Functions ya tienen CORS configurado. Si persiste:
1. Verifica que estés usando la URL correcta de Edge Functions
2. Verifica que las funciones estén desplegadas correctamente

### Build falla en Vercel

**Solución**:
1. Verifica que todas las dependencias estén en `package.json`
2. Revisa los logs de build en Vercel Dashboard
3. Asegúrate de que Node.js versión sea compatible (Vercel usa Node 18+ por defecto)

## 📚 Recursos Adicionales

- [Documentación de Vercel](https://vercel.com/docs)
- [Documentación de Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Dashboard](https://app.supabase.com)

## 🎉 ¡Listo!

Tu aplicación ahora está desplegada de forma segura en Vercel con:
- ✅ Frontend en Vercel (CDN global)
- ✅ Base de datos en Supabase
- ✅ Edge Functions para operaciones seguras
- ✅ Variables de entorno protegidas
- ✅ Arquitectura segura sin keys expuestas


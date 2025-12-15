# Configurar Variables de Entorno en Vercel

## 📝 Variables Necesarias

Solo necesitas configurar **3 variables de entorno** en Vercel:

### 1. VITE_SUPABASE_URL
```
https://tu-project-ref.supabase.co
```
- **Dónde obtenerla**: Supabase Dashboard → Settings → API → Project URL

### 2. VITE_SUPABASE_ANON_KEY
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
- **Dónde obtenerla**: Supabase Dashboard → Settings → API → anon public key

### 3. VITE_SUPABASE_EDGE_URL
```
https://tu-project-ref.supabase.co/functions/v1
```
- **Dónde obtenerla**: Es la URL base de Edge Functions
- **Formato**: `{VITE_SUPABASE_URL}/functions/v1`
- **Ejemplo**: Si tu `VITE_SUPABASE_URL` es `https://abc123.supabase.co`, entonces `VITE_SUPABASE_EDGE_URL` será `https://abc123.supabase.co/functions/v1`

### 4. GEMINI_API_KEY (Opcional)
```
tu-gemini-api-key-aqui
```
- Solo necesaria si usas funciones de IA

## ✅ Cómo Configurarlas en Vercel

### Paso 1: Ir a Variables de Entorno

1. Ve a tu proyecto en [Vercel Dashboard](https://vercel.com/dashboard)
2. Haz clic en **Settings**
3. En el menú lateral, haz clic en **Environment Variables**

### Paso 2: Agregar Cada Variable

Para cada variable:

1. Haz clic en **Add New**
2. Ingresa el **Name** (nombre de la variable)
3. Ingresa el **Value** (valor)
4. Selecciona los **Environments** donde aplicará:
   - ✅ **Production** (para producción)
   - ✅ **Preview** (para previews de PRs, opcional)
   - ✅ **Development** (para desarrollo local, opcional)
5. Haz clic en **Save**

### Paso 3: Verificar

Después de agregar todas las variables, deberías ver algo como:

```
VITE_SUPABASE_URL          [Production, Preview]
VITE_SUPABASE_ANON_KEY     [Production, Preview]
VITE_SUPABASE_EDGE_URL     [Production, Preview]
GEMINI_API_KEY             [Production, Preview] (si la agregaste)
```

## 🔍 ¿Por qué solo UNA variable para Edge Functions?

El código ya está diseñado para usar **una sola URL base** y construir las URLs completas automáticamente:

```typescript
// En services/db.ts

// Para save-attendance
const response = await fetch(`${edgeUrl}/save-attendance`, ...)
// Se convierte en: https://tu-project.supabase.co/functions/v1/save-attendance

// Para save-students  
const response = await fetch(`${edgeUrl}/save-students`, ...)
// Se convierte en: https://tu-project.supabase.co/functions/v1/save-students
```

Por eso solo necesitas:
- `VITE_SUPABASE_EDGE_URL = https://tu-project.supabase.co/functions/v1`

Y el código automáticamente agrega `/save-attendance` o `/save-students` al final.

## ❌ Errores Comunes

### Error: "Variable already exists"

**Problema**: Intentaste agregar `VITE_SUPABASE_EDGE_URL` dos veces.

**Solución**: 
- Solo necesitas **UNA** variable `VITE_SUPABASE_EDGE_URL`
- Si ya existe, edítala en lugar de crear una nueva
- Elimina cualquier duplicado

### Error: "VITE_SUPABASE_EDGE_URL not configured"

**Problema**: La variable no está configurada o tiene un valor incorrecto.

**Solución**:
1. Verifica que la variable exista en Vercel
2. Verifica que el valor sea: `https://tu-project-ref.supabase.co/functions/v1`
3. Asegúrate de que termine en `/functions/v1` (sin `/save-attendance` o `/save-students`)
4. Después de agregar/editar variables, **redespliega** tu aplicación

### Error: "CORS error" o "404 Not Found"

**Problema**: La URL de Edge Functions está mal configurada.

**Solución**:
1. Verifica que `VITE_SUPABASE_EDGE_URL` sea exactamente: `https://tu-project-ref.supabase.co/functions/v1`
2. Verifica que las Edge Functions estén desplegadas:
   ```bash
   supabase functions list
   ```
3. Prueba la URL manualmente:
   ```bash
   curl https://tu-project-ref.supabase.co/functions/v1/save-attendance
   ```

## 🔄 Después de Configurar Variables

1. **Redesplegar**: Después de agregar/editar variables, Vercel puede requerir un nuevo deployment
2. **Verificar**: Abre tu app desplegada y prueba crear un estudiante o tomar asistencia
3. **Revisar logs**: Si hay errores, revisa los logs en Vercel Dashboard → Deployments → [tu deployment] → Functions

## 📸 Ejemplo Visual

En Vercel, deberías ver algo así:

```
Environment Variables

┌─────────────────────────────┬──────────────────────────────────────────────┐
│ Name                        │ Value                                        │
├─────────────────────────────┼──────────────────────────────────────────────┤
│ VITE_SUPABASE_URL           │ https://abc123.supabase.co                  │
│ VITE_SUPABASE_ANON_KEY      │ eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...     │
│ VITE_SUPABASE_EDGE_URL      │ https://abc123.supabase.co/functions/v1    │
│ GEMINI_API_KEY              │ AIzaSy...                                    │
└─────────────────────────────┴──────────────────────────────────────────────┘
```

## ✅ Checklist Final

- [ ] `VITE_SUPABASE_URL` configurada
- [ ] `VITE_SUPABASE_ANON_KEY` configurada
- [ ] `VITE_SUPABASE_EDGE_URL` configurada (solo UNA vez, con la URL base)
- [ ] `GEMINI_API_KEY` configurada (si es necesaria)
- [ ] Todas las variables están en **Production** environment
- [ ] Aplicación redesplegada después de agregar variables
- [ ] Edge Functions desplegadas en Supabase


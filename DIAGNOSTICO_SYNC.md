# Diagnóstico de Sincronización con Supabase

Si los datos no se están guardando en Supabase, sigue estos pasos para diagnosticar el problema.

## 🔍 Paso 1: Verificar Variables de Entorno

### En el Navegador (Consola del Desarrollador)

1. Abre la consola del navegador (F12)
2. Ejecuta estos comandos:

```javascript
// Verificar variables de entorno
console.log("VITE_SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL);
console.log("VITE_SUPABASE_ANON_KEY:", import.meta.env.VITE_SUPABASE_ANON_KEY ? "✅ Configurada" : "❌ No configurada");
console.log("VITE_SUPABASE_EDGE_URL:", import.meta.env.VITE_SUPABASE_EDGE_URL);
```

**Si alguna variable es `undefined`**, el problema está en la configuración de Vercel.

### En Vercel

1. Ve a tu proyecto en Vercel Dashboard
2. Settings → Environment Variables
3. Verifica que existan:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_EDGE_URL`

**Formato correcto de `VITE_SUPABASE_EDGE_URL`:**
```
https://tu-project-ref.supabase.co/functions/v1
```

## 🔍 Paso 2: Verificar Logs en la Consola

Cuando creas/actualizas datos, deberías ver mensajes como:

```
📤 Syncing students to: https://.../save-students Students: 1
✅ Students synced successfully: {success: true, count: 1}
```

**Si ves errores**, copia el mensaje completo y revisa:

- ❌ `VITE_SUPABASE_EDGE_URL not configured` → Variable no configurada
- ❌ `HTTP 404` → Edge Function no desplegada o URL incorrecta
- ❌ `HTTP 500` → Error en la Edge Function (revisa logs en Supabase)
- ❌ `CORS error` → Problema de CORS (poco común con Edge Functions)

## 🔍 Paso 3: Verificar Edge Functions Desplegadas

### En Supabase Dashboard

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Ve a **Edge Functions** en el menú lateral
3. Verifica que estas funciones estén listadas:
   - ✅ `save-attendance`
   - ✅ `save-students`
   - ✅ `save-fichas`
   - ✅ `save-sessions`

**Si falta alguna**, despliégala:

```bash
supabase functions deploy save-attendance
supabase functions deploy save-students
supabase functions deploy save-fichas
supabase functions deploy save-sessions
```

### Desde la Terminal

```bash
supabase functions list
```

Deberías ver todas las funciones listadas.

## 🔍 Paso 4: Probar Edge Functions Manualmente

### Probar save-students

```bash
curl -X POST https://tu-project-ref.supabase.co/functions/v1/save-students \
  -H "Content-Type: application/json" \
  -d '{
    "students": [{
      "id": "test-123",
      "document_number": "12345678",
      "first_name": "Test",
      "last_name": "User",
      "email": "test@example.com",
      "active": true,
      "group": "TEST-001"
    }]
  }'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Successfully saved 1 student(s)",
  "count": 1
}
```

**Si obtienes error**, revisa los logs de la función en Supabase Dashboard.

## 🔍 Paso 5: Revisar Logs de Edge Functions

### En Supabase Dashboard

1. Ve a **Edge Functions**
2. Haz clic en una función (ej: `save-students`)
3. Ve a la pestaña **Logs**
4. Busca errores recientes

**Errores comunes:**

- `Missing Supabase configuration` → Variables de entorno no configuradas en Supabase
- `relation "students" does not exist` → Tabla no existe (ejecuta el script de instalación)
- `permission denied` → Problemas de permisos en la tabla

## 🔍 Paso 6: Verificar Tablas en Supabase

### En Supabase Dashboard

1. Ve a **Table Editor**
2. Verifica que existan estas tablas:
   - ✅ `students`
   - ✅ `fichas`
   - ✅ `sessions`
   - ✅ `attendance`

**Si falta alguna tabla**, ejecuta el script de instalación desde la app:
- Settings → Script de Instalación

## 🔍 Paso 7: Verificar Permisos de Tablas

### En Supabase Dashboard

1. Ve a **Table Editor**
2. Selecciona una tabla (ej: `students`)
3. Ve a **Policies** (RLS Policies)
4. Verifica que haya políticas que permitan:
   - **SELECT** para `anon` role (lectura)
   - Las Edge Functions usan `service_role`, así que no necesitan políticas RLS

**Nota**: Las Edge Functions usan `service_role` key que bypassa RLS, así que los permisos de tabla no deberían ser un problema.

## 🔍 Paso 8: Probar desde la Aplicación

1. Abre la consola del navegador (F12)
2. Crea un estudiante, ficha o sesión
3. Observa los mensajes en la consola:
   - ✅ Deberías ver `📤 Syncing...`
   - ✅ Deberías ver `✅ ... synced successfully`
   - ❌ Si ves errores, copia el mensaje completo

## 🛠️ Soluciones Comunes

### Problema: Variables de entorno no configuradas

**Solución:**
1. Ve a Vercel Dashboard → Settings → Environment Variables
2. Agrega las variables faltantes
3. **Redespliega** la aplicación

### Problema: Edge Functions no desplegadas

**Solución:**
```bash
supabase functions deploy save-attendance
supabase functions deploy save-students
supabase functions deploy save-fichas
supabase functions deploy save-sessions
```

### Problema: URL de Edge Functions incorrecta

**Solución:**
- Verifica que `VITE_SUPABASE_EDGE_URL` sea exactamente:
  ```
  https://tu-project-ref.supabase.co/functions/v1
  ```
- **NO** debe incluir el nombre de la función al final
- **NO** debe terminar con `/`

### Problema: Tablas no existen

**Solución:**
1. Ve a la app desplegada
2. Settings → Script de Instalación
3. Copia y ejecuta el SQL en Supabase Dashboard → SQL Editor

### Problema: Errores 500 en Edge Functions

**Solución:**
1. Revisa los logs de la función en Supabase Dashboard
2. Verifica que las variables de entorno de Supabase estén configuradas:
   - `SUPABASE_URL` (automático)
   - `SUPABASE_SERVICE_ROLE_KEY` (automático)
3. Verifica que la estructura de datos coincida con la tabla

## 📞 Obtener Ayuda

Si después de seguir estos pasos el problema persiste:

1. **Copia los mensajes de error completos** de la consola del navegador
2. **Copia los logs** de las Edge Functions en Supabase
3. **Verifica** que todas las variables de entorno estén configuradas
4. **Comparte** esta información para diagnóstico

## ✅ Checklist Final

- [ ] Variables de entorno configuradas en Vercel
- [ ] Edge Functions desplegadas en Supabase
- [ ] Tablas existen en Supabase
- [ ] Logs de consola muestran intentos de sincronización
- [ ] No hay errores en la consola del navegador
- [ ] No hay errores en los logs de Edge Functions


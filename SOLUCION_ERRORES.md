# Solución de Errores Comunes

## Error: "Entrypoint path does not exist"

### Problema
```
WARN: failed to read file: open supabase\functions\save-attendance\index.ts: The system cannot find the path specified.
unexpected deploy status 400: {"message":"Entrypoint path does not exist..."}
```

### Soluciones

#### 1. Verificar que estás en el directorio correcto

Ejecuta los comandos desde el **directorio raíz** del proyecto (donde está `package.json`):

```bash
# Verifica que estás en el lugar correcto
pwd  # Linux/Mac
cd   # Windows PowerShell - muestra el directorio actual

# Deberías ver algo como:
# C:\Projects\asistencia-pro
# o
# /home/usuario/asistencia-pro
```

#### 2. Verificar que los archivos existen

```bash
# Windows
dir supabase\functions\save-attendance\index.ts
dir supabase\functions\save-students\index.ts

# Linux/Mac
ls supabase/functions/save-attendance/index.ts
ls supabase/functions/save-students/index.ts
```

Si los archivos no existen, créalos siguiendo la estructura:
```
supabase/
  functions/
    save-attendance/
      index.ts
    save-students/
      index.ts
```

#### 3. Inicializar Supabase (si falta config.toml)

```bash
supabase init
```

Esto creará el archivo `supabase/config.toml` necesario.

#### 4. Verificar la estructura de directorios

La estructura correcta debe ser:
```
asistencia-pro/
  ├── package.json
  ├── supabase/
  │   ├── config.toml          ← Debe existir
  │   └── functions/
  │       ├── save-attendance/
  │       │   └── index.ts
  │       └── save-students/
  │           └── index.ts
  └── ...
```

#### 5. Usar rutas absolutas (alternativa)

Si el problema persiste, intenta especificar la ruta completa:

```bash
# Windows
supabase functions deploy save-attendance --project-ref tu-project-ref

# O desde el directorio supabase
cd supabase
supabase functions deploy save-attendance --project-ref tu-project-ref
```

## Error: "Docker is not running"

### Problema
```
WARNING: Docker is not running
```

### Solución

Este es solo un **warning**, no un error. Docker solo es necesario para:
- Desarrollo local con `supabase start`
- Testing local de funciones

Para **desplegar funciones en producción**, Docker NO es necesario. Puedes ignorar este warning.

Si quieres eliminar el warning:
1. Instala Docker Desktop: https://www.docker.com/products/docker-desktop
2. Inicia Docker Desktop
3. Vuelve a ejecutar el comando

## Error: "Project not linked"

### Problema
```
Error: Project not linked. Run `supabase link --project-ref <project-id>` first.
```

### Solución

```bash
# 1. Obtén tu Project Reference ID desde Supabase Dashboard
# Settings → General → Reference ID

# 2. Vincula el proyecto
supabase link --project-ref tu-project-ref-id

# 3. Cuando pida la contraseña, usa la database password de tu proyecto
```

## Error: "Authentication failed"

### Problema
```
Error: Authentication failed. Please run `supabase login` again.
```

### Solución

```bash
# 1. Cierra sesión
supabase logout

# 2. Inicia sesión nuevamente
supabase login

# Esto abrirá tu navegador para autenticarte
```

## Error: "Function already exists"

### Problema
```
Error: Function save-attendance already exists
```

### Solución

Esto significa que la función ya está desplegada. Para actualizarla:

```bash
# Simplemente vuelve a desplegar (sobrescribe la anterior)
supabase functions deploy save-attendance
```

O si quieres eliminarla primero:

```bash
# Eliminar función
supabase functions delete save-attendance

# Desplegar nuevamente
supabase functions deploy save-attendance
```

## Error: "CORS error" en el navegador

### Problema
Después de desplegar, el frontend no puede llamar a las Edge Functions por CORS.

### Solución

Las Edge Functions ya tienen CORS configurado. Verifica:

1. **URL correcta**: Asegúrate de que `VITE_SUPABASE_EDGE_URL` sea:
   ```
   https://tu-project-ref.supabase.co/functions/v1
   ```

2. **Función desplegada**: Verifica que la función esté desplegada:
   ```bash
   supabase functions list
   ```

3. **Headers correctos**: Las funciones ya incluyen los headers CORS necesarios.

## Error: "Failed to sync to cloud"

### Problema
El frontend muestra error al intentar sincronizar datos.

### Solución

1. **Verifica las variables de entorno**:
   - `VITE_SUPABASE_EDGE_URL` debe estar configurada
   - Debe ser: `https://tu-project-ref.supabase.co/functions/v1`

2. **Verifica que las funciones estén desplegadas**:
   ```bash
   supabase functions list
   ```

3. **Prueba la función manualmente**:
   ```bash
   curl -X POST https://tu-project-ref.supabase.co/functions/v1/save-attendance \
     -H "Content-Type: application/json" \
     -d '{"records":[]}'
   ```

4. **Revisa los logs de la función**:
   - Ve a Supabase Dashboard
   - Edge Functions → save-attendance → Logs

## Comandos de Diagnóstico

### Verificar configuración
```bash
# Ver configuración actual
supabase status

# Ver funciones desplegadas
supabase functions list

# Ver información del proyecto vinculado
supabase projects list
```

### Verificar archivos
```bash
# Windows
dir /s supabase\functions

# Linux/Mac
find supabase/functions -type f
```

### Logs detallados
```bash
# Ejecutar con debug para más información
supabase functions deploy save-attendance --debug
```

## Contacto y Recursos

- [Documentación de Supabase CLI](https://supabase.com/docs/reference/cli)
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Foro de Supabase](https://github.com/supabase/supabase/discussions)


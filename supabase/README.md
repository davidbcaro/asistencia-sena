# Supabase Edge Functions

Este directorio contiene las Edge Functions de Supabase para operaciones de escritura seguras.

## Funciones Disponibles

### 1. `save-attendance`
Guarda/actualiza registros de asistencia en la base de datos.

**Endpoint:** `{VITE_SUPABASE_EDGE_URL}/save-attendance`

**Método:** POST

**Body:**
```json
{
  "records": [
    {
      "date": "2024-01-15",
      "student_id": "student-id-123",
      "present": true
    }
  ]
}
```

### 2. `save-students`
Guarda/actualiza estudiantes en la base de datos.

**Endpoint:** `{VITE_SUPABASE_EDGE_URL}/save-students`

**Método:** POST

**Body:**
```json
{
  "students": [
    {
      "id": "student-id-123",
      "document_number": "12345678",
      "first_name": "Juan",
      "last_name": "Pérez",
      "email": "juan@example.com",
      "active": true,
      "group": "FICHA-001"
    }
  ]
}
```

## Despliegue

Para desplegar estas funciones en Supabase:

1. Instala la CLI de Supabase:
   ```bash
   npm install -g supabase
   ```

2. Inicia sesión en Supabase:
   ```bash
   supabase login
   ```

3. Vincula tu proyecto:
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. Despliega las funciones:
   ```bash
   supabase functions deploy save-attendance
   supabase functions deploy save-students
   ```

## Variables de Entorno

Las Edge Functions requieren las siguientes variables de entorno (configuradas automáticamente por Supabase):

- `SUPABASE_URL`: URL de tu proyecto Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (solo disponible en el servidor)

## Seguridad

- Las Edge Functions usan `service_role` key, que **NUNCA** debe exponerse en el frontend
- El frontend solo debe usar la `anon` key para operaciones de lectura
- Todas las operaciones de escritura pasan por estas Edge Functions


# 0 · Primer acceso y administración de usuarios

Este capítulo se lee **antes de cualquier tutorial de Network, Site, Room o Rack**. La persona que jamás ha utilizado Site Mapper empieza por `/login`, no por el Workspace ya autenticado.

> **Regla:** Site Mapper no ofrece registro público desde Login. Para trabajar necesitas una cuenta entregada por un administrador autorizado. No escribas credenciales en capturas, tickets o material de entrenamiento.

## Si eres un usuario nuevo (STANDARD o ADMIN)

1. Confirma con el administrador que tienes una cuenta activa y recibiste tu **correo y contraseña temporal** por un canal privado.
2. Abre la URL de Site Mapper que te comunicaron. En el laboratorio local, si el servidor corre en esa máquina, la ruta es `http://localhost:3000/login`. En un despliegue real se usa la URL oficial de tu organización.
3. En la pantalla **Sign in**, escribe tu correo en **Email** y la contraseña recibida en **Password**.
4. Pulsa **SIGN IN**.
5. Si la cuenta fue creada con contraseña temporal, la aplicación abre automáticamente **Change password**. Introduce **Current password** y **New password** (al menos 12 caracteres), luego pulsa **Change password**.
6. El sistema te devuelve a Login porque el cambio revoca tus sesiones previas. Ingresa nuevamente con la contraseña nueva.
7. Verifica que entraste a **Workspace** o al contexto de trabajo previamente autorizado.

**Resultado esperado:** sesión autenticada y pantalla de trabajo visible; la contraseña temporal ya no debe utilizarse.

**NO HACER:** no probar contraseñas al azar repetidamente, no registrar la contraseña en el manual, no solicitar que se cambie directamente en MongoDB. Si no tienes credenciales o Login rechaza la cuenta, consulta al responsable de altas: la interfaz revisada no contiene un flujo público de recuperación por correo.

### Guía visual obligatoria de este capítulo

| ID | Imagen real requerida | Qué debe señalar la anotación |
| --- | --- | --- |
| UI-01 | **Sign in** (`/login`) | Email, Password, SIGN IN, error de acceso |
| USR-07 | Primer login de cuenta recién creada | Inicio con contraseña temporal **sin mostrarla** |
| USR-08 | **Change password** (`/change-password`) | Current password, New password, Change password |
| USR-09 | Login nuevamente y Workspace | Acceso final con la nueva contraseña |

**Estado de capturas:** PENDIENTE de sesión autorizada. No sustituir por imágenes inventadas.

## Si eres SUPERADMIN: crear un usuario

Solo las cuentas con rol **SUPERADMIN** tienen `users:manage` en el código actual de MK1. Un usuario ADMIN **no** ve ni gestiona la pestaña Users.

1. Inicia sesión como SUPERADMIN.
2. Abre el acceso **ADMIN**, en la barra superior, que lleva a **Settings**.
3. En el menú izquierdo, pulsa **Users** (o abre `/settings?tab=users`).
4. En la cabecera **USERS**, despliega **＋ ADD USER**.
5. Completa el formulario:
   - **Name:** nombre que se mostrará en la lista.
   - **Email:** correo único del usuario.
   - **Role:** selecciona `Standard`, `Admin` o `Superadmin` según la autorización previa.
   - **Temporary password:** contraseña inicial de **12 o más caracteres**, que el usuario tendrá que reemplazar.
6. Pulsa **Create user** y confirma que aparece una nueva fila en la lista, con rol y estado correctos.
7. Proporciona de forma segura las credenciales iniciales al destinatario y pídele realizar los pasos de “usuario nuevo” anteriores.

**Resultado esperado:** usuario creado, estado ACTIVE, rol correcto y cambio obligatorio de contraseña al ingresar por primera vez.

**NO HACER:** no dar SUPERADMIN para “que le aparezca todo”, no reutilizar claves, no enseñar contraseñas en pantallas capturadas, no crear cuentas reales para experimentar.

### Capturas obligatorias para el administrador

| ID | Imagen real requerida | Qué debe verse |
| --- | --- | --- |
| USR-01 | Barra superior: acceso ADMIN | Entrada a Settings |
| USR-02 | Settings → Users | Pestaña visible **solo** con SUPERADMIN |
| USR-03 | USERS / **＋ ADD USER** | Acción de alta destacada |
| USR-04 | Formulario de alta | Name, Email, Role, Temporary password oculto, Create user |
| USR-05 | Lista tras crear cuenta | Cuenta visible, rol y estado ACTIVE |
| USR-06 | Gestión de rol y estado | Selector de rol y acción de archivo/restauración; sin ejecutarla sobre usuario real |

**Estado de capturas:** PENDIENTE; solo producir con usuarios ficticios y datos autorizados.

## Cambiar el rol, archivar o reactivar

En Settings → Users, un SUPERADMIN puede seleccionar un rol y cambiar el estado de un usuario entre `ACTIVE` y `ARCHIVED`. Un usuario archivado pierde acceso; los cambios de rol/archivo revocan sesiones. La UI protege al operador de editar su propio rol/estado desde el panel; el backend además bloquea archivar o degradar al **último SUPERADMIN activo**.

No uses la opción de tres puntos (•••) sin identificar primero a quién pertenece la fila: esa acción alterna el estado, no abre un menú de ayuda. El manual final debe mostrar **ambos estados** y el efecto de la operación en un entorno de entrenamiento.

## Qué puede hacer cada rol

| Operación | STANDARD | ADMIN | SUPERADMIN |
| --- | :---: | :---: | :---: |
| Iniciar sesión, consultar topología, energía y telemetría | Sí | Sí | Sí |
| Crear/modificar topología o PowerPaths | No | Sí | Sí |
| Confirmar commissioning de Panel (requiere `topology:write`) | No | Sí | Sí |
| Entrar a Settings → Users, crear y administrar cuentas | No | **No** | Sí |
| Cambiar su propia contraseña | Sí | Sí | Sí |

Una advertencia del rol es **funcional**, no un error de la aplicación. Si no ves Users, **no solicites editar la base de datos**: el SUPERADMIN debe asignar la cuenta correcta.

## Instalación inicial: primera cuenta SUPERADMIN

En una instalación vacía, el primer SUPERADMIN se aprovisiona mediante un endpoint de **bootstrap protegido con token**. No es un botón del Login ni un procedimiento destinado a operadores. Esa tarea la realiza el equipo responsable del despliegue siguiendo [Autenticación](../security/authentication.md) y [Quickstart](../operations/quickstart.md). El bootstrap se cierra cuando existe al menos un usuario.

## Verificación de la capacitación

El ejercicio de primer acceso solo se aprueba cuando una persona sin experiencia puede **ingresar, cambiar su contraseña temporal, volver a iniciar sesión, reconocer su Workspace y explicar por qué no ve Users** (si no es SUPERADMIN). El instructor realizará el ejercicio de alta por separado con una cuenta SUPERADMIN de entrenamiento.

[Siguiente: conceptos y permisos](conceptos.md) · [Índice del manual](README.md).

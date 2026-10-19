# RBAC Matrix

| Permission     | Standard | Admin | Superadmin |
| -------------- | -------- | ----- | ---------- |
| topology:read  | yes      | yes   | yes        |
| topology:write | no       | yes   | yes        |
| power:read     | yes      | yes   | yes        |
| power:write    | no       | yes   | yes        |
| telemetry:read | yes      | yes   | yes        |
| settings:read  | no       | yes   | yes        |
| settings:write | no       | yes   | yes        |
| users:manage   | no       | no    | yes        |
| system:danger  | no       | no    | yes        |

**Comportamiento implementado actual:** solo `SUPERADMIN` tiene `users:manage` y puede acceder a Settings → Users. La función interna `canManageRole` contempla una restricción teórica para `ADMIN`, pero sin ese permiso no puede gestionar usuarios por la UI ni por la API. No documentar alta de cuentas como disponible para ADMIN.

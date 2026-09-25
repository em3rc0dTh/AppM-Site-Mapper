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

User-management policy: `users:manage` is Superadmin-only. Admin does not create, list, archive or
change Standard users through the current MK1 API. Any future delegated-admin workflow requires a
separate explicit permission/contract rather than overloading `users:manage`.

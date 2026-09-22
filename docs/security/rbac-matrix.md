# RBAC Matrix

| Permission | Standard | Admin | Superadmin |
| --- | --- | --- | --- |
| topology:read | yes | yes | yes |
| topology:write | no | yes | yes |
| power:read | yes | yes | yes |
| power:write | no | yes | yes |
| telemetry:read | yes | yes | yes |
| settings:read | no | yes | yes |
| settings:write | no | yes | yes |
| users:manage | no | no | yes |
| system:danger | no | no | yes |

Additional policy: Admin may manage Standard users through constrained user-management use cases, but may not grant Admin or Superadmin authority.

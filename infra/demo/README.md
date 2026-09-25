# One-command synthetic telemetry demo

From the repository root:

```bash
npm run demo:telemetry
```

That single command:

1. installs Node dependencies if they are missing;
2. starts isolated MongoDB and Mosquitto demo containers;
3. resets only the `appm_site_mapper_demo` database;
4. creates a synthetic canonical topology ending in one QDF/BDFB Equipment;
5. registers a `simulated: true` TelemetrySource;
6. starts Site Mapper;
7. bootstraps a random local demo SUPERADMIN and prints its credentials;
8. starts the synthetic hardware publisher;
9. opens the login page;
10. shuts down the app, publisher and demo containers on Ctrl+C.

The broker binds only to `127.0.0.1:1883`. Its anonymous/plaintext configuration exists solely for
this local synthetic demo and is intentionally separate from the secured production/reference
Mosquitto policy under `infra/mosquitto/`.

Optional overrides:

```bash
DEMO_PORT=3100 npm run demo:telemetry
SIM_INTERVAL_MS=1000 npm run demo:telemetry
DEMO_NO_BROWSER=true npm run demo:telemetry
```

On PowerShell:

```powershell
$env:DEMO_PORT="3100"; npm run demo:telemetry
```

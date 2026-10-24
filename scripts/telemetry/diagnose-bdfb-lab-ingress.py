#!/usr/bin/env python3
"""Read-only LAB BFDB ingress diagnosis on the PRESERVED Site Mapper stack.

Inspects Docker container startup profiles (names/counts only), mongo
industrial_events through its indexed sourceIdentity, catalog summary,
and exact MQTT bindings. No configuration edits or service restarts.
"""
import json
import subprocess
import sys

MONGO = "appm-site-mapper-mongodb-1"
APP = "appm-site-mapper-site-mapper-1"
DB = "site_mapper_crud_acceptance_02"
SOURCES = ["LAB-BDFB-02", "LAB-BDFB-03", "EMU-BFDB-02", "EMU-BFDB-03"]


def docker_exec(container, executable, *args):
    result = subprocess.run(
        ["docker", "exec", container, executable, *args],
        text=True, capture_output=True, timeout=30,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(
            f"{container} status={result.returncode}: "
            + (result.stderr.strip() or result.stdout.strip())[:320]
        )
    text = result.stdout.strip()
    return json.loads(text.splitlines()[-1])


def mongo_diagnostics():
    js = """
const d = db.getSiblingDB(%s);
const sources = %s;
const details = sources.map(sourceIdentity => {
  const filter = {protocol:"MQTT",sourceIdentity};
  const event = d.industrial_events.find(filter, {
    _id:0,eventId:1,receivedAt:1
  }).sort({receivedAt:-1}).limit(1).toArray()[0] || null;
  const sample = d.industrial_signals.find(filter, {
    _id:0,"signal.key":1,"signal.quality":1,
    "signal.kind":1,"signal.value":1,
    "signal.targetId":1
  }).limit(1).toArray()[0] || null;
  return {
    sourceIdentity,
    activeBindings:d.telemetry_bindings.countDocuments({
      protocol:"MQTT",sourceIdentity,lifecycle:"ACTIVE"
    }),
    persistedEvents:d.industrial_events.countDocuments(filter),
    catalogSignals:d.industrial_signals.countDocuments(filter),
    latestEvent:event,
    sampleSignal:sample?.signal || null,
  };
});
print(JSON.stringify(details));
""" % (json.dumps(DB), json.dumps(SOURCES))
    return docker_exec(MONGO, "mongosh", "--quiet", "--eval", js)


def runtime_diagnostics():
    js = """
const keys=["LAB-BDFB-02","LAB-BDFB-03","EMU-BFDB-02","EMU-BFDB-03"];
let profiles=[], parseError=null;
const profileFile=process.env.INDUSTRIAL_PROFILES_FILE||null;
try {
  const raw=profileFile
    ? require("node:fs").readFileSync(profileFile,"utf8")
    : process.env.INDUSTRIAL_PROFILES_JSON||"[]";
  profiles=JSON.parse(raw);
}
catch(e) {parseError=String(e);}
const allowed=Array.isArray(profiles)?profiles.filter(p=>p?.protocol==="MQTT"):[];
console.log(JSON.stringify({
  telemetryEnabled:process.env.TELEMETRY_ENABLED==="true",
  topicFilter:process.env.MQTT_TOPIC_FILTER||null,
  industrialMqttProfiles:allowed.length,
  profileDelivery:profileFile?"mounted-file":"environment-json",
  industrialProfileParseError:parseError,
  sources:keys.map(serial=>({
    serial,profileLoaded:allowed.some(p=>p.sourceIdentity===serial),
    rules:allowed.find(p=>p.sourceIdentity===serial)?.rules?.length??null,
  })),
}));
"""
    return docker_exec(APP, "node", "-e", js)


def project_labels():
    result = subprocess.run(
        ["docker", "inspect", APP, "--format", "{{json .Config.Labels}}"],
        text=True, capture_output=True, timeout=15, check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip()[:200] or "docker inspect failed")
    labels = json.loads(result.stdout.strip())
    return {
        "composeProject": labels.get("com.docker.compose.project"),
        "composeFiles": labels.get("com.docker.compose.project.config_files"),
        "workingDirectory": labels.get("com.docker.compose.project.working_dir"),
    }


def main():
    print("=== SITE MAPPER · LAB MQTT INGEST · READ ONLY ===", flush=True)
    try:
        print("COMPOSE:", json.dumps(project_labels(), indent=2))
    except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        print("COMPOSE INSPECTION UNAVAILABLE:", str(error), flush=True)
    try:
        print("RUNTIME:", json.dumps(runtime_diagnostics(), ensure_ascii=False, indent=2))
    except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        print("APP INSPECTION UNAVAILABLE:", str(error), flush=True)
    try:
        print("MONGODB:", json.dumps(mongo_diagnostics(), ensure_ascii=False, indent=2))
    except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        print("MONGODB INSPECTION UNAVAILABLE:", str(error), flush=True)
        return 1
    print("NO WRITES. A broker PUBLISHED line is not a persisted capture proof.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

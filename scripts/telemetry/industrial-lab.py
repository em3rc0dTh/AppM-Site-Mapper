#!/usr/bin/env python3
"""Prepare/run the joint lab from two checkouts. Never starts BFDB's gateway or database."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import secrets
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf8')
    path.chmod(0o600)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bfdb-dir', type=Path, required=True)
    parser.add_argument('--subnet', default='172.30.54.0/24')
    parser.add_argument('--action', choices=['prepare', 'up', 'stop', 'status', 'logs'], default='prepare')
    args = parser.parse_args()
    bfdb = args.bfdb_dir.resolve()
    for filename in ['Dockerfile', 'apps/snmp-emulator/eltek-lab-service.mjs', 'config/eltek-sequence.example.json']:
        if not (bfdb / filename).is_file():
            parser.error('BFDB checkout must include this branch: missing ' + filename)
    subnet = ipaddress.ip_network(args.subnet)
    if subnet.version != 4 or subnet.prefixlen != 24 or not subnet.is_private:
        parser.error('--subnet requires a private IPv4 /24 dedicated to this lab')
    lab = ROOT / '.runtime' / 'industrial-lab'
    lab.mkdir(parents=True, exist_ok=True, mode=0o700)
    lab.chmod(0o700)
    credentials = lab / 'secrets.json'
    if credentials.exists():
        secret = json.loads(credentials.read_text())
    else:
        secret = {key: secrets.token_hex(24) for key in ['db', 'bootstrap', 'store', 'bridge', 'projection']}
        secret['snmp'] = [{key: secrets.token_hex(20) for key in ['token', 'auth', 'priv']} for _ in range(3)]
        save(credentials, secret)
    credentials.chmod(0o600)
    config = ROOT / 'config' / 'industrial'
    for src, dst in [('modbus-points.example.json', 'points.json'), ('logical-points.example.json', 'logical.json')]:
        # Operator edits, FIELD substitutions and address pins survive repeat launcher invocations.
        target = lab / dst
        if not target.exists():
            save(target, json.loads((config / src).read_text()))
    profiles_path = lab / 'profiles.json'
    if not profiles_path.exists():
        save(profiles_path, json.loads((config / 'profiles.example.json').read_text()))
    broker = lab / 'mosquitto.conf'
    broker.write_text('listener 1883\nallow_anonymous true\npersistence false\n')
    profiles = json.loads(profiles_path.read_text())
    sources = []
    services = {
        'site-mapper': {'environment': {'INDUSTRIAL_LOGICAL_POINTS_FILE': '/config/logical.json',
                                      'MQTT_EXPECTED_SOURCES': 'EMU-BFDB-01,EMU-BFDB-02,EMU-BFDB-03'},
                        'volumes': [str(lab / 'logical.json') + ':/config/logical.json:ro']},
        'lab-mosquitto': {'image': 'eclipse-mosquitto:2.0',
                         'volumes': [str(broker) + ':/mosquitto/config/mosquitto.conf:ro'],
                         'restart': 'unless-stopped'},
        'lab-mqtt': {'build': {'context': str(bfdb)},
                     'command': ['python', 'apps/field-emulator/main.py'],
                     'environment': {'MQTT_HOST': 'lab-mosquitto', 'MQTT_PORT': '1883'},
                     'depends_on': ['lab-mosquitto'], 'restart': 'unless-stopped'},
    }
    for i in range(1, 4):
        identity = f'EMU-SNMP-QDF-{i:02}'
        address = str(subnet.network_address + 19 + i)
        s = secret['snmp'][i - 1]
        user = dict(name=f'synthetic-{i}', level='authPriv', authProtocol='sha', authKey=s['auth'], privProtocol='aes', privKey=s['priv'])
        sources.append(dict(sourceIdentity=identity, address=address, version='3', token=s['token'], user=user,
                            poll=dict(method='get', port=1161, intervalMs=10000,
                                      oids=['1.3.6.1.4.1.12148.10.10.5.5.0', '1.3.6.1.4.1.12148.10.9.2.5.0',
                                            '1.3.6.1.4.1.12148.10.10.7.5.0', '1.3.6.1.4.1.12148.10.2.1.0'])))
        services[f'lab-snmp-{i:02}'] = dict(build=dict(context=str(bfdb), dockerfile='apps/snmp-emulator/Dockerfile'),
           command=['node', 'eltek-lab-service.mjs'], restart='unless-stopped',
           networks={'default': {'ipv4_address': address}}, depends_on=['snmp-traps'],
           volumes=[str(bfdb / 'config/eltek-sequence.example.json') + ':/config/sequence.json:ro'],
           environment=dict(SNMP_VERSION='3', SNMP_V3_USERNAME=user['name'], SNMP_V3_AUTH_KEY=s['auth'],
                            SNMP_V3_PRIV_KEY=s['priv'], SNMP_TRAP_TARGET_HOST='snmp-traps', SNMP_TRAP_TARGET_PORT='1162',
                            SNMP_TRAP_INFORM='true', SNMP_SEQUENCE_FILE='/config/sequence.json', SNMP_AGENT_PORT='1161'))
    services['snmp-traps'] = {'environment': {'SNMP_TRAP_SOURCES_JSON': json.dumps(sources, separators=(',', ':'))}}
    save(lab / 'compose.json', dict(services=services, networks={'default': {'internal': True, 'ipam': {'config': [{'subnet': str(subnet)}]}}}))
    env = dict(APP_ENV='development', TIMESCALE_DB_PASSWORD=secret['db'], BOOTSTRAP_ADMIN_TOKEN=secret['bootstrap'],
               TELEMETRY_STORE_TOKEN=secret['store'], MODBUS_BRIDGE_TOKEN=secret['bridge'], INDUSTRIAL_PROJECTION_TOKEN=secret['projection'],
               TELEMETRY_ENABLED='true', TELEMETRY_HISTORY_ENABLED='true', INDUSTRIAL_TIMESCALE_ENABLED='true',
               MQTT_BROKER_URL='mqtt://lab-mosquitto:1883', MQTT_TOPIC_FILTER='data/dev/#', MQTT_TOPIC_PREFIX='data/dev/',
               MODBUS_SOURCE_UNITS_JSON=json.dumps({f'EMU-BFDB-{i:02}': i for i in range(1, 4)}),
               MODBUS_POINTS_LOCAL_PATH=str(lab / 'points.json'), INDUSTRIAL_PROFILES_JSON=json.dumps(profiles, separators=(',', ':')),
               INDUSTRIAL_INGEST_SOURCES_JSON=json.dumps({s['sourceIdentity']: s['token'] for s in sources}),
               SNMP_TRAP_SOURCES_JSON=json.dumps(sources, separators=(',', ':')), SNMP_TRAP_ENGINE_ID='8000b983800001202610230001')
    envfile = lab / 'lab.env'
    envfile.write_text('\n'.join(key + "='" + str(value).replace("'", "\\'") + "'" for key, value in env.items()) + '\n')
    envfile.chmod(0o600)
    print('Prepared private laboratory configuration. Existing approved points/profiles/aliases preserved.')
    if args.action != 'prepare':
        command = ['docker', 'compose', '--project-name', 'site-mapper-industrial-lab', '--project-directory', str(ROOT),
                   '--env-file', str(envfile), '-f', str(ROOT / 'docker-compose.telemetry.yml'),
                   '-f', str(ROOT / 'docker-compose.industrial.yml'), '-f', str(lab / 'compose.json')]
        selected = ['mongodb', 'mongo-init', 'timescaledb', 'telemetry-store', 'site-mapper', 'modbus-tcp',
                    'snmp-traps', 'lab-mosquitto', 'lab-mqtt', 'lab-snmp-01', 'lab-snmp-02', 'lab-snmp-03']
        options = {'up': ['up', '-d', '--build'] + selected, 'stop': ['stop'] + selected,
                   'status': ['ps'], 'logs': ['logs', '--tail', '100'] + selected}
        # Inherited shell variables must not silently override the generated approved lab settings.
        child_env = {key: value for key, value in os.environ.items() if key not in env}
        subprocess.run(command + options[args.action], check=True, env=child_env)


if __name__ == '__main__':
    main()

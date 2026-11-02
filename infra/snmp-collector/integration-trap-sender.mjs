import snmp from 'net-snmp';

const host = process.env.SNMP_TRAP_TARGET || 'snmp-traps';
const port = Number(process.env.SNMP_TRAP_PORT || '1162');
const community = process.env.SNMP_TRAP_COMMUNITY || 'site-mapper-integration-trap';
const intervalMs = Number(process.env.SNMP_TRAP_INTERVAL_MS || '5000');

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SNMP_TRAP_PORT');
if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 60000)
  throw new Error('Invalid SNMP_TRAP_INTERVAL_MS');

const session = snmp.createSession(host, community, {
  trapPort: port,
  port,
  version: snmp.Version2c,
  retries: 1,
  timeout: 1000,
});

let sequence = 1;

function sendTrap() {
  const vars = [
    {
      oid: '1.3.6.1.4.1.8072.9999.2026.49.90.1.0',
      type: snmp.ObjectType.Integer,
      value: sequence,
    },
  ];
  session.trap('1.3.6.1.4.1.12148.10.1.2.1', vars, (error) => {
    if (error) {
      console.error(
        JSON.stringify({
          event: 'snmp.integration_trap.failed',
          reason: error.message,
          sequence,
        }),
      );
      return;
    }
    console.info(JSON.stringify({ event: 'snmp.integration_trap.sent', sequence }));
    sequence += 1;
  });
}

sendTrap();
const timer = setInterval(sendTrap, intervalMs);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(timer);
    session.close();
    process.exit(0);
  });
}

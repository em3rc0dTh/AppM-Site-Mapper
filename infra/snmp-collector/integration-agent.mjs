import snmp from 'net-snmp';

const community = process.env.SNMP_COMMUNITY || 'site-mapper-integration';
const port = Number(process.env.SNMP_AGENT_PORT || '1161');
const source = process.env.SNMP_AGENT_SOURCE || 'INT-SNMP-QDF';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SNMP_AGENT_PORT');

const options = {
  port,
  disableAuthorization: false,
  accessControlModelType: snmp.AccessControlModelType.Simple,
  engineID: '8000B9838001020304',
};

const agent = snmp.createAgent(options, (error, data) => {
  if (error)
    console.error(JSON.stringify({ event: 'snmp.agent.error', source, reason: error.message }));
  else if (data?.pdu)
    console.info(JSON.stringify({ event: 'snmp.agent.request', source, type: data.pdu.type }));
});

agent.getAuthorizer().addCommunity(community);
const mib = agent.getMib();

function scalar(name, oid, type, value) {
  mib.registerProvider({
    name,
    oid,
    type: snmp.MibProviderType.Scalar,
    scalarType: type,
    maxAccess: snmp.MaxAccess['read-only'],
    handler: (mibRequest) => mibRequest.done(),
  });
  mib.setScalarValue(name, value);
}

for (let index = 1; index <= 2; index += 1) {
  scalar(
    `current${index}`,
    `1.3.6.1.4.1.8072.9999.2026.48.1.${index}`,
    snmp.ObjectType.Integer,
    900 + index * 75,
  );
  scalar(
    `voltage${index}`,
    `1.3.6.1.4.1.8072.9999.2026.48.2.${index}`,
    snmp.ObjectType.Integer,
    518 + index,
  );
}

console.info(
  JSON.stringify({
    event: 'snmp.agent.started',
    source,
    port,
    profile: 'ELTEK_BDCBB_CONFIG_2_CONTROLLED',
  }),
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    agent.close();
    process.exit(0);
  });
}

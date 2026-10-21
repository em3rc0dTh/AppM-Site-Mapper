import assert from 'node:assert/strict';
import { test } from 'node:test';
import snmp from 'net-snmp';

const oid = '1.3.6.1.4.1.8072.9999.2026.48.1.1.0';
const user = {
  name: 'isolated-lab-readonly',
  level: snmp.SecurityLevel.authPriv,
  authProtocol: snmp.AuthProtocols.sha,
  authKey: 'strong_lab_auth_key_2026',
  privProtocol: snmp.PrivProtocols.aes,
  privKey: 'strong_lab_priv_key_2026',
};

function get(session, oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (error, values) => {
      if (error) return reject(error);
      if (values?.some(snmp.isVarbindError))
        return reject(new Error('SNMP returned noSuchInstance/noAccess'));
      resolve(values);
    });
  });
}

test('real local UDP SNMPv3 denies wrong authentication, SET, and unregistered OIDs', async () => {
  const port = 26000 + Math.floor(Math.random() * 10000);
  const agent = snmp.createAgent({
    port, address: '127.0.0.1', transport: 'udp4', disableAuthorization: false,
    accessControlModelType: snmp.AccessControlModelType.Simple,
  }, (error) => { if (error) throw error; });
  const authorization = agent.getAuthorizer();
  authorization.addUser(user);
  authorization.getAccessControlModel().setUserAccess(user.name, snmp.AccessLevel.ReadOnly);
  const mib = agent.getMib();
  mib.registerProvider({
    name: 'isolatedFeedCurrent',
    type: snmp.MibProviderType.Scalar,
    oid: oid.slice(0, -2),
    scalarType: snmp.ObjectType.Integer,
    maxAccess: snmp.MaxAccess['read-only'],
  });
  mib.setScalarValue('isolatedFeedCurrent', 2200);

  const allowed = snmp.createV3Session('127.0.0.1', user, {
    port, timeout: 1000, retries: 1,
  });
  const forged = snmp.createV3Session('127.0.0.1', {
    ...user, authKey: 'wrong_lab_auth_key_2026',
  }, { port, timeout: 650, retries: 0 });

  try {
    const valid = await get(allowed, [oid]);
    assert.equal(valid[0]?.value, 2200);
    await assert.rejects(() => get(forged, [oid]));
    await assert.rejects(() => get(allowed, [oid + '.999']));
    await new Promise((resolve) => {
      allowed.set([{ oid, type: snmp.ObjectType.Integer, value: 99999 }],
        () => resolve());
    });
    const after = await get(allowed, [oid]);
    assert.equal(after[0]?.value, 2200, 'SNMP SET must not change current');
  } finally {
    allowed.close();
    forged.close();
    agent.close();
  }
});

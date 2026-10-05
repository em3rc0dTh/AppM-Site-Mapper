import { execFileSync } from 'node:child_process';
const serials = ['EMU-BFDB-01', 'EMU-BFDB-02', 'EMU-BFDB-03'];
const host = process.env.MQTT_TEST_HOST ?? '127.0.0.1';
const port = process.env.MQTT_TEST_PORT ?? '1883';
let msgid = 1000;

for (let panel = 1; panel <= 4; panel++) {
  for (const sn of serials) {
    const reported = Object.fromEntries(
      Array.from({ length: 24 }, (_, index) => [
        `0_${panel}_${index + 1}`,
        {
          state: 'ONLINE',
          U1: '12.23',
          U2: '0.00',
          I1: '2.00',
          I2: '0.00',
          P1: '24.46',
          P2: '0.00',
          EP1: '1.2345',
          EP2: '0.00',
        },
      ]),
    );
    const epoch = Math.floor(Date.now() / 1000);
    execFileSync('mosquitto_pub', [
      '-h',
      host,
      '-p',
      port,
      '-q',
      '1',
      '-t',
      `data/dev/${sn}`,
      '-m',
      JSON.stringify({
        msgid: String(msgid++),
        method: 'update',
        sn,
        timestamp: epoch,
        sendtime: epoch,
        version: 1,
        reported,
      }),
    ]);
    console.log(`BFDB_FIXTURE_TX topic=data/dev/${sn} panel=${panel} points=24`);
  }
}

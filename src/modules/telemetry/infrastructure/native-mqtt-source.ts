import { randomUUID } from 'node:crypto';
import net, { type Socket } from 'node:net';
import tls from 'node:tls';

import {
  encodeConnect,
  encodePingRequest,
  encodePubAck,
  encodeSubscribe,
  extractPackets,
  parsePublish,
} from '@/modules/telemetry/infrastructure/mqtt-protocol';
import { logger } from '@/shared/infrastructure/logger';

export interface NativeMqttOptions {
  readonly brokerUrl: string;
  readonly username?: string;
  readonly password?: string;
  readonly topicFilter: string;
  readonly keepAliveSeconds?: number;
}

export type MqttMessageHandler = (topic: string, payload: Uint8Array) => void | Promise<void>;
export type MqttConnectionState =
  'idle' | 'connecting' | 'subscribing' | 'subscribed' | 'reconnecting' | 'stopped';

export interface MqttSourceDiagnostics {
  readonly state: MqttConnectionState;
  readonly lastSubscribedAt: string | null;
  readonly lastError: string | null;
}

/**
 * Native MQTT 3.1.1 subscriber. A TCP connection or successful CONNACK is
 * not enough: only a confirmed SUBACK is reported as subscribed.
 */
export class NativeMqttSource {
  private socket: Socket | tls.TLSSocket | null = null;
  private receiveBuffer = new Uint8Array();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private packetId = 1;
  private pendingSubscription: number | null = null;
  private started = false;
  private stopping = false;
  private state: MqttConnectionState = 'idle';
  private lastSubscribedAt: string | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly options: NativeMqttOptions,
    private readonly onMessage: MqttMessageHandler,
  ) {}

  diagnostics(): MqttSourceDiagnostics {
    return {
      state: this.state,
      lastSubscribedAt: this.lastSubscribedAt,
      lastError: this.lastError,
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopping = false;
    this.connect();
  }

  stop(): void {
    this.stopping = true;
    this.started = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pendingSubscription = null;
    this.state = 'stopped';
    this.socket?.destroy();
    this.socket = null;
  }

  private connect(): void {
    if (this.stopping) return;

    const url = new URL(this.options.brokerUrl);
    if (url.protocol !== 'mqtt:' && url.protocol !== 'mqtts:') {
      throw new Error('MQTT_BROKER_URL must use mqtt:// or mqtts://.');
    }

    this.state = this.reconnectAttempt ? 'reconnecting' : 'connecting';
    const secure = url.protocol === 'mqtts:';
    const port = Number(url.port || (secure ? 8883 : 1883));
    const socket = secure
      ? tls.connect({
          host: url.hostname,
          port,
          ...(net.isIP(url.hostname) ? {} : { servername: url.hostname }),
        })
      : net.connect({ host: url.hostname, port });

    this.socket = socket;
    this.receiveBuffer = new Uint8Array();
    this.pendingSubscription = null;

    socket.once(secure ? 'secureConnect' : 'connect', () => {
      if (this.stopping || this.socket !== socket) return;
      socket.write(
        encodeConnect({
          clientId: `appm-site-mapper-${randomUUID()}`,
          ...(this.options.username === undefined ? {} : { username: this.options.username }),
          ...(this.options.password === undefined ? {} : { password: this.options.password }),
          keepAliveSeconds: this.options.keepAliveSeconds ?? 30,
        }),
      );
    });

    socket.on('data', (chunk: Buffer) => {
      if (this.socket !== socket || this.stopping) return;
      const combined = new Uint8Array(this.receiveBuffer.length + chunk.length);
      combined.set(this.receiveBuffer);
      combined.set(chunk, this.receiveBuffer.length);

      let parsed;
      try {
        parsed = extractPackets(combined);
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : 'Invalid MQTT packet';
        logger.warn('mqtt.packet.rejected', { reason: this.lastError });
        socket.destroy();
        return;
      }
      this.receiveBuffer = new Uint8Array(parsed.remainder);

      for (const packet of parsed.packets) {
        if (packet.type === 2) {
          if (packet.body.length < 2 || packet.body[1] !== 0) {
            this.lastError = `CONNACK_REJECTED_${packet.body[1] ?? 'MALFORMED'}`;
            logger.warn('mqtt.connection.rejected', { reason: this.lastError });
            socket.destroy();
            return;
          }
          this.pendingSubscription = this.nextPacketId();
          socket.write(encodeSubscribe(this.pendingSubscription, this.options.topicFilter));
          this.state = 'subscribing';
          continue;
        }

        if (packet.type === 9) {
          const subscriptionId = ((packet.body[0] ?? 0) << 8) | (packet.body[1] ?? 0);
          const grantedQos = packet.body[2];
          if (
            packet.body.length < 3 ||
            subscriptionId !== this.pendingSubscription ||
            grantedQos === undefined ||
            grantedQos === 0x80 ||
            grantedQos > 2
          ) {
            this.lastError = 'SUBACK_REJECTED';
            logger.warn('mqtt.subscription.rejected', { topicFilter: this.options.topicFilter });
            socket.destroy();
            return;
          }

          this.pendingSubscription = null;
          this.reconnectAttempt = 0;
          this.lastError = null;
          this.state = 'subscribed';
          this.lastSubscribedAt = new Date().toISOString();
          this.startPings(socket);
          logger.info('mqtt.subscribed', { topicFilter: this.options.topicFilter });
          continue;
        }

        if (packet.type === 3 && this.state === 'subscribed') {
          try {
            const publish = parsePublish(packet);
            void Promise.resolve(this.onMessage(publish.topic, publish.payload)).catch((error) => {
              logger.warn('mqtt.message.handler_failed', {
                reason: error instanceof Error ? error.message : 'unknown',
              });
            });
            if (publish.qos === 1 && publish.packetId !== undefined) {
              socket.write(encodePubAck(publish.packetId));
            }
          } catch (error) {
            logger.warn('mqtt.publish.rejected', {
              reason: error instanceof Error ? error.message : 'unknown',
            });
          }
        }
      }
    });

    socket.on('error', (error) => {
      this.lastError = error.message;
      logger.warn('mqtt.socket.error', { reason: error.message });
    });

    socket.on('close', () => {
      if (this.socket !== socket) return;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.socket = null;
      this.pendingSubscription = null;
      if (!this.stopping) this.scheduleReconnect();
    });
  }

  private startPings(socket: Socket | tls.TLSSocket): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const seconds = Math.max(10, this.options.keepAliveSeconds ?? 30);
    this.pingTimer = setInterval(
      () => {
        if (!socket.destroyed) socket.write(encodePingRequest());
      },
      Math.floor((seconds * 1000) / 2),
    );
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopping) return;
    this.state = 'reconnecting';
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempt, 5));
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    logger.warn('mqtt.reconnect.scheduled', { delayMs: delay });
  }

  private nextPacketId(): number {
    const current = this.packetId;
    this.packetId = this.packetId >= 65_535 ? 1 : this.packetId + 1;
    return current;
  }
}

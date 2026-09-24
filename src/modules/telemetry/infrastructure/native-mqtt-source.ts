import { randomInt } from 'node:crypto';
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
  readonly clientId: string;
  readonly keepAliveSeconds?: number;
  readonly maxReceiveBufferBytes: number;
  readonly requireTls?: boolean;
}

export type MqttMessageHandler = (topic: string, payload: Uint8Array) => void | Promise<void>;

export class NativeMqttSource {
  private socket: Socket | tls.TLSSocket | null = null;
  private receiveBuffer = new Uint8Array();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private packetId = 1;
  private started = false;
  private stopping = false;

  constructor(
    private readonly options: NativeMqttOptions,
    private readonly onMessage: MqttMessageHandler,
  ) {
    if (!Number.isInteger(options.maxReceiveBufferBytes) || options.maxReceiveBufferBytes < 1024) {
      throw new Error('MQTT maxReceiveBufferBytes must be an integer >= 1024.');
    }

    if (!options.clientId.trim()) {
      throw new Error('MQTT clientId is required.');
    }
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

    this.socket?.destroy();
    this.socket = null;
  }

  private connect(): void {
    if (this.stopping) return;

    const url = new URL(this.options.brokerUrl);
    if (url.protocol !== 'mqtt:' && url.protocol !== 'mqtts:') {
      throw new Error('MQTT_BROKER_URL must use mqtt:// or mqtts://.');
    }

    const secure = url.protocol === 'mqtts:';

    if (this.options.requireTls && !secure) {
      throw new Error('Plaintext MQTT is prohibited by the current runtime policy.');
    }

    const port = Number(url.port || (secure ? 8883 : 1883));

    const socket = secure
      ? tls.connect({ host: url.hostname, port, servername: url.hostname })
      : net.connect({ host: url.hostname, port });

    this.socket = socket;
    this.receiveBuffer = new Uint8Array();

    const sendConnect = () => {
      this.reconnectAttempt = 0;
      socket.write(
        encodeConnect({
          clientId: this.options.clientId,
          ...(this.options.username === undefined ? {} : { username: this.options.username }),
          ...(this.options.password === undefined ? {} : { password: this.options.password }),
          keepAliveSeconds: this.options.keepAliveSeconds ?? 30,
        }),
      );
    };

    if (secure) {
      (socket as tls.TLSSocket).once('secureConnect', sendConnect);
    } else {
      socket.once('connect', sendConnect);
    }

    socket.on('data', (chunk: Buffer) => {
      const nextLength = this.receiveBuffer.length + chunk.length;

      if (nextLength > this.options.maxReceiveBufferBytes) {
        logger.warn('mqtt.packet.rejected', {
          reason: 'receive_buffer_limit_exceeded',
          bytes: nextLength,
        });
        socket.destroy();
        return;
      }

      const combined = new Uint8Array(nextLength);
      combined.set(this.receiveBuffer);
      combined.set(chunk, this.receiveBuffer.length);

      let parsed;
      try {
        parsed = extractPackets(combined);
      } catch (error) {
        logger.warn('mqtt.packet.rejected', {
          reason: error instanceof Error ? error.message : 'unknown',
        });
        socket.destroy();
        return;
      }

      this.receiveBuffer = new Uint8Array(parsed.remainder);

      for (const packet of parsed.packets) {
        if (packet.type === 2) {
          const returnCode = packet.body[1];
          if (returnCode !== 0) {
            logger.error('mqtt.connection.rejected', { returnCode });
            socket.destroy();
            continue;
          }

          socket.write(encodeSubscribe(this.nextPacketId(), this.options.topicFilter));
          this.startPings(socket);
          logger.info('mqtt.connected', {
            topicFilter: this.options.topicFilter,
            clientId: this.options.clientId,
          });
          continue;
        }

        if (packet.type === 3) {
          try {
            const publish = parsePublish(packet);

            void Promise.resolve(this.onMessage(publish.topic, publish.payload))
              .then(() => {
                if (
                  publish.qos === 1 &&
                  publish.packetId !== undefined &&
                  !socket.destroyed
                ) {
                  socket.write(encodePubAck(publish.packetId));
                }
              })
              .catch((error) => {
                logger.warn('mqtt.message.handler_failed', {
                  reason: error instanceof Error ? error.message : 'unknown',
                });
              });
          } catch (error) {
            logger.warn('mqtt.publish.rejected', {
              reason: error instanceof Error ? error.message : 'unknown',
            });
          }
        }
      }
    });

    socket.on('error', (error) => {
      logger.warn('mqtt.socket.error', { reason: error.message });
    });

    socket.on('close', () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.socket = null;

      if (!this.stopping) {
        this.scheduleReconnect();
      }
    });
  }

  private startPings(socket: Socket | tls.TLSSocket): void {
    if (this.pingTimer) clearInterval(this.pingTimer);

    const seconds = Math.max(10, this.options.keepAliveSeconds ?? 30);
    this.pingTimer = setInterval(
      () => {
        if (!socket.destroyed) {
          socket.write(encodePingRequest());
        }
      },
      Math.floor((seconds * 1000) / 2),
    );
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopping) return;

    const baseDelay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempt, 5));
    const jitter = randomInt(0, Math.max(1, Math.floor(baseDelay / 4)));
    const delay = baseDelay + jitter;
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

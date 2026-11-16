import type { PowerFeed } from './entities';

export interface PortConnectionView {
  readonly portId: string;
  readonly pathId: string;
  readonly flow: 'OUTGOING' | 'INCOMING';
  readonly peerEquipmentId: string;
  readonly peerEquipmentName: string;
  readonly peerPortName: string;
  readonly feed?: PowerFeed;
}

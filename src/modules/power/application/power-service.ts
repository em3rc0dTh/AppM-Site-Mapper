import type { PowerRepository } from '@/modules/power/application/power-repository';
import {
  resolvePowerEndpoint,
  type ResolvedPowerEndpoint,
} from '@/modules/power/domain/endpoint-validation';
import type { PowerFeed, PowerPath } from '@/modules/power/domain/entities';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type PowerError =
  | 'SOURCE_PORT_NOT_FOUND'
  | 'TARGET_PORT_NOT_FOUND'
  | 'INVALID_SOURCE_DIRECTION'
  | 'INVALID_TARGET_DIRECTION'
  | 'SAME_ENDPOINT'
  | 'PATH_NOT_FOUND';

export interface CreatePowerPathInput {
  readonly sourceAccessPortId: string;
  readonly targetAccessPortId: string;
  readonly feed?: PowerFeed;
  readonly label?: string;
}

function sourceAllowed(endpoint: ResolvedPowerEndpoint): boolean {
  return endpoint.port.direction !== 'INPUT';
}

function targetAllowed(endpoint: ResolvedPowerEndpoint): boolean {
  return endpoint.port.direction !== 'OUTPUT';
}

export class PowerService {
  constructor(
    private readonly topology: TopologyRepository,
    private readonly repository: PowerRepository,
  ) {}

  async listActive(): Promise<readonly PowerPath[]> {
    return this.repository.listActive();
  }

  async create(input: CreatePowerPathInput): Promise<Result<PowerPath, PowerError>> {
    if (input.sourceAccessPortId === input.targetAccessPortId) return failure('SAME_ENDPOINT');

    const [source, target] = await Promise.all([
      resolvePowerEndpoint(this.topology, input.sourceAccessPortId),
      resolvePowerEndpoint(this.topology, input.targetAccessPortId),
    ]);

    if (!source) return failure('SOURCE_PORT_NOT_FOUND');
    if (!target) return failure('TARGET_PORT_NOT_FOUND');
    if (!sourceAllowed(source)) return failure('INVALID_SOURCE_DIRECTION');
    if (!targetAllowed(target)) return failure('INVALID_TARGET_DIRECTION');

    const timestamp = nowIso();
    const path: PowerPath = {
      id: createDomainId(),
      sourceAccessPortId: source.port.id,
      targetAccessPortId: target.port.id,
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.feed ? { feed: input.feed } : {}),
      ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    };

    await this.repository.insert(path);
    return success(path);
  }

  async archive(id: string): Promise<Result<PowerPath, PowerError>> {
    const current = await this.repository.getById(id);
    if (!current) return failure('PATH_NOT_FOUND');

    const archived: PowerPath = {
      ...current,
      lifecycle: 'ARCHIVED',
      updatedAt: nowIso(),
    };
    await this.repository.replace(archived);
    return success(archived);
  }
}

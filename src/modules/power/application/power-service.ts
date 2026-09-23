import type { PowerRepository } from '@/modules/power/application/power-repository';
import type { PowerEndpoint, PowerFeed, PowerPath } from '@/modules/power/domain/entities';
import {
  powerEndpointKey,
  resolvePowerEndpoint,
  type EndpointValidationError,
} from '@/modules/power/domain/endpoint-validation';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type PowerError =
  | EndpointValidationError
  | 'IDENTICAL_ENDPOINTS'
  | 'PATH_NOT_FOUND'
  | 'INVALID_FEED';

export interface CreatePowerPathInput {
  readonly source: PowerEndpoint;
  readonly target: PowerEndpoint;
  readonly feed?: PowerFeed;
  readonly label?: string;
}

export class PowerService {
  constructor(
    private readonly topology: TopologyRepository,
    private readonly paths: PowerRepository,
  ) {}

  async create(input: CreatePowerPathInput): Promise<Result<PowerPath, PowerError>> {
    if (input.feed && input.feed !== 'A' && input.feed !== 'B') {
      return failure('INVALID_FEED');
    }

    if (powerEndpointKey(input.source) === powerEndpointKey(input.target)) {
      return failure('IDENTICAL_ENDPOINTS');
    }

    const [sourceOwner, targetOwner] = await Promise.all([
      this.topology.getById(input.source.entityId),
      this.topology.getById(input.target.entityId),
    ]);

    const source = resolvePowerEndpoint(sourceOwner, input.source);

    if (!source.ok) {
      return failure(source.error);
    }

    const target = resolvePowerEndpoint(targetOwner, input.target);

    if (!target.ok) {
      return failure(target.error);
    }

    const timestamp = nowIso();
    const path: PowerPath = {
      id: createDomainId(),
      sourceEntityId: input.source.entityId,
      targetEntityId: input.target.entityId,
      source: structuredClone(input.source),
      target: structuredClone(input.target),
      ...(input.feed ? { feed: input.feed } : {}),
      ...(input.label?.trim() ? { label: input.label.trim() } : {}),
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.paths.insert(path);
    return success(path);
  }

  async archive(id: string): Promise<Result<PowerPath, PowerError>> {
    const path = await this.paths.getById(id);

    if (!path) {
      return failure('PATH_NOT_FOUND');
    }

    const archived: PowerPath = {
      ...path,
      lifecycle: 'ARCHIVED',
      updatedAt: nowIso(),
    };

    await this.paths.replace(archived);
    return success(archived);
  }

  async listForEntity(entityId: string): Promise<readonly PowerPath[]> {
    return this.paths.listForEntity(entityId);
  }

  async listActive(): Promise<readonly PowerPath[]> {
    return this.paths.listActive();
  }
}

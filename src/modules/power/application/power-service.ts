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
  | 'FEED_MISMATCH'
  | 'TARGET_ALREADY_CONNECTED'
  | 'SOURCE_ALREADY_CONNECTED'
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

function feedOf(endpoint: ResolvedPowerEndpoint): PowerFeed | undefined {
  const value = endpoint.port.attributes?.feed;
  return value === 'A' || value === 'B' ? value : undefined;
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

    const sourceFeed = feedOf(source);
    const targetFeed = feedOf(target);
    if (
      (sourceFeed && targetFeed && sourceFeed !== targetFeed) ||
      (input.feed && sourceFeed && input.feed !== sourceFeed) ||
      (input.feed && targetFeed && input.feed !== targetFeed)
    )
      return failure('FEED_MISMATCH');

    const [sourcePaths, targetPaths] = await Promise.all([
      this.repository.listForAccessPort(source.port.id),
      this.repository.listForAccessPort(target.port.id),
    ]);
    const exact = targetPaths.find(
      (path) =>
        path.sourceAccessPortId === source.port.id && path.targetAccessPortId === target.port.id,
    );
    if (exact) return success(exact);

    if (targetPaths.length) return failure('TARGET_ALREADY_CONNECTED');
    if (sourcePaths.length) return failure('SOURCE_ALREADY_CONNECTED');

    const timestamp = nowIso();
    const path: PowerPath = {
      id: createDomainId(),
      sourceAccessPortId: source.port.id,
      targetAccessPortId: target.port.id,
      lifecycle: 'ACTIVE',
      connectionKey: target.port.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.feed ? { feed: input.feed } : {}),
      ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    };

    try {
      await this.repository.insert(path);
    } catch (error) {
      const conflict = error as {
        code?: number;
        keyPattern?: Record<string, unknown>;
        message?: string;
      };
      if (conflict.code === 11000) {
        const [sourceNow, targetNow] = await Promise.all([
          this.repository.listForAccessPort(source.port.id),
          this.repository.listForAccessPort(target.port.id),
        ]);
        const exactNow = targetNow.find(
          (candidate) =>
            candidate.sourceAccessPortId === source.port.id &&
            candidate.targetAccessPortId === target.port.id,
        );
        if (exactNow) return success(exactNow);
        if (
          targetNow.length ||
          conflict.keyPattern?.targetAccessPortId !== undefined ||
          conflict.keyPattern?.connectionKey !== undefined ||
          conflict.message?.includes('uq_active_power_path_target') ||
          conflict.message?.includes('uq_active_power_path_connection_key')
        ) {
          return failure('TARGET_ALREADY_CONNECTED');
        }
        if (
          sourceNow.length ||
          conflict.keyPattern?.sourceAccessPortId !== undefined ||
          conflict.message?.includes('uq_active_power_path_source')
        ) {
          return failure('SOURCE_ALREADY_CONNECTED');
        }
      }
      throw error;
    }
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

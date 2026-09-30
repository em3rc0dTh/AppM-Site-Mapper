import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import {
  WarehouseService,
  type CreateAssetTemplateInput,
} from '@/modules/warehouse/application/warehouse-service';
import type { AssetTemplateKind } from '@/modules/warehouse/domain/template';
import { createWarehouseRepository } from '@/modules/warehouse/infrastructure/warehouse-repository-factory';

const MAX_IMPORT_ITEMS = 100;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function parseTemplate(value: unknown): CreateAssetTemplateInput | null {
  const body = object(value);
  if (!body || typeof body.name !== 'string') return null;

  const kind =
    body.kind === 'DEVICE' || body.kind === 'EQUIPMENT'
      ? (body.kind as AssetTemplateKind)
      : null;
  if (!kind) return null;

  const dimensions = object(body.dimensionsMm);
  const widthMm =
    optionalNumber(body.widthMm) ?? (dimensions ? optionalNumber(dimensions.width) : undefined);
  const depthMm =
    optionalNumber(body.depthMm) ?? (dimensions ? optionalNumber(dimensions.depth) : undefined);

  return {
    kind,
    name: body.name,
    ...(optionalString(body.manufacturer) !== undefined
      ? { manufacturer: String(body.manufacturer) }
      : {}),
    ...(optionalString(body.model) !== undefined ? { model: String(body.model) } : {}),
    ...(optionalString(body.category) !== undefined ? { category: String(body.category) } : {}),
    ...(optionalNumber(body.sizeU) !== undefined ? { sizeU: Number(body.sizeU) } : {}),
    ...(widthMm !== undefined ? { widthMm } : {}),
    ...(depthMm !== undefined ? { depthMm } : {}),
    ...(optionalString(body.notes) !== undefined ? { notes: String(body.notes) } : {}),
  };
}

export async function POST(request: Request) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const raw = await request.text();
  if (raw.length > 256_000)
    return NextResponse.json({ error: 'IMPORT_TOO_LARGE' }, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const values = Array.isArray(parsed) ? parsed : [parsed];
  if (!values.length || values.length > MAX_IMPORT_ITEMS)
    return NextResponse.json({ error: 'INVALID_IMPORT_SIZE' }, { status: 400 });

  const inputs = values.map(parseTemplate);
  const invalidIndex = inputs.findIndex((input) => input === null);
  if (invalidIndex >= 0)
    return NextResponse.json(
      { error: 'INVALID_TEMPLATE', index: invalidIndex },
      { status: 400 },
    );

  const service = new WarehouseService(await createWarehouseRepository());
  const created = [];

  for (let index = 0; index < inputs.length; index += 1) {
    const result = await service.create(inputs[index]!);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          index,
          imported: created.length,
        },
        { status: 422 },
      );
    }
    created.push(result.value);
  }

  return NextResponse.json({ templates: created, imported: created.length }, { status: 201 });
}

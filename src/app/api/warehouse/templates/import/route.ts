import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { parseAssetTemplateJson } from '@/modules/warehouse/application/template-json-parser';
import { WarehouseService } from '@/modules/warehouse/application/warehouse-service';
import { createWarehouseRepository } from '@/modules/warehouse/infrastructure/warehouse-repository-factory';
import {
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';

const MAX_IMPORT_ITEMS = 100;

export async function POST(request: Request) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  if (!isSafeMutationRequest(request)) {
    return NextResponse.json({ error: 'CROSS_SITE_MUTATION_REJECTED' }, { status: 403 });
  }

  const parsedBody = await readBoundedJson(request, {
    maxBytes: 256_000,
    maxDepth: 10,
    maxNodes: 8_000,
  });
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.error },
      { status: jsonBodyErrorStatus(parsedBody.error) },
    );
  }

  const values = Array.isArray(parsedBody.value) ? parsedBody.value : [parsedBody.value];
  if (!values.length || values.length > MAX_IMPORT_ITEMS)
    return NextResponse.json({ error: 'INVALID_IMPORT_SIZE' }, { status: 400 });

  const inputs = values.map(parseAssetTemplateJson);
  const invalidIndex = inputs.findIndex((input) => input === null);
  if (invalidIndex >= 0)
    return NextResponse.json({ error: 'INVALID_TEMPLATE', index: invalidIndex }, { status: 400 });

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

import { IntegrityConflict } from '@/shared/infrastructure/mongodb/integrity-transaction';
export function integrityErrorResponse(error: unknown): Response {
  if (error instanceof IntegrityConflict)
    return Response.json(
      { error: error.code },
      {
        status:
          error.code === 'FORBIDDEN'
            ? 403
            : error.code === 'SESSION_INVALID'
              ? 401
              : error.code === 'WRITES_PAUSED_FOR_MIGRATION'
                ? 503
                : 409,
      },
    );
  if (error instanceof Error && error.message === 'LAYOUT_CONFLICT')
    return Response.json({ error: 'LAYOUT_CONFLICT' }, { status: 409 });
  if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
    return Response.json({ error: 'UNIQUE_CONSTRAINT_CONFLICT' }, { status: 409 });
  throw error;
}

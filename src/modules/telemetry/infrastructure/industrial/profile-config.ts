import { readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import {
  parseProfiles,
  type SourceProfile,
} from '@/modules/telemetry/domain/industrial/observations';

const MAX_PROFILE_BYTES = 4_000_000;
let previousRaw: string | undefined;
let previousProfiles: SourceProfile[] | undefined;

/**
 * File-backed industrial profiles avoid Linux's per-variable environment size
 * limit for hundreds of explicit breaker-level rules. The original JSON env
 * configuration remains supported whenever no file is configured.
 *
 * The file must be an explicitly mounted, absolute path; absence or malformed
 * JSON fails closed. Loading the file does not create any inventory or binding.
 */
export function configuredIndustrialProfiles(): SourceProfile[] {
  const file = process.env.INDUSTRIAL_PROFILES_FILE?.trim();
  let raw: string | undefined;
  if (file) {
    if (!isAbsolute(file)) throw new Error('INDUSTRIAL_PROFILES_FILE must be absolute');
    const details = statSync(file);
    if (!details.isFile() || details.size > MAX_PROFILE_BYTES) {
      throw new Error('Industrial profiles file missing or too large');
    }
    raw = readFileSync(file, 'utf8');
  } else {
    raw = process.env.INDUSTRIAL_PROFILES_JSON;
  }
  if (raw === previousRaw && previousProfiles) return previousProfiles;
  const parsed = parseProfiles(raw);
  previousRaw = raw;
  previousProfiles = parsed;
  return parsed;
}

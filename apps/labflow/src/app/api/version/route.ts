import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Which build is serving, read from the id Next writes for every build. Open
 * tabs compare it with the one they started with to notice a redeploy.
 *
 * Read from disk, not stamped into the code: Next compiles the server and the
 * browser halves separately, so a stamp made while building differed between
 * them and made every tab look out of date.
 */
let build: string | null = null;
function currentBuild(): string {
  if (build === null) {
    try {
      build = readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
    } catch {
      build = '';
    }
  }
  return build;
}

export function GET() {
  return NextResponse.json({ build: currentBuild() }, { headers: { 'Cache-Control': 'no-store' } });
}

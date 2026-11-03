import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { blockedReason } from '@/server/paywall';
import { extensionOf, isAllowedUpload, maxBytesFor } from '@/server/storage';
import { UnsupportedFormatError, parseDelimitedText, parseSpreadsheet } from '@/lib/dataset';
import { XlsxError } from '@/lib/xlsx';
import { buildDraft, type DraftInput } from '@/lib/experiment-draft';

export const runtime = 'nodejs';
// Reads the request body and the session. There is no build-time answer.
export const dynamic = 'force-dynamic';

/** Files read per drop. Beyond this the form is being filled by the wrong tool. */
const MAX_FILES = 12;

/**
 * Reads dropped files and answers with a filled-in experiment.
 *
 * **Stores nothing.** The bytes are parsed in memory and discarded; the files
 * are uploaded only when the researcher actually saves the experiment. So
 * dropping the wrong folder costs a moment, not a cleanup, and a draft that
 * gets abandoned leaves no orphan rows behind.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Reading files is the first half of creating an experiment, so a workspace
  // that cannot create one should not be invited to start.
  const blocked = await blockedReason(session, 'experiment');
  if (blocked) return NextResponse.json({ error: blocked }, { status: 402 });

  const form = await request.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: 'Drop at least one file.' }, { status: 400 });
  }

  const inputs: DraftInput[] = [];
  const skipped: string[] = [];

  for (const file of files.slice(0, MAX_FILES)) {
    if (!isAllowedUpload(file.name)) {
      skipped.push(`${file.name} is not a supported file type.`);
      continue;
    }
    if (file.size > maxBytesFor(file.name)) {
      skipped.push(`${file.name} is too large to read here.`);
      continue;
    }

    const extension = extensionOf(file.name);
    const tabular = extension === 'csv' || extension === 'tsv';
    const spreadsheet = extension === 'xlsx';

    // A file whose contents cannot be read still contributes its name, which
    // is often the only place the date and the subject are written down.
    if (!tabular && !spreadsheet) {
      inputs.push({ filename: file.name, table: null });
      continue;
    }

    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      inputs.push({
        filename: file.name,
        table: tabular ? parseDelimitedText(bytes.toString('utf8')) : await parseSpreadsheet(bytes),
      });
    } catch (error) {
      if (error instanceof UnsupportedFormatError || error instanceof XlsxError) {
        inputs.push({ filename: file.name, table: null });
        skipped.push(`${file.name}: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  if (files.length > MAX_FILES) {
    skipped.push(`Only the first ${MAX_FILES} files were read.`);
  }

  return NextResponse.json({ draft: buildDraft(inputs), skipped });
}

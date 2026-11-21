'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { UnsupportedFormatError, parseDelimitedText } from '@/lib/dataset';
import { requireSession, NotFoundInWorkspaceError } from '../authz';
import { blockedReason } from '../paywall';
import * as q from '../queries';
import type { ActionState } from './types';

/** About a 5,000-row table pasted from a spreadsheet; a bigger one is a file. */
const MAX_PASTE = 1_000_000;

/**
 * A table pasted straight from Excel or Sheets becomes a dataset on the run,
 * with no file to save and upload first. It opens on the dataset page, where
 * the checks and next step are.
 */
export async function pasteDatasetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };
  const experimentId = String(formData.get('experimentId') ?? '');
  const text = String(formData.get('table') ?? '');
  const name = String(formData.get('name') ?? '').trim().slice(0, 200);
  if (!text.trim()) return { fieldErrors: { table: 'Paste a table, header row first.' } };
  if (text.length > MAX_PASTE) return { fieldErrors: { table: 'That is too big to paste. Upload it as a CSV file instead.' } };

  let table;
  try {
    table = parseDelimitedText(text.trim());
  } catch (error) {
    if (error instanceof UnsupportedFormatError) return { fieldErrors: { table: error.message } };
    throw error;
  }
  if (table.columns.length < 2 || table.rows.length < 1) {
    return { fieldErrors: { table: 'Could not find a header row and at least one data row. Copy the cells straight from Excel or Sheets.' } };
  }

  let datasetId: string;
  try {
    datasetId = await q.createDataset(session, experimentId, {
      name: name || `Pasted table, ${new Date().toISOString().slice(0, 10)}`,
      fileId: null,
      rows: table.rows,
      columns: table.columns,
    });
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return { error: 'That experiment is not in this lab any more.' };
    throw error;
  }
  revalidatePath(`/experiments/${experimentId}`);
  redirect(`/datasets/${datasetId}`);
}

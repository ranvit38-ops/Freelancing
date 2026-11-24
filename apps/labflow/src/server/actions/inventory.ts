'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { inventoryItemSchema, inventoryLotSchema, lotUseSchema } from '@/lib/validation';
import { requireSession, NotFoundInWorkspaceError } from '../authz';
import { blockedReason } from '../paywall';
import * as q from '../queries';
import { fieldErrorsFrom, formObject, type ActionState } from './types';

/** Turns an authorisation miss into a form error instead of a 500. */
async function guard<T>(run: () => Promise<T>): Promise<T | ActionState> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return { error: error.message };
    throw error;
  }
}

export async function createInventoryItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };
  const parsed = inventoryItemSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const itemId = await q.createInventoryItem(session, parsed.data);
  revalidatePath('/inventory');
  redirect(`/inventory/${itemId}`);
}

export async function updateInventoryItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };
  const raw = formObject(formData);
  const itemId = String(raw.itemId ?? '');
  const parsed = inventoryItemSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await guard(() => q.updateInventoryItem(session, itemId, parsed.data));
  if (result && typeof result === 'object') return result as ActionState;
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath('/inventory');
  return { ok: true, message: 'Saved.' };
}

export async function deleteInventoryItemAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (await blockedReason(session)) return;
  const itemId = String(formData.get('itemId') ?? '');
  await guard(() => q.deleteInventoryItem(session, itemId));
  revalidatePath('/inventory');
  redirect('/inventory');
}

export async function addLotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };
  const raw = formObject(formData);
  const itemId = String(raw.itemId ?? '');
  const parsed = inventoryLotSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await guard(() => q.addInventoryLot(session, itemId, parsed.data));
  if (result && typeof result === 'object') return result as ActionState;
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath('/inventory');
  return { ok: true, message: `Lot ${parsed.data.lotCode} added.` };
}

export async function adjustLotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };
  const raw = formObject(formData);
  const lotId = String(raw.lotId ?? '');
  const quantity = String(raw.quantity ?? '').trim();
  if (!/^\d+(\.\d{1,3})?$/.test(quantity)) {
    return { fieldErrors: { quantity: 'Enter a number, for example 12 or 0.5.' } };
  }
  const result = await guard(() => q.adjustLotQuantity(session, lotId, quantity));
  if (result && typeof result === 'object') return result as ActionState;
  revalidatePath('/inventory');
  return { ok: true, message: 'Quantity updated.' };
}

export async function deleteLotAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (await blockedReason(session)) return;
  await guard(() => q.deleteInventoryLot(session, String(formData.get('lotId') ?? '')));
  revalidatePath('/inventory');
}

export async function recordLotUseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };
  const parsed = lotUseSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const { experimentId, lotId, quantity } = parsed.data;
  const result = await guard(() =>
    q.recordLotUse(session, experimentId, lotId, quantity ?? null),
  );
  if (result && typeof result === 'object') return result as ActionState;
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true, message: 'Recorded against this run.' };
}

export async function removeLotUseAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (await blockedReason(session)) return;
  const experimentId = String(formData.get('experimentId') ?? '');
  const lotId = String(formData.get('lotId') ?? '');
  await guard(() => q.removeLotUse(session, experimentId, lotId));
  revalidatePath(`/experiments/${experimentId}`);
}

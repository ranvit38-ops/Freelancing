'use client';

import { useFormState } from 'react-dom';
import { Button, Card, Field, FormError, Input, Select, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import {
  addLotAction,
  adjustLotAction,
  createInventoryItemAction,
  deleteLotAction,
  recordLotUseAction,
  removeLotUseAction,
  updateInventoryItemAction,
} from '@/server/actions/inventory';
import { noState } from '@/server/actions/types';

type Item = {
  id: string;
  name: string;
  category: string | null;
  supplier: string | null;
  catalogNumber: string | null;
  unit: string;
  reorderAt: string | null;
  storage: string | null;
  notes: string | null;
};

/** Create and edit share one set of fields; only the action differs. */
export function InventoryItemForm({ item }: { item?: Item }) {
  const [state, action] = useFormState(
    item ? updateInventoryItemAction : createInventoryItemAction,
    noState,
  );
  return (
    <form action={action} className="space-y-5">
      <FormError>{state.error}</FormError>
      {state.ok ? <p className="text-sm text-success">{state.message}</p> : null}
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}
      <Card className="space-y-4 p-5 sm:p-6">
        <Field
          label="Item"
          htmlFor="name"
          hint="What you would call it at the bench, not the full catalogue title."
          error={state.fieldErrors?.name}
        >
          <Input
            id="name"
            name="name"
            defaultValue={item?.name}
            placeholder="Anti-GFP antibody"
            required
            autoFocus
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier" htmlFor="supplier" optional>
            <Input id="supplier" name="supplier" defaultValue={item?.supplier ?? ''} placeholder="Abcam" />
          </Field>
          <Field label="Catalogue number" htmlFor="catalogNumber" optional>
            <Input
              id="catalogNumber"
              name="catalogNumber"
              defaultValue={item?.catalogNumber ?? ''}
              placeholder="ab290"
              className="font-mono"
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category" htmlFor="category" optional>
            <Input id="category" name="category" defaultValue={item?.category ?? ''} placeholder="Antibody" />
          </Field>
          <Field label="Unit" htmlFor="unit" hint="vial, mL, plate">
            <Input id="unit" name="unit" defaultValue={item?.unit ?? 'unit'} placeholder="vial" />
          </Field>
          <Field
            label="Reorder at"
            htmlFor="reorderAt"
            optional
            hint="Warn below this."
            error={state.fieldErrors?.reorderAt}
          >
            <Input
              id="reorderAt"
              name="reorderAt"
              defaultValue={item?.reorderAt ?? ''}
              inputMode="decimal"
              placeholder="2"
            />
          </Field>
        </div>
        <Field label="Storage" htmlFor="storage" optional>
          <Input
            id="storage"
            name="storage"
            defaultValue={item?.storage ?? ''}
            placeholder="Freezer B, shelf 2, minus 20 C"
          />
        </Field>
        <Field label="Notes" htmlFor="notes" optional>
          <Textarea id="notes" name="notes" rows={3} defaultValue={item?.notes ?? ''} />
        </Field>
      </Card>
      <SubmitButton pendingLabel="Saving…">{item ? 'Save changes' : 'Add item'}</SubmitButton>
    </form>
  );
}

export function AddLotForm({ itemId, unit }: { itemId: string; unit: string }) {
  const [state, action] = useFormState(addLotAction, noState);
  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <FormError>{state.error}</FormError>
      {state.ok ? <p className="text-sm text-success">{state.message}</p> : null}
      <input type="hidden" name="itemId" value={itemId} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Lot or batch" htmlFor="lotCode" error={state.fieldErrors?.lotCode}>
          <Input id="lotCode" name="lotCode" placeholder="GR3361051-3" required className="font-mono" />
        </Field>
        <Field label={`Quantity (${unit})`} htmlFor="quantity" error={state.fieldErrors?.quantity}>
          <Input id="quantity" name="quantity" inputMode="decimal" placeholder="5" />
        </Field>
        <Field label="Received" htmlFor="receivedOn" optional>
          <Input id="receivedOn" name="receivedOn" type="date" />
        </Field>
        <Field label="Expires" htmlFor="expiresOn" optional error={state.fieldErrors?.expiresOn}>
          <Input id="expiresOn" name="expiresOn" type="date" />
        </Field>
      </div>
      <SubmitButton size="sm" pendingLabel="Adding…">
        Add lot
      </SubmitButton>
    </form>
  );
}

export function LotQuantityForm({ lotId, quantity }: { lotId: string; quantity: string }) {
  const [state, action] = useFormState(adjustLotAction, noState);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="lotId" value={lotId} />
      <Input
        name="quantity"
        defaultValue={Number(quantity).toString()}
        inputMode="decimal"
        aria-label="Quantity remaining"
        className="h-8 w-20 tabular-nums"
      />
      <SubmitButton size="sm" tone="secondary" pendingLabel="…">
        Set
      </SubmitButton>
      {state.fieldErrors?.quantity ? (
        <span className="text-xs text-danger">{state.fieldErrors.quantity}</span>
      ) : null}
    </form>
  );
}

export function DeleteLotButton({ lotId }: { lotId: string }) {
  return (
    <form action={deleteLotAction}>
      <input type="hidden" name="lotId" value={lotId} />
      <Button type="submit" tone="secondary" size="sm">
        Remove
      </Button>
    </form>
  );
}

type LotOption = {
  lotId: string;
  lotCode: string;
  quantity: string;
  itemName: string;
  unit: string;
};

/** Records which lot a run consumed. This is the link nothing else has. */
export function RecordLotUseForm({
  experimentId,
  options,
}: {
  experimentId: string;
  options: LotOption[];
}) {
  const [state, action] = useFormState(recordLotUseAction, noState);
  if (options.length === 0) {
    return (
      <p className="px-5 py-4 text-sm text-muted">
        No lots on the shelf yet. Add an item under Inventory first, then come back and record what
        this run used.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 px-5 py-4">
      <FormError>{state.error}</FormError>
      <input type="hidden" name="experimentId" value={experimentId} />
      <div className="min-w-64 flex-1">
      <Field label="Lot used" htmlFor="lotId" error={state.fieldErrors?.lotId}>
        <Select id="lotId" name="lotId" required defaultValue="">
          <option value="" disabled>
            Choose a lot
          </option>
          {options.map((o) => (
            <option key={o.lotId} value={o.lotId}>
              {o.itemName} lot {o.lotCode} ({Number(o.quantity)} {o.unit} left)
            </option>
          ))}
        </Select>
      </Field>
      </div>
      <Field label="Amount used" htmlFor="lotQuantity" optional error={state.fieldErrors?.quantity}>
        <Input id="lotQuantity" name="quantity" inputMode="decimal" placeholder="1" className="w-28" />
      </Field>
      <SubmitButton size="sm" pendingLabel="Recording…">
        Record
      </SubmitButton>
    </form>
  );
}

export function RemoveLotUseButton({
  experimentId,
  lotId,
}: {
  experimentId: string;
  lotId: string;
}) {
  return (
    <form action={removeLotUseAction}>
      <input type="hidden" name="experimentId" value={experimentId} />
      <input type="hidden" name="lotId" value={lotId} />
      <Button type="submit" tone="secondary" size="sm">
        Remove
      </Button>
    </form>
  );
}

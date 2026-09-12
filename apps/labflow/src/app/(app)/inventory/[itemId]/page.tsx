import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { AddLotForm, DeleteLotButton, InventoryItemForm, LotQuantityForm } from '@/components/inventory-forms';
import { experimentCode, formatDate, pluralise } from '@/lib/display';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getInventoryItem } from '@/server/queries';
import { deleteInventoryItemAction } from '@/server/actions/inventory';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { itemId: string } }) {
  try {
    const session = await requireSession();
    return { title: (await getInventoryItem(session, params.itemId)).item.name };
  } catch {
    return { title: 'Inventory item' };
  }
}

export default async function InventoryItemPage({ params }: { params: { itemId: string } }) {
  const session = await requireSession();
  let data;
  try {
    data = await getInventoryItem(session, params.itemId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
  const { item, lots, usage } = data;
  const onHand = lots.reduce((sum, l) => sum + Number(l.quantity), 0);

  return (
    <>
      <PageHeader
        eyebrow={[item.supplier, item.catalogNumber].filter(Boolean).join(' ') || undefined}
        title={item.name}
        description={`${onHand} ${item.unit} on hand across ${pluralise(lots.length, 'lot')}.${
          item.storage ? ` Stored in ${item.storage}.` : ''
        }`}
        back={{ href: '/inventory', label: 'Inventory' }}
        actions={
          <form action={deleteInventoryItemAction}>
            <input type="hidden" name="itemId" value={item.id} />
            <Button type="submit" tone="secondary">
              Delete item
            </Button>
          </form>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Lots" description="Each bottle, vial or batch you received." />
            {lots.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">
                No lots recorded yet. Add the one currently on the shelf below.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {lots.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="w-40 shrink-0 font-mono text-sm">{l.lotCode}</span>
                    <LotQuantityForm lotId={l.id} quantity={l.quantity} />
                    <span className="text-xs text-subtle">{item.unit}</span>
                    <span className="flex-1 text-xs text-subtle">
                      {l.expiresOn ? `Expires ${formatDate(l.expiresOn)}` : 'No expiry recorded'}
                      {l.runsUsing > 0 ? ` · used by ${pluralise(l.runsUsing, 'run')}` : ''}
                    </span>
                    {l.runsUsing === 0 ? <DeleteLotButton lotId={l.id} /> : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line">
              <AddLotForm itemId={item.id} unit={item.unit} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Where it was used"
              description="Every run that recorded a lot of this item. This is the list you work through when a lot turns out to be bad."
            />
            {usage.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">
                No runs have recorded this item yet. Open an experiment and record the lot it used.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {usage.map((u) => (
                  <li key={`${u.experimentId}-${u.lotCode}`}>
                    <Link
                      href={`/experiments/${u.experimentId}`}
                      className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-raised"
                    >
                      <span className="w-20 shrink-0 font-mono text-xs text-subtle">
                        {experimentCode(u.number)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{u.title}</span>
                      <span className="shrink-0 font-mono text-xs">{u.lotCode}</span>
                      <span className="w-24 shrink-0 text-right text-xs text-subtle">
                        {u.quantity ? `${Number(u.quantity)} ${item.unit}` : ''}
                      </span>
                      <span className="w-28 shrink-0 text-right text-xs text-subtle">
                        {u.performedOn ? formatDate(u.performedOn) : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold tracking-tight">Details</h2>
          <InventoryItemForm item={item} />
        </div>
      </div>
    </>
  );
}

import Link from 'next/link';
import { ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { pluralise } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { listInventory } from '@/server/queries';

export const metadata = { title: 'Inventory' };
export const dynamic = 'force-dynamic';

/** Days before an expiry date counts as "soon" on this page. */
const EXPIRY_WARNING_DAYS = 30;

function expiryTone(iso: string | null): { label: string; className: string } | null {
  if (!iso) return null;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: 'Expired', className: 'text-danger' };
  if (days <= EXPIRY_WARNING_DAYS) {
    return { label: `Expires in ${pluralise(days, 'day')}`, className: 'text-warning' };
  }
  return null;
}

export default async function InventoryPage() {
  const session = await requireSession();
  const items = await listInventory(session);

  const low = items.filter(
    (i) => i.reorderAt !== null && Number(i.onHand) <= Number(i.reorderAt),
  );

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Reagents and consumables, tracked by lot. Recording the lot a run used is what lets you answer why a result stopped reproducing."
        actions={<ButtonLink href="/inventory/new">New item</ButtonLink>}
      />

      {low.length > 0 ? (
        <Card className="mb-4 border-warning/40 bg-warning/5">
          <div className="px-5 py-3 text-sm">
            <span className="font-medium">{pluralise(low.length, 'item')} at or below the reorder point:</span>{' '}
            {low.map((i, n) => (
              <span key={i.id}>
                {n > 0 ? ', ' : ''}
                <Link href={`/inventory/${i.id}`} className="underline underline-offset-2">
                  {i.name}
                </Link>
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        {items.length === 0 ? (
          <EmptyState
            title="Nothing on the shelf yet"
            description="Add an antibody, a media batch, a kit, anything a run consumes. Then record which lot each experiment used."
            action={
              <ButtonLink href="/inventory/new" size="sm">
                Add an item
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((i) => {
              const expiry = expiryTone(i.nextExpiry);
              const isLow = i.reorderAt !== null && Number(i.onHand) <= Number(i.reorderAt);
              return (
                <li key={i.id}>
                  <Link
                    href={`/inventory/${i.id}`}
                    className="flex flex-col gap-1 px-5 py-3 hover:bg-raised sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.name}</span>
                      <span className="block truncate text-xs text-subtle">
                        {[i.supplier, i.catalogNumber].filter(Boolean).join(' ') || 'No supplier recorded'}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-sm tabular-nums sm:w-28 sm:text-right ${
                        isLow ? 'text-warning' : ''
                      }`}
                    >
                      {Number(i.onHand)} {i.unit}
                    </span>
                    <span className="shrink-0 text-xs text-subtle sm:w-28 sm:text-right">
                      {pluralise(i.lotCount, 'lot')}
                    </span>
                    <span className="shrink-0 text-xs text-subtle sm:w-36 sm:text-right">
                      {pluralise(i.runsUsing, 'run')}
                    </span>
                    <span
                      className={`shrink-0 text-xs sm:w-36 sm:text-right ${expiry?.className ?? 'text-subtle'}`}
                    >
                      {expiry?.label ?? ''}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

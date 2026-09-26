import { PageHeader } from '@/components/ui';
import { InventoryItemForm } from '@/components/inventory-forms';
import { requireSession } from '@/server/authz';

export const metadata = { title: 'New inventory item' };
export const dynamic = 'force-dynamic';

export default async function NewInventoryItemPage() {
  await requireSession();
  return (
    <>
      <PageHeader
        title="New inventory item"
        description="One row per thing you buy. Individual bottles and batches are added as lots once the item exists."
        back={{ href: '/inventory', label: 'Inventory' }}
      />
      <div className="max-w-3xl">
        <InventoryItemForm />
      </div>
    </>
  );
}

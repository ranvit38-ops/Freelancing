import { ProtocolForm } from '@/components/simple-forms';
import { PageHeader } from '@/components/ui';
import { requireSession } from '@/server/authz';
import { listProjects } from '@/server/queries';

export const metadata = { title: 'New protocol' };
export const dynamic = 'force-dynamic';

export default async function NewProtocolPage() {
  const session = await requireSession();
  const projects = await listProjects(session);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New protocol" description="Version 1 is created automatically." />
      <ProtocolForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}

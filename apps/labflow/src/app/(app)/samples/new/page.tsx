import { SampleForm } from '@/components/simple-forms';
import { PageHeader } from '@/components/ui';
import { requireSession } from '@/server/authz';
import { listProjects, listSamples } from '@/server/queries';

export const metadata = { title: 'New sample' };
export const dynamic = 'force-dynamic';

export default async function NewSamplePage() {
  const session = await requireSession();
  const [projects, samples] = await Promise.all([listProjects(session), listSamples(session)]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New sample" description="Only the ID is required." />
      <SampleForm
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        parents={samples.map((s) => ({ id: s.id, code: s.code }))}
      />
    </div>
  );
}

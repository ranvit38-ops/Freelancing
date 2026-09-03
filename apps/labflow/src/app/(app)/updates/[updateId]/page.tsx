import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeleteUpdateForm, UpdateEditor } from '@/components/update-editor';
import { PageHeader } from '@/components/ui';
import { pluralise } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { getResearchUpdate } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function UpdatePage({ params }: { params: { updateId: string } }) {
  const session = await requireSession();
  try {
    const update = await getResearchUpdate(session, params.updateId);
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow={
            <Link href={`/projects/${update.projectId}`} className="hover:text-fg">
              {update.projectName}
            </Link>
          }
          title="Research update"
          description={`Built from ${pluralise(
            update.experimentIds.length,
            'experiment',
          )}. Edit anything before exporting.`}
          actions={<DeleteUpdateForm updateId={update.id} />}
        />
        <UpdateEditor
          updateId={update.id}
          title={update.title}
          status={update.status}
          sections={update.sections}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
}

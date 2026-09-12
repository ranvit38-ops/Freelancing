import { notFound } from 'next/navigation';
import { ConfirmSubmit } from '@/components/file-upload';
import { ProjectForm } from '@/components/project-form';
import { Card, PageHeader } from '@/components/ui';
import { deleteProjectAction } from '@/server/actions/records';
import { requireSession, NotFoundInWorkspaceError } from '@/server/authz';
import { getProject } from '@/server/queries';

export const metadata = { title: 'Edit project' };
export const dynamic = 'force-dynamic';

export default async function EditProjectPage({ params }: { params: { projectId: string } }) {
  const session = await requireSession();
  try {
    const project = await getProject(session, params.projectId);
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader eyebrow="Project" title={`Edit ${project.name}`} />
        <ProjectForm
          projectId={project.id}
          initial={{
            name: project.name,
            description: project.description ?? '',
            researchQuestion: project.researchQuestion ?? '',
            status: project.status,
            tags: project.tags.join(', '),
          }}
        />
        <Card className="mt-8 p-5">
          <h2 className="text-sm font-semibold tracking-tight">Delete this project</h2>
          <p className="mt-1 text-sm text-muted">
            Removes the project and every experiment, condition, note and dataset inside it.
          </p>
          <form action={deleteProjectAction} className="mt-3">
            <input type="hidden" name="projectId" value={project.id} />
            <ConfirmSubmit
              tone="danger"
              size="sm"
              message={`Delete "${project.name}" and everything recorded inside it? This cannot be undone.`}
            >
              Delete project
            </ConfirmSubmit>
          </form>
        </Card>
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
}

import { ProtocolForm } from '@/components/simple-forms';
import { PageHeader } from '@/components/ui';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getFileForDownload, listProjects } from '@/server/queries';

export const metadata = { title: 'New protocol' };
export const dynamic = 'force-dynamic';

/** `?file=` comes from Files → “Use as a protocol”: the PDF or Word file becomes version 1. */
export default async function NewProtocolPage({ searchParams }: { searchParams: { file?: string } }) {
  const session = await requireSession();
  const projects = await listProjects(session);
  let file: { id: string; filename: string } | null = null;
  if (searchParams.file) {
    try {
      const row = await getFileForDownload(session, searchParams.file);
      file = { id: row.id, filename: row.filename };
    } catch (error) {
      if (!(error instanceof NotFoundInWorkspaceError)) throw error;
    }
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New protocol"
        description={
          file
            ? 'The file is the method. Experiments that follow it link to this exact version.'
            : 'Upload the Word or PDF your lab already uses, or write the method here. Version 1 is created automatically.'
        }
      />
      <ProtocolForm projects={projects.filter((p) => !p.isExample).map((p) => ({ id: p.id, name: p.name }))} file={file} />
    </div>
  );
}

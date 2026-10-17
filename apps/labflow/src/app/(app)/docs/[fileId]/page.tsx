import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocumentEditor } from '@/components/document-editor';
import { requireSession } from '@/server/authz';
import { readDocument } from '@/server/documents';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { listWorkspaceMembers } from '@/server/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Document' };

export default async function DocumentPage({ params }: { params: { fileId: string } }) {
  const session = await requireSession();
  let doc;
  try {
    doc = await readDocument(session, params.fileId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
  const members = await listWorkspaceMembers(session);

  return (
    <>
      <p className="mb-3 text-sm text-muted">
        <Link href="/files" className="underline-offset-2 hover:text-fg hover:underline">
          ← Files
        </Link>
      </p>
      <DocumentEditor
        id={doc.id}
        initialTitle={doc.title}
        initialBody={doc.body}
        initialUpdatedAt={doc.updatedAt ? doc.updatedAt.toISOString() : null}
        updatedByName={doc.updatedByName}
        isPrivate={doc.private}
        people={members.map((m) => ({ id: m.id, name: m.name ?? m.email, you: m.id === session.userId }))}
      />
    </>
  );
}

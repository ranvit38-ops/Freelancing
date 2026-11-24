import { notFound, redirect } from 'next/navigation';
import { ButtonLink, Card, PageHeader } from '@/components/ui';
import { formatBytes, formatDate } from '@/lib/display';
import { fileKind, previewRows } from '@/lib/file-kind';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { canExtractText, fileText } from '@/server/ai/file-text';
import { getFileForDownload } from '@/server/queries';
import { getFile } from '@/server/storage';

export const metadata = { title: 'File' };
export const dynamic = 'force-dynamic';

const READABLE = /\.(csv|tsv|xlsx)$/i;
const PROTOCOL_LIKE = /\.(pdf|docx?|odt|rtf)$/i;

/**
 * One file, shown in the page: pictures, PDFs and video as themselves, sheets
 * as a table, Word and PowerPoint as their words. Opened in its own tab from
 * every file list, so the list is still there when you close it.
 */
export default async function FilePage(props: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await props.params;
  const session = await requireSession();
  const file = await getFileForDownload(session, fileId).catch((error) => {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  });
  if (file.isDocument) redirect(`/docs/${file.id}`);
  if (!file.storageKey && file.sourceUrl) redirect(file.sourceUrl);

  const kind = fileKind(file.filename);
  const src = `/api/files/${file.id}`;
  const text =
    file.storageKey && canExtractText(file.filename) ? await fileText(file.storageKey, file.filename, getFile).catch(() => null) : null;

  let body: React.ReactNode;
  if (kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    body = <img src={src} alt={file.filename} className="mx-auto max-h-[75vh] w-auto rounded-lg" />;
  } else if (kind === 'pdf') {
    body = <iframe title={file.filename} src={src} className="h-[80vh] w-full rounded-lg bg-white" />;
  } else if (kind === 'video') {
    body = <video src={src} controls className="mx-auto max-h-[75vh] w-full rounded-lg" />;
  } else if (kind === 'table' && text) {
    const rows = previewRows(text, 60, 20);
    body = (
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i === 0 ? 'bg-raised font-semibold' : 'border-t border-line'}>
                {r.map((c, j) => (
                  <td key={j} className="whitespace-nowrap px-3 py-1.5">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">The first {rows.length} rows. Download for the whole sheet.</p>
      </div>
    );
  } else if (text) {
    body = <div className="whitespace-pre-line text-sm leading-relaxed">{text}</div>;
  } else {
    body = <p className="text-sm text-muted">This kind of file cannot be shown in the browser. Download it to open it.</p>;
  }

  return (
    <>
      <PageHeader
        back={{ href: '/files', label: 'Files' }}
        title={<span className="break-all">{file.filename}</span>}
        description={`${formatBytes(file.byteSize)} · ${formatDate(file.createdAt)}`}
        actions={
          <>
            {READABLE.test(file.filename) ? (
              <ButtonLink href={`/experiments/new?file=${file.id}`} tone="secondary">
                Make an experiment
              </ButtonLink>
            ) : null}
            {!file.private && PROTOCOL_LIKE.test(file.filename) ? (
              <ButtonLink href={`/protocols/new?file=${file.id}`} tone="secondary">
                Use as a protocol
              </ButtonLink>
            ) : null}
            <a
              href={`${src}?download=1`}
              className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover"
            >
              Download
            </a>
          </>
        }
      />
      <Card className="p-4 sm:p-6">{body}</Card>
    </>
  );
}

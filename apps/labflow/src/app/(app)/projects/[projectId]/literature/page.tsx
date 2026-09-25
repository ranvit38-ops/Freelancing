import { redirect } from 'next/navigation';

/** Literature search is off for now; an old link goes to the project instead. */
export default function LiteraturePage({ params }: { params: { projectId: string } }) {
  redirect(`/projects/${encodeURIComponent(params.projectId)}`);
}

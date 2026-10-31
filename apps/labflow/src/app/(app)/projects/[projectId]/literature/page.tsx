import { redirect } from 'next/navigation';

/** Literature search is off for now; an old link goes to the project instead. */
export default async function LiteraturePage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  redirect(`/projects/${encodeURIComponent(params.projectId)}`);
}

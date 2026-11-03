import { redirect } from 'next/navigation';

/** A project's discussion is its channel in Chat now; old links land there. */
export default async function DiscussionPage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  redirect(`/chat?c=${encodeURIComponent(params.projectId)}`);
}

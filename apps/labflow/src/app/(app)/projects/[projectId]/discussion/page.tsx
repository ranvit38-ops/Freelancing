import { redirect } from 'next/navigation';

/** A project's discussion is its channel in Chat now; old links land there. */
export default function DiscussionPage({ params }: { params: { projectId: string } }) {
  redirect(`/chat?c=${encodeURIComponent(params.projectId)}`);
}

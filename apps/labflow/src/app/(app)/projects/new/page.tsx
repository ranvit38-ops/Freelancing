import { ProjectForm } from '@/components/project-form';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'New project' };

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New project"
        description="Only a name is required. You can add the research question later."
      />
      <ProjectForm />
    </div>
  );
}

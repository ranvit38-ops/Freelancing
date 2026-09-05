'use client';

import { useFormState } from 'react-dom';
import { Badge, Card, CardHeader, EmptyState, FormError, Input } from './ui';
import { SubmitButton } from './submit-button';
import {
  saveLiteratureAction,
  searchLiteratureAction,
  type LiteratureState,
} from '@/server/actions/collab';

// Declared here, not in the action module: a "use server" file may export
// async functions only.
const emptyLiteratureState: LiteratureState = {};

/**
 * Live PubMed search. Every row is a real NCBI record — nothing here is
 * generated, and a failed lookup shows an error rather than a plausible list.
 */
export function LiteratureSearch({ projectId }: { projectId: string }) {
  const [state, action] = useFormState(searchLiteratureAction, emptyLiteratureState);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Search PubMed"
          description="Results come straight from NCBI E-utilities. Save the ones worth keeping to this project."
        />
        <form action={action} className="flex flex-wrap gap-2 px-5 py-4">
          <label htmlFor="lit-query" className="sr-only">
            Search PubMed
          </label>
          <Input
            id="lit-query"
            name="query"
            defaultValue={state.query}
            required
            placeholder="PFAS sorption granular activated carbon"
            className="min-w-0 flex-1"
          />
          <SubmitButton pendingLabel="Searching…">Search</SubmitButton>
        </form>
      </Card>

      <FormError>{state.error}</FormError>

      {state.articles ? (
        <Card>
          <CardHeader title="Results" description={`${state.articles.length} papers`} />
          {state.articles.length === 0 ? (
            <EmptyState title="No papers matched" description="Try different or broader terms." />
          ) : (
            <ul className="divide-y divide-line">
              {state.articles.map((a) => (
                <li key={a.pmid} className="px-5 py-4">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm font-medium underline underline-offset-2"
                  >
                    {a.title}
                  </a>
                  <p className="mt-1 text-xs text-muted">
                    {[a.authors, a.journal, a.year].filter(Boolean).join(' · ')}
                  </p>
                  <form action={saveLiteratureAction} className="mt-2 flex items-center gap-2">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="pmid" value={a.pmid} />
                    <input type="hidden" name="title" value={a.title} />
                    <input type="hidden" name="journal" value={a.journal ?? ''} />
                    <input type="hidden" name="year" value={a.year ?? ''} />
                    <input type="hidden" name="authors" value={a.authors ?? ''} />
                    <SubmitButton tone="secondary" size="sm" pendingLabel="Saving…">
                      Save to project
                    </SubmitButton>
                    <Badge>PMID {a.pmid}</Badge>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}

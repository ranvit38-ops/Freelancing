import { Card, CardHeader } from './ui';
import { completenessMessage, type CompletenessReport } from '@/lib/completeness';

const dot = {
  documented: { className: 'bg-ok', label: 'Documented' },
  incomplete: { className: 'bg-warn', label: 'Incomplete' },
  missing: { className: 'bg-danger', label: 'Missing' },
} as const;

/**
 * A documentation checklist, not a reproducibility guarantee — the wording
 * here is deliberate and should not be softened into "reproducible".
 */
export function CompletenessPanel({ report }: { report: CompletenessReport }) {
  return (
    <Card>
      <CardHeader
        title="Record completeness"
        description={`${report.score}% of the checklist documented`}
      />
      <ul className="divide-y divide-line">
        {report.categories.map((category) => (
          <li key={category.key} className="flex items-start gap-3 px-5 py-2.5">
            <span
              aria-hidden
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[category.state].className}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{category.label}</span>
              {category.state !== 'documented' && category.hint ? (
                <span className="mt-0.5 block text-xs text-muted">{category.hint}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-xs text-subtle">{dot[category.state].label}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-line px-5 py-3">
        <p className="text-sm text-muted">{completenessMessage(report)}</p>
        <p className="mt-1.5 text-xs text-subtle">
          This checks whether information is written down. It does not verify that the work is
          correct or that the experiment is reproducible.
        </p>
      </div>
    </Card>
  );
}

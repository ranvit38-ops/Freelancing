'use client';

import { useState } from 'react';

export type Member = { id: string; name: string | null; email: string };
export type AudienceKind = 'everyone' | 'people' | 'me';

/**
 * Who a file is for: the whole lab, chosen people, or only me.
 *
 * Renders plain form fields (audience, shareWith) so it works inside a
 * server-action form and inside a fetch upload alike.
 */
export function AudiencePicker({
  members,
  value,
  onChange,
  chosen,
  onChoose,
}: {
  members: Member[];
  value: AudienceKind;
  onChange: (value: AudienceKind) => void;
  chosen: string[];
  onChoose: (ids: string[]) => void;
}) {
  const options: { value: AudienceKind; label: string; hint: string }[] = [
    { value: 'everyone', label: 'Everyone in the lab', hint: 'Posted in #lab so people see it' },
    { value: 'people', label: 'Chosen people', hint: 'Sent to them as a direct message' },
    { value: 'me', label: 'Only me', hint: 'Private, nobody is told' },
  ];
  return (
    <fieldset className="space-y-2 text-sm">
      <legend className="mb-1 text-xs font-medium text-muted">Who is it for?</legend>
      <input type="hidden" name="audience" value={value} />
      <div className="grid gap-1.5 sm:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-lg border px-3 py-2 transition-colors ${
              value === o.value ? 'border-accent bg-accent/5' : 'border-line hover:bg-raised'
            }`}
          >
            <input
              type="radio"
              name="audience-choice"
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="block font-medium">{o.label}</span>
            <span className="block text-xs text-muted">{o.hint}</span>
          </label>
        ))}
      </div>
      {value === 'people' ? (
        members.length === 0 ? (
          <p className="text-xs text-muted">Nobody else is in the lab yet. Share the join link from People first.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = chosen.includes(m.id);
              return (
                <label
                  key={m.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${
                    on ? 'border-accent bg-accent/10 font-medium text-accent' : 'border-line hover:bg-raised'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="shareWith"
                    value={m.id}
                    checked={on}
                    onChange={() => onChoose(on ? chosen.filter((id) => id !== m.id) : [...chosen, m.id])}
                    className="sr-only"
                  />
                  {m.name || m.email}
                </label>
              );
            })}
          </div>
        )
      ) : null}
    </fieldset>
  );
}

/** Small state holder, so each form using the picker is one line. */
export function useAudience(initial: AudienceKind = 'everyone', initialChosen: string[] = []) {
  const [value, setValue] = useState<AudienceKind>(initial);
  const [chosen, setChosen] = useState<string[]>(initialChosen);
  return { value, setValue, chosen, setChosen };
}

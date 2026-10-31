'use client';

import type { ComponentProps } from 'react';

/**
 * A select that saves the moment you change it.
 *
 * Handing a task to someone was pick-a-name-then-press-Assign: two actions
 * for one decision, and people picked the name and walked away. The form still
 * posts normally, so this works with the same server action as before.
 */
export function AutoSubmitSelect(props: ComponentProps<'select'>) {
  return (
    <select
      {...props}
      onChange={(event) => {
        props.onChange?.(event);
        event.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

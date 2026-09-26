'use client';

import { useFormStatus } from 'react-dom';
import { Button } from './ui';
import type { ComponentProps } from 'react';

/** Disables itself and swaps its label while its form is submitting. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" aria-busy={pending} disabled={pending} {...props}>
      {pending ? (pendingLabel ?? 'Working…') : children}
    </Button>
  );
}

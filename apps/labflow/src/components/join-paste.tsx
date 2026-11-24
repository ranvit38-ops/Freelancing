'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { joinPathFromPaste } from '@/lib/join-paste';
import { Button, Input } from './ui';

/**
 * For someone who was sent a join link but ended up here instead of opening
 * it. Without this, a student who went straight to "sign up" had to start a
 * lab of their own, and then wondered why their PI's records were missing.
 */
export function JoinPaste({ id = 'join-paste' }: { id?: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const path = joinPathFromPaste(value);
        if (!path) {
          setError('That does not look like a join link. Copy the whole link your lab sent you and paste it here.');
          return;
        }
        router.push(path);
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        Paste the link your lab sent you
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          placeholder="https://…/join?code=…"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-w-0 flex-1"
        />
        <Button type="submit" tone="secondary" disabled={!value.trim()} data-join-paste>
          Join
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

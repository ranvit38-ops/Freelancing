'use client';

import { useState } from 'react';
import { testAiConnectionAction } from '@/server/actions/ai-key';
import { Button } from './ui';

/** Sends one tiny real request to Claude and says whether it worked. */
export function AiTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        tone="secondary"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setResult(null);
          setResult(await testAiConnectionAction().catch(() => ({ ok: false, message: 'Could not reach the server. Try again.' })));
          setBusy(false);
        }}
      >
        {busy ? 'Checking…' : 'Test the AI connection'}
      </Button>
      {result ? (
        <p role="status" className={result.ok ? 'text-sm text-ok' : 'text-sm text-danger'}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

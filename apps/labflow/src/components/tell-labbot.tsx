'use client';

import { OPEN_LABBOT_EVENT, type OpenLabBotDetail } from './labbot-panel';
import { Button } from './ui';

/** The shortest way to record something: say it, and LabBot fills it in. */
export function TellLabBot() {
  return (
    <Button
      type="button"
      tone="secondary"
      onClick={() =>
        window.dispatchEvent(new CustomEvent<OpenLabBotDetail>(OPEN_LABBOT_EVENT, { detail: { mode: 'fill' } }))
      }
    >
      Just tell LabBot
    </Button>
  );
}

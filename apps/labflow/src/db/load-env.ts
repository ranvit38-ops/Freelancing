/**
 * Loads .env.local for scripts run outside `next dev`.
 *
 * Next loads .env.local itself, so the app never needs this. `npm run db:push`
 * and `npm run db:seed` are plain node, and without this they fail with
 * "DATABASE_URL: Required" even though the file sits right there. Importing
 * this first is enough; it is a no-op when the variable is already set.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', {
  info: () => {},
  error: console.error,
});

import type { SoftwareAdapter } from "./types";
import { MockAdapter } from "./mock";

/**
 * Adapter factory — the single place that decides which client integration is
 * active. Selected via the SOFTWARE_ADAPTER env var (defaults to "mock").
 *
 * To add a real integration:
 *   1. Implement SoftwareAdapter in ./<vendor>.ts (e.g. ./hubspot.ts).
 *   2. Add a case below.
 *   3. Set SOFTWARE_ADAPTER=<vendor> and the vendor's credentials in .env.
 *
 * We intentionally do NOT ship a fake vendor adapter. Without real API docs,
 * any "vendor" implementation would be a lie. Keep mock until docs exist.
 */
let cached: SoftwareAdapter | null = null;

export function getSoftwareAdapter(): SoftwareAdapter {
  if (cached) return cached;

  const choice = (process.env.SOFTWARE_ADAPTER ?? "mock").toLowerCase();

  switch (choice) {
    // SETUP REQUIRED: add real client adapters here once you have API docs.
    // case "hubspot":
    //   cached = new HubspotAdapter();
    //   break;
    case "mock":
    default:
      cached = new MockAdapter();
      break;
  }

  return cached;
}

export type { SoftwareAdapter } from "./types";
export type { Lead, LeadResult, OrderEvent, OrderResult } from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SOFTWARE ADAPTER — typed boundary for "connect to the client's software".
 * ─────────────────────────────────────────────────────────────────────────
 *
 * HONEST NOTE: There is no universal "their software" API. Every client's
 * CRM / scheduler / inventory / ERP is different, and many have no public,
 * documented API at all. So this cannot be templated end-to-end.
 *
 * What IS templated: this stable interface. The rest of the app (e.g. the
 * contact route forwarding a lead) depends ONLY on `SoftwareAdapter`, never on
 * a concrete vendor. To integrate a real system:
 *
 *   1. Get the client's API docs + credentials.
 *   2. Create src/software-adapter/<vendor>.ts implementing SoftwareAdapter.
 *   3. Wire it up in src/software-adapter/index.ts behind an env switch.
 *
 * Until then, the MockAdapter keeps the site fully runnable and logs what it
 * *would* have sent — it never pretends a real system received the data.
 */

export interface Lead {
  name: string;
  email: string;
  message: string;
  source: string; // e.g. "website-contact-form"
  createdAt: string; // ISO 8601
  metadata?: Record<string, string | number | boolean>;
}

export interface LeadResult {
  /** true only if a real downstream system accepted the lead. */
  delivered: boolean;
  /** Identifier returned by the downstream system, if any. */
  externalId?: string;
  /** Which adapter handled it — useful for honest logging/debugging. */
  adapter: string;
}

export interface OrderEvent {
  orderId: string;
  email: string;
  amountTotal: number; // smallest currency unit (e.g. cents)
  currency: string;
  items: Array<{ priceId: string; quantity: number }>;
  createdAt: string;
}

export interface OrderResult {
  recorded: boolean;
  externalId?: string;
  adapter: string;
}

/**
 * The contract every client integration implements. Add methods here only when
 * they're genuinely cross-client; vendor-specific calls stay in the vendor file.
 */
export interface SoftwareAdapter {
  /** Human-readable adapter name, surfaced in logs. */
  readonly name: string;

  /** Push a new lead/contact into the client's CRM or similar. */
  createLead(lead: Lead): Promise<LeadResult>;

  /** Record a completed order/purchase (called from the Stripe webhook). */
  recordOrder(order: OrderEvent): Promise<OrderResult>;

  /** Cheap health/connectivity check used by diagnostics. */
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}

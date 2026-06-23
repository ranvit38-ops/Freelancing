import type {
  Lead,
  LeadResult,
  OrderEvent,
  OrderResult,
  SoftwareAdapter,
} from "./types";

/**
 * MockAdapter — the default, no-integration implementation.
 *
 * It is deliberately HONEST: it logs what would have been sent and returns
 * `delivered: false` / `recorded: false`, so nothing downstream (or the
 * client) is misled into thinking a real CRM received the data. Lead delivery
 * still works overall because the contact route also emails the business via
 * Resend; the adapter is an *additional* sink, not the only one.
 */
export class MockAdapter implements SoftwareAdapter {
  readonly name = "mock";

  async createLead(lead: Lead): Promise<LeadResult> {
    console.info(
      `[software-adapter:mock] Would create lead in client CRM →`,
      JSON.stringify({ name: lead.name, email: lead.email, source: lead.source })
    );
    return { delivered: false, adapter: this.name };
  }

  async recordOrder(order: OrderEvent): Promise<OrderResult> {
    console.info(
      `[software-adapter:mock] Would record order in client system →`,
      JSON.stringify({ orderId: order.orderId, email: order.email, amountTotal: order.amountTotal })
    );
    return { recorded: false, adapter: this.name };
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    return {
      ok: true,
      detail:
        "Mock adapter active — no real client system is connected. " +
        "Implement a real adapter once API docs are available (see software-adapter/README.md).",
    };
  }
}

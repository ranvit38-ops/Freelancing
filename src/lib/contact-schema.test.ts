import { describe, it, expect } from "vitest";
import { contactSchema } from "@/lib/contact-schema";

describe("contactSchema", () => {
  const valid = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    message: "I'd like to discuss a new project with your team.",
    company: "",
  };

  it("accepts a well-formed submission", () => {
    expect(contactSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const r = contactSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(r.success).toBe(false);
  });

  it("rejects a too-short message", () => {
    const r = contactSchema.safeParse({ ...valid, message: "hi" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing name", () => {
    const r = contactSchema.safeParse({ ...valid, name: "" });
    expect(r.success).toBe(false);
  });

  it("accepts a filled honeypot at the schema level (enforced in the route)", () => {
    // The schema must NOT reject this — otherwise a legit user whose browser
    // autofills the hidden field would be blocked. The API route drops it.
    const r = contactSchema.safeParse({ ...valid, company: "Spammer Inc" });
    expect(r.success).toBe(true);
  });
});

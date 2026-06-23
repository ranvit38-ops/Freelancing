import { z } from "zod";

/**
 * Shared contact-form schema — used by React Hook Form on the client AND
 * re-validated on the server route.
 *
 * `company` is a honeypot: it's visually hidden, so real users never fill it,
 * but naive bots do. We intentionally let the schema ACCEPT any value here and
 * enforce the honeypot in the API route (a filled value => silently dropped
 * with a fake success). Rejecting it at the schema level would (a) make the
 * route's honeypot handling dead code and (b) risk blocking a legitimate user
 * whose browser/password-manager autofills the hidden field.
 */
export const contactSchema = z.object({
  name: z.string().min(1, "Please enter your name").max(120),
  email: z.string().email("Please enter a valid email"),
  message: z.string().min(10, "Please share a few more details").max(5000),
  // Honeypot — enforced in the API route, not here. See note above.
  company: z.string().max(200).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;

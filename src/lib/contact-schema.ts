import { z } from "zod";

/**
 * Shared contact-form schema — used by React Hook Form on the client AND
 * re-validated on the server route. The `company` field is a honeypot: real
 * users never see it, bots fill it in. A non-empty value => silently dropped.
 */
export const contactSchema = z.object({
  name: z.string().min(1, "Please enter your name").max(120),
  email: z.string().email("Please enter a valid email"),
  message: z.string().min(10, "Please share a few more details").max(5000),
  // Honeypot — must stay empty.
  company: z.string().max(0).optional().or(z.literal("")),
});

export type ContactInput = z.infer<typeof contactSchema>;

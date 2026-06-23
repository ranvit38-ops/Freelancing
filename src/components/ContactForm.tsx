"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { contactSchema, type ContactInput } from "@/lib/contact-schema";

/**
 * Accessible contact form with client-side validation (React Hook Form + Zod)
 * that posts to /api/contact. Includes a hidden honeypot ("company") for spam.
 * Errors are announced via aria-live; fields are labelled and keyboard usable.
 */
export function ContactForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({ resolver: zodResolver(contactSchema) });

  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [serverMsg, setServerMsg] = useState("");

  async function onSubmit(values: ContactInput) {
    setStatus("idle");
    setServerMsg("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not send your message.");
      setStatus("ok");
      reset();
    } catch (err) {
      setStatus("error");
      setServerMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
          className="mt-1 w-full rounded-brand border border-border bg-bg px-3 py-2 text-fg focus:border-brand"
          {...register("name")}
        />
        {errors.name && (
          <p id="name-error" className="mt-1 text-sm text-red-600">
            {errors.name.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="mt-1 w-full rounded-brand border border-border bg-bg px-3 py-2 text-fg focus:border-brand"
          {...register("email")}
        />
        {errors.email && (
          <p id="email-error" className="mt-1 text-sm text-red-600">
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium">
          Message
        </label>
        <textarea
          id="message"
          rows={5}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "message-error" : undefined}
          className="mt-1 w-full rounded-brand border border-border bg-bg px-3 py-2 text-fg focus:border-brand"
          {...register("message")}
        />
        {errors.message && (
          <p id="message-error" className="mt-1 text-sm text-red-600">
            {errors.message.message}
          </p>
        )}
      </div>

      {/* Honeypot: visually hidden, off-screen, not announced. Bots fill it in. */}
      <div className="absolute left-[-9999px]" aria-hidden="true">
        <label htmlFor="company">Company (leave blank)</label>
        <input id="company" type="text" tabIndex={-1} autoComplete="off" {...register("company")} />
      </div>

      <button type="submit" disabled={isSubmitting} className="btn-primary disabled:opacity-60">
        {isSubmitting ? "Sending…" : "Send message"}
      </button>

      <div aria-live="polite" className="min-h-[1.5rem]">
        {status === "ok" && (
          <p className="text-sm text-green-700">Thanks! Your message has been sent.</p>
        )}
        {status === "error" && <p className="text-sm text-red-600">{serverMsg}</p>}
      </div>
    </form>
  );
}

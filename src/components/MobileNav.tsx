"use client";

import { useState } from "react";
import Link from "next/link";
import type { NavItem } from "@/lib/site-config.schema";

/** Accessible mobile nav: toggle button + disclosure menu, keyboard friendly. */
export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        className="btn-secondary px-3 py-2"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>

      {open && (
        <div
          id="mobile-menu"
          className="absolute left-0 right-0 top-16 border-b border-border bg-bg shadow-lg"
        >
          <nav aria-label="Mobile" className="container-page py-4">
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-brand px-3 py-3 text-base font-medium text-fg/90 hover:bg-surface"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}

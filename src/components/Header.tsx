import Link from "next/link";
import Image from "next/image";
import site from "@/site.config";
import { MobileNav } from "./MobileNav";
import { visibleNav } from "@/lib/nav";

/**
 * Header — logo, primary nav, and a CTA, all sourced from site.config.ts.
 * Nav items pointing at disabled features are filtered out (see lib/nav.ts).
 */
export function Header() {
  const items = visibleNav();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2" aria-label={`${site.company.name} home`}>
          {/* next/image with width/height avoids layout shift; logo path from config. */}
          <Image
            src={site.company.logo}
            alt={`${site.company.name} logo`}
            width={140}
            height={32}
            className="h-8 w-auto"
            priority
          />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-brand px-3 py-2 text-sm font-medium text-fg/80 transition hover:bg-surface hover:text-fg"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {site.features.booking ? (
            <Link href="/booking" className="btn-primary">
              {site.home.hero.secondaryCta?.label ?? "Book a call"}
            </Link>
          ) : (
            <Link href="/contact" className="btn-primary">
              Get in touch
            </Link>
          )}
        </div>

        <MobileNav items={items} />
      </div>
    </header>
  );
}

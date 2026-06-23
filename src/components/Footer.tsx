import Link from "next/link";
import site from "@/site.config";
import { visibleNav } from "@/lib/nav";
import { SocialLinks } from "./SocialLinks";

/** Footer — contact details, nav, social, and legal links, all from config. */
export function Footer() {
  const year = new Date().getFullYear();
  const items = visibleNav();
  const addr = site.contact.address;

  return (
    <footer className="border-t border-border bg-surface">
      <div className="container-page grid gap-8 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="text-lg font-bold">{site.company.name}</p>
          <p className="mt-2 max-w-sm text-sm text-muted">{site.company.tagline}</p>
          <div className="mt-4">
            <SocialLinks />
          </div>
        </div>

        <nav aria-label="Footer">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Site</p>
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-sm text-fg/80 hover:text-fg">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Contact</p>
          <ul className="mt-3 space-y-2 text-sm text-fg/80">
            <li>
              <a className="hover:text-fg" href={`mailto:${site.contact.email}`}>
                {site.contact.email}
              </a>
            </li>
            {site.contact.phone && (
              <li>
                {/* tel: click-to-call link, number from config. */}
                <a className="hover:text-fg" href={`tel:${site.contact.phone.replace(/[^\d+]/g, "")}`}>
                  {site.contact.phone}
                </a>
              </li>
            )}
            {addr && (
              <li className="not-italic text-muted">
                {addr.line1}
                {addr.line2 ? `, ${addr.line2}` : ""}
                <br />
                {addr.city}, {addr.region} {addr.postalCode}
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-4 text-xs text-muted sm:flex-row">
          <p>
            © {year} {site.company.legalName}. All rights reserved.
          </p>
          <div className="flex gap-4">
            <Link href={site.legal.privacyUrl} className="hover:text-fg">
              Privacy
            </Link>
            <Link href={site.legal.termsUrl} className="hover:text-fg">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

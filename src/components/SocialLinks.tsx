import site from "@/site.config";

/**
 * Renders social links from config. Uses text labels (not icon fonts) so it
 * works without extra dependencies and stays accessible; swap in real SVG
 * icons per brand if desired.
 */
const LABELS: Record<string, string> = {
  twitter: "Twitter",
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  github: "GitHub",
};

export function SocialLinks() {
  if (site.social.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-3">
      {site.social.map((s) => (
        <li key={s.url}>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-brand border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg/80 hover:text-fg"
          >
            {LABELS[s.platform] ?? s.platform}
          </a>
        </li>
      ))}
    </ul>
  );
}

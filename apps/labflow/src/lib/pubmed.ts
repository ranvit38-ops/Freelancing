/**
 * PubMed search via NCBI E-utilities.
 *
 * Public API, no key required — an api_key only raises the rate limit from 3
 * to 10 requests/second, so it stays optional. Two calls: esearch returns
 * PMIDs, esummary turns them into records.
 *
 * Results are real citations from NCBI. They are never generated, and the AI
 * layer is told to cite only PMIDs it was handed here.
 */

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export type Article = {
  pmid: string;
  title: string;
  journal: string | null;
  year: string | null;
  authors: string | null;
  url: string;
};

export class PubMedError extends Error {}

type ESearch = { esearchresult?: { idlist?: string[] } };
type ESummary = {
  result?: Record<string, unknown> & { uids?: string[] };
};

export function articleUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

/** Turns one esummary record into an Article, tolerating missing fields. */
export function toArticle(pmid: string, raw: unknown): Article | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.replace(/\s+/g, ' ').trim() : '';
  if (!title) return null;

  const authorList = Array.isArray(r.authors)
    ? (r.authors as { name?: string }[]).map((a) => a.name).filter(Boolean)
    : [];
  const authors =
    authorList.length === 0
      ? null
      : authorList.length > 3
        ? `${authorList.slice(0, 3).join(', ')} et al.`
        : authorList.join(', ');

  const pubdate = typeof r.pubdate === 'string' ? r.pubdate : '';

  return {
    pmid,
    title,
    journal: typeof r.source === 'string' && r.source ? r.source : null,
    year: pubdate.match(/\d{4}/)?.[0] ?? null,
    authors,
    url: articleUrl(pmid),
  };
}

export async function searchPubMed(
  query: string,
  options: { limit?: number; fetchImpl?: typeof fetch } = {},
): Promise<Article[]> {
  const term = query.trim();
  if (term.length < 3) return [];
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 25);
  const doFetch = options.fetchImpl ?? fetch;
  const key = process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : '';

  const searchRes = await doFetch(
    `${BASE}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${limit}&term=${encodeURIComponent(term)}${key}`,
  );
  if (!searchRes.ok) throw new PubMedError(`PubMed search failed (${searchRes.status}).`);
  const ids = ((await searchRes.json()) as ESearch).esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const summaryRes = await doFetch(
    `${BASE}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}${key}`,
  );
  if (!summaryRes.ok) throw new PubMedError(`PubMed lookup failed (${summaryRes.status}).`);
  const result = ((await summaryRes.json()) as ESummary).result ?? {};

  // Preserve NCBI's relevance order rather than object key order.
  return ids
    .map((pmid) => toArticle(pmid, result[pmid]))
    .filter((a): a is Article => a !== null);
}

/** Compact rendering handed to the model — one line per citation. */
export function renderArticles(articles: Article[]): string {
  if (articles.length === 0) return 'No literature was retrieved for this question.';
  return articles
    .map((a) => `PMID ${a.pmid} — ${a.title} (${a.authors ?? 'unknown authors'}, ${a.journal ?? 'unknown journal'}, ${a.year ?? 'n.d.'})`)
    .join('\n');
}

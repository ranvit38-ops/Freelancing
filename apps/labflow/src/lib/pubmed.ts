/**
 * PubMed search via NCBI E-utilities.
 *
 * Public API, no key required, an api_key only raises the rate limit from 3
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

/**
 * What went wrong, for a researcher rather than for a log.
 *
 * A bare status code reads as "you broke something". Every one of these is
 * NCBI or the network, never the person's search, and saying so stops them
 * retyping a query that was fine.
 */
function pubmedFailure(what: string, status: number): PubMedError {
  if (status === 429) {
    return new PubMedError(
      'PubMed is rate limiting us. Wait a few seconds and search again. Setting NCBI_API_KEY raises the limit.',
    );
  }
  if (status >= 500) {
    return new PubMedError('PubMed is having trouble at its end. Try again in a moment.');
  }
  return new PubMedError(
    `PubMed could not be reached (${what} returned ${status}). Nothing is wrong with your search.`,
  );
}

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
  if (!searchRes.ok) throw pubmedFailure('the search', searchRes.status);
  const ids = ((await searchRes.json()) as ESearch).esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const summaryRes = await doFetch(
    `${BASE}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}${key}`,
  );
  if (!summaryRes.ok) throw pubmedFailure('the record lookup', summaryRes.status);
  const result = ((await summaryRes.json()) as ESummary).result ?? {};

  // Preserve NCBI's relevance order rather than object key order.
  return ids
    .map((pmid) => toArticle(pmid, result[pmid]))
    .filter((a): a is Article => a !== null);
}

/** Compact rendering handed to the model, one line per citation. */
export function renderArticles(articles: Article[]): string {
  if (articles.length === 0) return 'No literature was retrieved for this question.';
  return articles
    .map((a) => `PMID ${a.pmid}: ${a.title} (${a.authors ?? 'unknown authors'}, ${a.journal ?? 'unknown journal'}, ${a.year ?? 'n.d.'})`)
    .join('\n');
}

/**
 * Abstracts for saved papers.
 *
 * esummary has no abstract, so this is efetch, which returns XML rather than
 * JSON. A tolerant extraction is the right shape here: a missing abstract is
 * normal (many records have none), and a parse that returns nothing must
 * degrade to "we have the citation but not the text", never to an error that
 * loses the citation.
 */
export async function fetchAbstracts(
  pmids: string[],
  options: { fetchImpl?: typeof fetch } = {},
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = pmids.filter((id) => /^\d+$/.test(id));
  if (ids.length === 0) return out;

  const doFetch = options.fetchImpl ?? fetch;
  const key = process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : '';
  const response = await doFetch(
    `${BASE}/efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&id=${ids.join(',')}${key}`,
  );
  if (!response.ok) throw pubmedFailure('the abstract lookup', response.status);
  const xml = await response.text();

  for (const article of xml.split('<PubmedArticle>').slice(1)) {
    const pmid = /<PMID[^>]*>(\d+)<\/PMID>/.exec(article)?.[1];
    if (!pmid) continue;
    const parts = [...article.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)].map((m) =>
      stripXml(m[1] ?? ''),
    );
    const text = parts.filter(Boolean).join('\n\n').trim();
    if (text) out.set(pmid, text);
  }
  return out;
}

/** Removes inline markup and decodes the handful of entities NCBI emits. */
function stripXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

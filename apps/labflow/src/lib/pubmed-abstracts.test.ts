import { describe, expect, it } from 'vitest';
import { PubMedError, fetchAbstracts } from './pubmed';

/** The shape efetch actually returns, trimmed to what the parser reads. */
const XML = `<?xml version="1.0"?>
<PubmedArticleSet>
<PubmedArticle>
  <MedlineCitation>
    <PMID Version="1">31452104</PMID>
    <Article>
      <Abstract>
        <AbstractText Label="BACKGROUND">PFAS persist in <i>groundwater</i>.</AbstractText>
        <AbstractText Label="RESULTS">Removal reached 94 &amp; 96 percent.</AbstractText>
      </Abstract>
    </Article>
  </MedlineCitation>
</PubmedArticle>
<PubmedArticle>
  <MedlineCitation>
    <PMID Version="1">28123456</PMID>
    <Article><ArticleTitle>No abstract here</ArticleTitle></Article>
  </MedlineCitation>
</PubmedArticle>
</PubmedArticleSet>`;

const ok = (body: string) =>
  (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

describe('fetchAbstracts', () => {
  it('joins the labelled sections of one abstract', async () => {
    const map = await fetchAbstracts(['31452104'], { fetchImpl: ok(XML) });
    expect(map.get('31452104')).toBe(
      'PFAS persist in groundwater.\n\nRemoval reached 94 & 96 percent.',
    );
  });

  it('omits a record that has no abstract rather than storing an empty one', async () => {
    const map = await fetchAbstracts(['31452104', '28123456'], { fetchImpl: ok(XML) });
    expect(map.has('28123456')).toBe(false);
  });

  it('never calls out for a non-numeric id', async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    const map = await fetchAbstracts(['../../etc/passwd', ''], { fetchImpl: spy });
    expect(called).toBe(false);
    expect(map.size).toBe(0);
  });

  it('raises rather than silently returning nothing when NCBI errors', async () => {
    const bad = (async () => new Response('', { status: 502 })) as unknown as typeof fetch;
    await expect(fetchAbstracts(['31452104'], { fetchImpl: bad })).rejects.toBeInstanceOf(
      PubMedError,
    );
  });
});

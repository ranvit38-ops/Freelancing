import { describe, expect, it } from 'vitest';
import { PubMedError, renderArticles, searchPubMed, toArticle } from './pubmed';

/** Shapes copied from real NCBI E-utilities JSON responses. */
const ESEARCH = { esearchresult: { idlist: ['38000001', '37000002'] } };
const ESUMMARY = {
  result: {
    uids: ['38000001', '37000002'],
    '38000001': {
      title: 'Sorption of PFOA onto granular activated carbon',
      source: 'Environ Sci Technol',
      pubdate: '2024 Mar 12',
      authors: [{ name: 'Okafor J' }, { name: 'Tanaka R' }, { name: 'Marsh E' }, { name: 'Silva P' }],
    },
    '37000002': { title: 'Anion exchange resins for PFAS removal', source: 'Water Res', pubdate: '2023' },
  },
};

const stub = (bodies: unknown[]): typeof fetch => {
  let call = 0;
  return (async () => new Response(JSON.stringify(bodies[call++]), { status: 200 })) as unknown as typeof fetch;
};

describe('toArticle', () => {
  it('abbreviates author lists past three names', () => {
    expect(toArticle('38000001', ESUMMARY.result['38000001'])?.authors).toBe(
      'Okafor J, Tanaka R, Marsh E et al.',
    );
  });

  it('extracts the year from a free-form pubdate', () => {
    expect(toArticle('38000001', ESUMMARY.result['38000001'])?.year).toBe('2024');
  });

  it('tolerates a record with no authors', () => {
    const a = toArticle('37000002', ESUMMARY.result['37000002']);
    expect(a?.authors).toBeNull();
    expect(a?.journal).toBe('Water Res');
  });

  it('drops a record with no title rather than inventing one', () => {
    expect(toArticle('1', { source: 'X' })).toBeNull();
    expect(toArticle('1', null)).toBeNull();
  });
});

describe('searchPubMed', () => {
  it('returns articles in NCBI relevance order, not object key order', async () => {
    const out = await searchPubMed('PFAS sorption', { fetchImpl: stub([ESEARCH, ESUMMARY]) });
    expect(out.map((a) => a.pmid)).toEqual(['38000001', '37000002']);
    expect(out[0]?.url).toBe('https://pubmed.ncbi.nlm.nih.gov/38000001/');
  });

  it('returns nothing for a too-short query without calling out', async () => {
    let called = false;
    const spy = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    expect(await searchPubMed('ab', { fetchImpl: spy })).toEqual([]);
    expect(called).toBe(false);
  });

  it('returns an empty list when PubMed finds nothing', async () => {
    const out = await searchPubMed('zzzz nothing', {
      fetchImpl: stub([{ esearchresult: { idlist: [] } }]),
    });
    expect(out).toEqual([]);
  });

  it('throws rather than returning fabricated citations on an API error', async () => {
    const bad = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    await expect(searchPubMed('PFAS', { fetchImpl: bad })).rejects.toBeInstanceOf(PubMedError);
  });
});

describe('renderArticles', () => {
  it('says plainly when nothing was retrieved', () => {
    expect(renderArticles([])).toContain('No literature was retrieved');
  });

  it('renders one citation per line with its PMID', async () => {
    const out = renderArticles(await searchPubMed('PFAS', { fetchImpl: stub([ESEARCH, ESUMMARY]) }));
    expect(out.split('\n')).toHaveLength(2);
    expect(out).toContain('PMID 38000001');
  });
});

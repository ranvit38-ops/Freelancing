import { describe, expect, it } from 'vitest';
import { InvalidLinkError, googleFileId, parseLink } from './links';

describe('parseLink', () => {
  it('recognises a Google Drive file link', () => {
    const info = parseLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/view?usp=sharing');
    expect(info.provider).toBe('google-drive');
    // /file/d/<id>/view carries no real name — fall back to a provider label.
    expect(info.suggestedName).toBe('Google Drive item');
  });

  it('recognises Docs, Dropbox and SharePoint', () => {
    expect(parseLink('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrS/edit').provider).toBe('google-docs');
    const dropbox = parseLink('https://www.dropbox.com/s/abc/run.csv');
    expect(dropbox.provider).toBe('dropbox');
    expect(dropbox.suggestedName).toBe('run.csv');
    expect(parseLink('https://contoso.sharepoint.com/x/run.xlsx').provider).toBe('onedrive');
  });

  it('falls back to "web" for anything else', () => {
    const info = parseLink('https://example.org/data/breakthrough-curve.csv');
    expect(info.provider).toBe('web');
    expect(info.suggestedName).toBe('breakthrough curve.csv');
  });

  it('rejects non-URLs and non-http schemes', () => {
    expect(() => parseLink('just some text')).toThrow(InvalidLinkError);
    expect(() => parseLink('ftp://files.example.org/x')).toThrow(InvalidLinkError);
    expect(() => parseLink('javascript:alert(1)')).toThrow(InvalidLinkError);
  });

  it('names the host when the path carries nothing readable', () => {
    expect(parseLink('https://example.org/').suggestedName).toBe('example.org');
  });
});

describe('googleFileId', () => {
  it('reads the id from both Drive link shapes', () => {
    expect(googleFileId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrS/view')).toBe('1AbCdEfGhIjKlMnOpQrS');
    expect(googleFileId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrS')).toBe('1AbCdEfGhIjKlMnOpQrS');
  });

  it('returns null when there is no id', () => {
    expect(googleFileId('https://drive.google.com/')).toBeNull();
  });
});

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

describe('video links', () => {
  it('recognises YouTube in every shape people paste', async () => {
    const { youTubeId, parseLink } = await import('./links');
    expect(youTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseLink('https://youtu.be/dQw4w9WgXcQ').provider).toBe('youtube');
  });

  it('returns no id for a YouTube URL that names no video', async () => {
    const { youTubeId } = await import('./links');
    expect(youTubeId('https://www.youtube.com/')).toBeNull();
    expect(youTubeId('not a url')).toBeNull();
  });

  it('builds a privacy-preserving embed URL, and none for a plain link', async () => {
    const { embedUrl } = await import('./links');
    expect(embedUrl('https://youtu.be/dQw4w9WgXcQ', 'youtube')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(embedUrl('https://vimeo.com/76979871', 'vimeo')).toBe(
      'https://player.vimeo.com/video/76979871',
    );
    expect(embedUrl('https://drive.google.com/file/d/abc/view', 'google-drive')).toBeNull();
  });
});

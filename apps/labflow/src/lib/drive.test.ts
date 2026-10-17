import { describe, expect, it } from 'vitest';
import { driveAppId, driveExport, importedName, isUnimportable } from './drive';

describe('Google Drive import', () => {
  it('exports Google formats to the Office file LabLedger can read', () => {
    expect(driveExport('application/vnd.google-apps.spreadsheet')?.ext).toBe('xlsx');
    expect(importedName('Plate reader run 4', 'application/vnd.google-apps.spreadsheet')).toBe('Plate reader run 4.xlsx');
    expect(importedName('paper.pdf', 'application/pdf')).toBe('paper.pdf');
  });

  it('refuses folders and forms rather than importing nothing', () => {
    expect(isUnimportable('application/vnd.google-apps.folder')).toBe(true);
    expect(isUnimportable('application/vnd.google-apps.document')).toBe(false);
    expect(isUnimportable('image/png')).toBe(false);
  });

  it('reads the project number off the OAuth client id', () => {
    expect(driveAppId('123456789012-abc.apps.googleusercontent.com')).toBe('123456789012');
    expect(driveAppId(undefined)).toBeNull();
  });
});

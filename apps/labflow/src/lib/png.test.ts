import { describe, expect, it } from 'vitest';
import { Canvas, crc32, encodePng } from './png';
import { renderChartPng } from './chart-image';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('crc32', () => {
  it('matches the known CRC of a reference string', () => {
    // The standard CRC-32 of "123456789" is 0xCBF43926.
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
});

describe('encodePng', () => {
  it('writes a signature, IHDR, IDAT and IEND', () => {
    const png = encodePng(2, 2, new Uint8Array(2 * 2 * 4).fill(255));
    expect(png.subarray(0, 8)).toEqual(SIGNATURE);
    expect(png.includes(Buffer.from('IHDR'))).toBe(true);
    expect(png.includes(Buffer.from('IDAT'))).toBe(true);
    expect(png.includes(Buffer.from('IEND'))).toBe(true);
  });

  it('records the dimensions in the header', () => {
    const png = encodePng(7, 3, new Uint8Array(7 * 3 * 4));
    const ihdr = png.indexOf(Buffer.from('IHDR')) + 4;
    expect(png.readUInt32BE(ihdr)).toBe(7);
    expect(png.readUInt32BE(ihdr + 4)).toBe(3);
  });

  it('rejects a pixel buffer of the wrong size', () => {
    expect(() => encodePng(2, 2, new Uint8Array(4))).toThrow();
  });
});

describe('Canvas', () => {
  it('ignores drawing outside its bounds instead of corrupting memory', () => {
    const canvas = new Canvas(4, 4);
    canvas.set(-5, -5, [0, 0, 0]);
    canvas.set(99, 99, [0, 0, 0]);
    canvas.line(-20, -20, 40, 40, [0, 0, 0]);
    expect(canvas.pixels.length).toBe(4 * 4 * 4);
  });

  it('draws a line that actually marks pixels', () => {
    const canvas = new Canvas(10, 10);
    canvas.line(0, 0, 9, 9, [0, 0, 0]);
    expect(canvas.pixels[0]).toBe(0);
  });
});

describe('renderChartPng', () => {
  it('produces a PNG for a plottable series', () => {
    const png = renderChartPng([{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 3 }], { connect: true });
    expect(png).not.toBeNull();
    expect(png!.subarray(0, 8)).toEqual(SIGNATURE);
  });

  it('returns null when there is nothing to plot', () => {
    expect(renderChartPng([])).toBeNull();
  });
});

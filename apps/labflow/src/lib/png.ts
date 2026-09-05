import { deflateSync } from 'node:zlib';

/**
 * Minimal PNG writer (8-bit RGBA, no interlacing).
 *
 * Node ships the only hard part — DEFLATE — so an image library would buy
 * nothing here. Used to put a chart into an exported PowerPoint deck.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new Error('Pixel buffer does not match the given dimensions');
  }

  // Each scanline is prefixed with its filter type; 0 means "none".
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
      raw,
      rowStart + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A simple RGBA canvas: just enough to draw axes, a line and points. */
export class Canvas {
  readonly pixels: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    background: [number, number, number] = [255, 255, 255],
  ) {
    this.pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      this.pixels[i * 4] = background[0];
      this.pixels[i * 4 + 1] = background[1];
      this.pixels[i * 4 + 2] = background[2];
      this.pixels[i * 4 + 3] = 255;
    }
  }

  set(x: number, y: number, colour: [number, number, number]) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const i = (py * this.width + px) * 4;
    this.pixels[i] = colour[0];
    this.pixels[i + 1] = colour[1];
    this.pixels[i + 2] = colour[2];
    this.pixels[i + 3] = 255;
  }

  /** Bresenham, so a line never leaves gaps at steep angles. */
  line(x0: number, y0: number, x1: number, y1: number, colour: [number, number, number]) {
    let [x, y] = [Math.round(x0), Math.round(y0)];
    const [ex, ey] = [Math.round(x1), Math.round(y1)];
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let error = dx + dy;
    // Bounded so a bad coordinate can never spin forever.
    for (let guard = 0; guard < 10_000; guard++) {
      this.set(x, y, colour);
      if (x === ex && y === ey) return;
      const e2 = 2 * error;
      if (e2 >= dy) { error += dy; x += sx; }
      if (e2 <= dx) { error += dx; y += sy; }
    }
  }

  disc(cx: number, cy: number, radius: number, colour: [number, number, number]) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) this.set(cx + dx, cy + dy, colour);
      }
    }
  }

  toPng(): Buffer {
    return encodePng(this.width, this.height, this.pixels);
  }
}

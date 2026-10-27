import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// The icon in the browser tab, the icons a phone puts on its home screen, and the manifest that names them.
// Vite serves public/ at the root of the site, so "/icon.svg" in the page is public/icon.svg.
const PAGE = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
const PUBLIC = fileURLToPath(new URL('../../public', import.meta.url));

const publicFile = (href: string): string => `${PUBLIC}${href}`;

// The attributes of every <link> and <meta> in the page.
function tags(name: 'link' | 'meta'): Record<string, string>[] {
  return [...PAGE.matchAll(new RegExp(`<${name}\\s([^>]*?)/?>`, 'g'))].map((tag) =>
    Object.fromEntries([...tag[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
  );
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Width, height and colour type, read from the IHDR chunk right after the signature.
function png(bytes: Buffer): { width: number; height: number; colourType: number } {
  expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE), 'a PNG file').toBe(true);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes.readUInt8(25) };
}

it('links the tab icons, the home screen icon and the manifest from the page', () => {
  const links = tags('link');
  expect(links).toContainEqual({ rel: 'icon', href: '/favicon.ico', sizes: '32x32' });
  expect(links).toContainEqual({ rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' });
  expect(links).toContainEqual({ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' });
  expect(links).toContainEqual({ rel: 'manifest', href: '/manifest.webmanifest' });
  expect(tags('meta')).toContainEqual({ name: 'apple-mobile-web-app-title', content: 'DINO' });
  for (const link of links) expect(existsSync(publicFile(link.href!)), link.href).toBe(true);
});

it('packs the tab icon at 16 and 32 px', () => {
  const ico = readFileSync(publicFile('/favicon.ico'));
  expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]); // reserved, and 1 for an icon
  const sizes: number[] = [];
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const entry = 6 + i * 16;
    const size = ico.readUInt8(entry);
    const image = ico.subarray(ico.readUInt32LE(entry + 12), ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8));
    expect(png(image), `${size} px`).toMatchObject({ width: size, height: size });
    sizes.push(size);
  }
  expect(sizes.sort((a, b) => a - b)).toEqual([16, 32]);
});

it('draws the SVG icon in the game greys on a white tile, square pixel by square pixel', () => {
  const svg = readFileSync(publicFile('/icon.svg'), 'utf8');
  expect(svg).toContain('viewBox="0 0 32 32"');
  expect(svg).toContain('shape-rendering="crispEdges"');
  const fills = new Set([...svg.matchAll(/fill="([^"]*)"/g)].map((m) => m[1]!.toLowerCase()));
  expect([...fills].sort()).toEqual(['#535353', '#bdbdbd', '#ffffff']);
});

it('gives the phones whole, opaque icons in the sizes they ask for', () => {
  // No alpha channel (colour type 2): iOS paints the see-through corners of an icon black.
  expect(png(readFileSync(publicFile('/apple-touch-icon.png')))).toEqual({ width: 180, height: 180, colourType: 2 });

  const manifest = JSON.parse(readFileSync(publicFile('/manifest.webmanifest'), 'utf8'));
  expect(manifest).toMatchObject({ name: 'DINO with FRIENDS', short_name: 'DINO', start_url: '/', display: 'browser' });
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512']);
  for (const icon of manifest.icons) {
    const side = Number(icon.sizes.split('x')[0]);
    expect(icon.type).toBe('image/png');
    expect(png(readFileSync(publicFile(icon.src))), icon.src).toEqual({ width: side, height: side, colourType: 2 });
  }
});

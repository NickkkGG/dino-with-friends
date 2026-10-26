// The original game's files, taken straight from third_party/chromium so there is only one copy of each.
import sprite1x from '../../third_party/chromium/images/default_100_percent/offline/100-offline-sprite.png?url';
import sprite2x from '../../third_party/chromium/images/default_200_percent/offline/200-offline-sprite.png?url';
import chromiumLicense from '../../third_party/chromium/LICENSE?raw';
import pressSound from '../../third_party/chromium/sounds/button-press.mp3?url';
import hitSound from '../../third_party/chromium/sounds/hit.mp3?url';
import reachedSound from '../../third_party/chromium/sounds/score-reached.mp3?url';

export const SPRITE_1X_URL: string = sprite1x;
export const SPRITE_2X_URL: string = sprite2x;
export const SOUND_URLS: { press: string; hit: string; reached: string } = { press: pressSound, hit: hitSound, reached: reachedSound };
export const CHROMIUM_LICENSE: string = chromiumLicense;

/** Loads an image and waits until it is decoded, so the first frame that draws it does not stall. */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

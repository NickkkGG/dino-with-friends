import { expect, it } from 'vitest';
import { copyText } from '../../src/app/copy';
import type { CopyEnv } from '../../src/app/copy';

/** A page to copy on, and a record of what was used. */
function env(o: { secure: boolean; clipboard: 'none' | 'ok' | 'refuses'; exec: boolean }) {
  const used: string[] = [];
  const e: CopyEnv = {
    secure: o.secure,
    clipboard:
      o.clipboard === 'none'
        ? null
        : {
            writeText: async (t) => {
              used.push(`clipboard ${t}`);
              if (o.clipboard === 'refuses') throw new DOMException('Write permission denied.', 'NotAllowedError');
            },
          },
    execCopy: (t) => {
      used.push(`exec ${t}`);
      return o.exec;
    },
  };
  return { e, used };
}

it('uses the clipboard on a secure page', async () => {
  const { e, used } = env({ secure: true, clipboard: 'ok', exec: true });
  expect(await copyText('K7RM2Q', e)).toBe(true);
  expect(used).toEqual(['clipboard K7RM2Q']);
});

it('falls back where there is no clipboard, as on the Wi-Fi address', async () => {
  const { e, used } = env({ secure: false, clipboard: 'none', exec: true });
  expect(await copyText('K7RM2Q', e)).toBe(true);
  expect(used).toEqual(['exec K7RM2Q']);
});

it('does not use a clipboard on a page that is not secure', async () => {
  const { e, used } = env({ secure: false, clipboard: 'ok', exec: true });
  expect(await copyText('K7RM2Q', e)).toBe(true);
  expect(used).toEqual(['exec K7RM2Q']);
});

it('falls back when the clipboard says no', async () => {
  const { e, used } = env({ secure: true, clipboard: 'refuses', exec: true });
  expect(await copyText('K7RM2Q', e)).toBe(true);
  expect(used).toEqual(['clipboard K7RM2Q', 'exec K7RM2Q']);
});

it('says false when nothing works', async () => {
  expect(await copyText('K7RM2Q', env({ secure: true, clipboard: 'refuses', exec: false }).e)).toBe(false);
  expect(await copyText('K7RM2Q', env({ secure: false, clipboard: 'none', exec: false }).e)).toBe(false);
});

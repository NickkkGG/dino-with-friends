/** What copying needs from the page, so a test can stand in for it. */
export interface CopyEnv {
  /** Whether the page is a secure context, the only kind that has the async clipboard. */
  secure: boolean;
  clipboard: { writeText(t: string): Promise<void> } | null;
  /** The old way, through a selected textarea; whether it copied. */
  execCopy(text: string): boolean;
}

// Copies through a textarea that is out of sight for the moment it takes.
function execCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  // 16 px keeps Safari on an iPhone from zooming in; the page's own text cannot be selected, a textarea's must be.
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0', fontSize: '16px', userSelect: 'text' });
  ta.style.setProperty('-webkit-user-select', 'text');
  document.body.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

function pageEnv(): CopyEnv {
  return { secure: window.isSecureContext, clipboard: navigator.clipboard ?? null, execCopy };
}

/**
 * Copies a text: with the clipboard on a secure page, and the old way where there is none (as on a Wi-Fi address like
 * http://192.168.1.5:5173) or it says no. Whether the text was copied.
 */
export async function copyText(text: string, env: CopyEnv = pageEnv()): Promise<boolean> {
  if (env.secure && env.clipboard) {
    try {
      await env.clipboard.writeText(text);
      return true;
    } catch {
      // the old way, below
    }
  }
  return env.execCopy(text);
}

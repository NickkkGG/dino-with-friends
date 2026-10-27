/** A screen wake lock the browser has granted. */
export interface ScreenLock {
  release(): Promise<void>;
}

/** The part of the navigator a wake lock comes from; a browser without one has no `wakeLock`. */
export interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<ScreenLock> };
}

/** The part of the document that tells when the page is shown or hidden. */
export interface VisibilityDocument {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
}

/**
 * Keeps the screen on, where the browser can, and asks again each time the page is shown, since a hidden page loses
 * the lock. Gives the way to let go. A browser without a wake lock, or one that refuses it, leaves the screen as it is.
 */
export function holdScreenOn(
  nav: WakeLockNavigator = navigator,
  doc: VisibilityDocument = document,
): () => void {
  let held: ScreenLock | null = null;
  let asking = false;
  let done = false;
  const ask = () => {
    const wakeLock = nav.wakeLock;
    if (done || asking || held !== null || doc.visibilityState !== 'visible' || !wakeLock) return;
    asking = true;
    const granted = (lock: ScreenLock) => {
      asking = false;
      if (done) void lock.release().catch(() => {});
      else held = lock;
    };
    const refused = () => {
      asking = false;
    };
    try {
      wakeLock.request('screen').then(granted, refused);
    } catch {
      refused();
    }
  };
  const onVisibility = () => {
    if (doc.visibilityState === 'visible') ask();
    else held = null; // the browser has let go of it
  };
  doc.addEventListener('visibilitychange', onVisibility);
  ask();
  return () => {
    done = true;
    doc.removeEventListener('visibilitychange', onVisibility);
    if (held !== null) void held.release().catch(() => {});
    held = null;
  };
}

/** One who watches the screen on show. */
export interface Peeker {
  id: string;
  name: string;
  /** The player of this page, whose name is darker. */
  me: boolean;
}

/** The peekers on show, the first ones up to `max`, and how many more there are. */
export function peekSlots(all: readonly Peeker[], max: number): { shown: Peeker[]; more: number } {
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** A Storage kept in a Map, like localStorage in a browser that allows it. Its writes fail while `full` is set. */
export function memoryStorage(): Storage & { full: boolean } {
  const m = new Map<string, string>();
  const s = {
    full: false,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (key: string) => m.get(key) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (key: string) => void m.delete(key),
    setItem: (key: string, value: string) => {
      if (s.full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      m.set(key, String(value));
    },
  };
  return s;
}

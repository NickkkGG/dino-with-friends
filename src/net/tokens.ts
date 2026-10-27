/** Where a tab keeps the token of its seat in each lobby. */
export interface TokenStore {
  get(code: string): string | null;
  set(code: string, token: string): void;
}

export const tokenKey = (code: string): string => `dwf.token.${code}`;

/**
 * sessionStorage under dwf.token.<CODE>, or memory where sessionStorage is missing or refuses. sessionStorage belongs
 * to the tab: a reload keeps its seat, and another tab is another player.
 */
export function sessionTokens(storage: () => Storage | null = () => window.sessionStorage): TokenStore {
  const memory = new Map<string, string>();
  const use = (): Storage | null => {
    try {
      return storage();
    } catch {
      return null;
    }
  };
  return {
    get(code) {
      try {
        return use()?.getItem(tokenKey(code)) ?? memory.get(code) ?? null;
      } catch {
        return memory.get(code) ?? null;
      }
    },
    set(code, token) {
      memory.set(code, token);
      try {
        use()?.setItem(tokenKey(code), token);
      } catch {
        // Memory keeps it for as long as the page is open.
      }
    },
  };
}

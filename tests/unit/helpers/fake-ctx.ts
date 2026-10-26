// A stand-in for CanvasRenderingContext2D in node tests: every method call and every property assignment is recorded in
// order, and properties read back what was last set (save and restore keep a stack, like the real thing).
export interface FakeCall {
  op: string;
  args: unknown[];
}

const DEFAULTS: Record<string, unknown> = {
  globalAlpha: 1, fillStyle: '#000000', strokeStyle: '#000000', imageSmoothingEnabled: true, filter: 'none',
  globalCompositeOperation: 'source-over', lineWidth: 1, font: '10px sans-serif',
};

export function makeFakeCtx(): { ctx: CanvasRenderingContext2D; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  let state: Record<string, unknown> = { ...DEFAULTS };
  const saved: Array<Record<string, unknown>> = [];
  const target = {};
  const ctx = new Proxy(target, {
    get(_t, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (prop in state) return state[prop];
      return (...args: unknown[]) => {
        calls.push({ op: prop, args });
        if (prop === 'save') saved.push({ ...state });
        if (prop === 'restore') state = saved.pop() ?? state;
        return undefined;
      };
    },
    set(_t, prop, value) {
      if (typeof prop === 'symbol') return false;
      state[prop] = value;
      calls.push({ op: `set ${prop}`, args: [value] });
      return true;
    },
  });
  return { ctx: ctx as CanvasRenderingContext2D, calls };
}

/** The recorded calls of one method, as argument lists. */
export const callsOf = (calls: readonly FakeCall[], op: string): unknown[][] => calls.filter((c) => c.op === op).map((c) => c.args);

/** The fillRect calls made while fillStyle was `color`, in order. */
export function fillsIn(calls: readonly FakeCall[], color: string): number[][] {
  let style: unknown = '#000000';
  const saved: unknown[] = [];
  const out: number[][] = [];
  for (const c of calls) {
    if (c.op === 'set fillStyle') style = c.args[0];
    else if (c.op === 'save') saved.push(style);
    else if (c.op === 'restore') style = saved.pop() ?? style;
    else if (c.op === 'fillRect' && style === color) out.push(c.args as number[]);
  }
  return out;
}

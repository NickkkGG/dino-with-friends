import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IdleRun } from '../game/demo';
import type { SpriteSet } from '../game/sprites';
import { useDevicePixelRatio } from '../ui/PixelText';

/**
 * The original's waiting dino, blinking, with clouds drifting by: as wide as the column it sits in. With `hop` the dino
 * hops now and then, as the winner does on the results screen.
 */
export function IdleStrip({ sprites, hop = false }: { sprites: SpriteSet; hop?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef<IdleRun | null>(null);
  const [width, setWidth] = useState(0);
  const dpr = useDevicePixelRatio();

  useEffect(() => {
    const r = new IdleRun({ canvas: canvas.current!, sprites, hop });
    run.current = r;
    r.start();
    return () => {
      r.dispose();
      run.current = null;
    };
  }, [sprites, hop]);

  useLayoutEffect(() => {
    const el = wrap.current!;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (width > 0) run.current?.setSize(width, dpr);
  }, [width, dpr]);

  return (
    <div ref={wrap} className="idle-strip">
      <canvas ref={canvas} data-testid="idle-strip" />
    </div>
  );
}

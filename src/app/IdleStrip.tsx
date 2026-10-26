import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IdleRun } from '../game/demo';
import type { SpriteSet } from '../game/sprites';
import { useDevicePixelRatio } from '../ui/PixelText';

/** The original's waiting dino, blinking, with clouds drifting by: as wide as the column it sits in. */
export function IdleStrip({ sprites }: { sprites: SpriteSet }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef<IdleRun | null>(null);
  const [width, setWidth] = useState(0);
  const dpr = useDevicePixelRatio();

  useEffect(() => {
    const r = new IdleRun({ canvas: canvas.current!, sprites });
    run.current = r;
    r.start();
    return () => {
      r.dispose();
      run.current = null;
    };
  }, [sprites]);

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

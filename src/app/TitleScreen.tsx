import { useEffect, useMemo, useRef, useState } from 'react';
import { SOFT } from '../game/colors';
import { DemoRun } from '../game/demo';
import { titleLayout } from '../game/layout';
import { HI_KEY } from '../game/solo-rules';
import type { SpriteSet } from '../game/sprites';
import { readNumber } from '../game/storage';
import { PixelButton } from '../ui/PixelButton';
import { PixelText, useDevicePixelRatio } from '../ui/PixelText';

export interface TitleScreenProps {
  sprites: SpriteSet;
  onSolo(): void;
  onMultiplayer(): void;
  onCredits(): void;
}

const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

/** The title: the logo, the dino running by itself across the screen, SOLO, MULTIPLAYER and CREDITS. */
export function TitleScreen({ sprites, onSolo, onMultiplayer, onCredits }: TitleScreenProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hiCanvas = useRef<HTMLCanvasElement>(null);
  const demo = useRef<DemoRun | null>(null);
  const [size, setSize] = useState(viewport);
  const [hi] = useState(() => readNumber(HI_KEY, 0));
  const dpr = useDevicePixelRatio();
  const t = useMemo(() => titleLayout(size.w, size.h), [size]);

  useEffect(() => {
    const d = new DemoRun({ canvas: canvas.current!, hiCanvas: hiCanvas.current, sprites, hi });
    demo.current = d;
    d.start();
    return () => {
      d.dispose();
      demo.current = null;
    };
  }, [sprites, hi]);

  useEffect(() => {
    demo.current?.setSize(t.trackWidth, dpr, t.portrait);
  }, [t, dpr]);

  useEffect(() => {
    const onResize = () => setSize(viewport());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return (
    <div data-testid="title-screen" className="title-screen" style={{ gap: t.gap }}>
      <div className="title-logo">
        <PixelText text="DINO" size={t.logo} />
        <PixelText text="with" size={t.logo / 2} color={SOFT} />
        <PixelText text="FRIENDS" size={t.logo} />
      </div>
      <div className="title-track" style={{ width: t.trackWidth }}>
        <canvas ref={hiCanvas} className="title-hi" style={t.portrait && hi > 0 ? undefined : { display: 'none' }} />
        <canvas ref={canvas} data-testid="demo-canvas" />
        {hi > 0 && <span className="visually-hidden">HI {String(hi).padStart(5, '0')}</span>}
      </div>
      <div className="title-buttons" style={{ gap: t.buttonGap, width: t.buttonWidth }}>
        <PixelButton label="SOLO" variant="outline" onClick={onSolo} testId="btn-solo" />
        <PixelButton label="MULTIPLAYER" variant="filled" onClick={onMultiplayer} testId="btn-multiplayer" />
      </div>
      <button type="button" className="text-button" data-testid="link-credits" onClick={onCredits}>
        <PixelText text="CREDITS" size={t.small} color={SOFT} />
      </button>
    </div>
  );
}

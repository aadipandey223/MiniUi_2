import { useEffect, useRef } from 'react';
import type { VaultTheme } from '../lib/experience.ts';

interface MatrixBackdropProps {
  active: boolean;
  theme: VaultTheme;
}

const HEX_GLYPHS = '0123456789ABCDEF';

export function MatrixBackdrop({ active, theme }: MatrixBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const fontSize = 13;
    let columns = Math.ceil(canvas.width / 28);
    let drops = Array.from({ length: columns }, () => Math.random() * -40);

    const glyphColor =
      theme === 'light' ? '#52525B' : theme === 'cipher' ? '#4ADE80' : '#A1A1AA';
    const fadeFill =
      theme === 'light'
        ? 'rgba(250, 250, 250, 0.22)'
        : theme === 'cipher'
          ? 'rgba(8, 9, 8, 0.20)'
          : 'rgba(11, 11, 12, 0.20)';

    const interval = window.setInterval(() => {
      const nextCols = Math.ceil(canvas.width / 28);
      if (nextCols !== columns) {
        columns = nextCols;
        drops = Array.from({ length: columns }, () => Math.random() * -40);
      }

      ctx.fillStyle = fadeFill;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = glyphColor;
      ctx.font = `${fontSize}px "JetBrains Mono", monospace`;

      for (let i = 0; i < drops.length; i++) {
        const ch = HEX_GLYPHS[Math.floor(Math.random() * HEX_GLYPHS.length)];
        ctx.fillText(ch, i * 28, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i] += 0.55;
      }
    }, 75);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('resize', resize);
    };
  }, [active, theme]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none opacity-[0.10]"
      aria-hidden="true"
    />
  );
}

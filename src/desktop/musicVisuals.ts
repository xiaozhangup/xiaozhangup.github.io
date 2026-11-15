export async function coverColor(url: string) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();

  const sample = document.createElement('canvas');
  sample.width = sample.height = 24;
  const ctx = sample.getContext('2d')!;
  ctx.drawImage(image, 0, 0, sample.width, sample.height);
  const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    red += pixels[i] * alpha;
    green += pixels[i + 1] * alpha;
    blue += pixels[i + 2] * alpha;
    weight += alpha;
  }
  return weight ? [red, green, blue].map((channel) => Math.floor(channel / weight)) : null;
}

// Dynamic Music Pill's centered pulse mode uses a shared timebase with per-bar speeds.
const pulseSpeeds = [1.1, 1.6, 1.3, 1.8, 1.5, 1.2, 1.7, 1.4];

export function initMusicWaves(menu: HTMLElement) {
  const waves = [...menu.querySelectorAll<HTMLCanvasElement>('[data-music-wave]')].map((canvas) => ({
    canvas,
    ctx: canvas.getContext('2d')!,
    width: canvas.width,
    height: canvas.height,
    bars: Number(canvas.dataset.musicWave),
    stroke: Number(canvas.dataset.waveStroke),
  }));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = false;
  let activeWaves = waves;
  let color = '#fff';
  let frame = 0;

  function draw(time?: number) {
    const dpr = devicePixelRatio;
    for (const wave of activeWaves) {
      const { canvas, ctx, bars } = wave;
      const width = Math.round(wave.width * dpr);
      const height = Math.round(wave.height * dpr);
      const stroke = Math.max(1, Math.round(wave.stroke * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let index = 0; index < bars; index++) {
        const amplitude = !playing ? .2 : time === undefined ? .65
          : .3 + .7 * ((Math.sin(time * pulseSpeeds[index % pulseSpeeds.length]) + 1) / 2);
        const barHeight = Math.max(1, Math.round(height * amplitude));
        const left = Math.round(index * (width - stroke) / (bars - 1));
        ctx.roundRect(left, Math.floor((height - barHeight) / 2), stroke, barHeight, dpr);
      }
      ctx.fill();
    }
  }

  function tick() {
    draw(Date.now() / 250);
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    activeWaves = waves.filter(({ canvas }) => canvas.clientWidth > 0 &&
      (canvas.classList.contains('pill-wave') || menu.hasAttribute('data-open')));
    color = getComputedStyle(waves[0].canvas).color;
    if (playing && activeWaves.length && !document.hidden && !reducedMotion.matches && document.documentElement.dataset.motion !== 'off') {
      frame = requestAnimationFrame(tick);
    } else {
      frame = 0;
      draw();
    }
  }
  const visibility = new ResizeObserver(sync);
  for (const { canvas } of waves) visibility.observe(canvas);
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion', 'data-theme'] });
  menu.addEventListener('disclosurechange', sync);
  reducedMotion.addEventListener('change', sync);
  window.addEventListener('resize', sync);
  document.addEventListener('visibilitychange', sync);
  sync();
  return (next: boolean) => { playing = next; sync(); };
}

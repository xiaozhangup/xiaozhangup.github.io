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

export function alignCompactMusicStatus(card: HTMLElement) {
  const label = card.querySelector<HTMLElement>('.music-listening-label')!;
  const text = label.querySelector<HTMLElement>('[data-i18n]')!;
  const baseline = label.querySelector<HTMLElement>('.music-listening-baseline')!;
  const logo = card.querySelector<SVGElement>('.music-listening svg')!;
  const measure = document.createElement('canvas').getContext('2d')!;

  function align() {
    if (!label.offsetWidth) return;
    const { fontWeight, fontSize, fontFamily } = getComputedStyle(text);
    measure.font = `${fontWeight} ${fontSize} ${fontFamily}`;
    const { actualBoundingBoxAscent, actualBoundingBoxDescent } = measure.measureText(text.textContent!);
    const icon = logo.getBoundingClientRect();
    const scale = icon.height / parseFloat(getComputedStyle(logo).height);
    const baselineToIcon = (icon.top + icon.height / 2 - baseline.getBoundingClientRect().top) / scale;
    const inkCenter = (actualBoundingBoxDescent - actualBoundingBoxAscent) / 2;
    text.style.insetBlockStart = `${baselineToIcon - inkCenter}px`;
  }

  new ResizeObserver(align).observe(label);
  void document.fonts.ready.then(align);
}

// Dynamic Music Pill's centered pulse mode uses a shared timebase with per-bar speeds.
const pulseSpeeds = [1.1, 1.6, 1.3, 1.8, 1.5, 1.2, 1.7, 1.4];

export function initMusicWaves(bar: HTMLElement) {
  const waves = [...bar.querySelectorAll<HTMLCanvasElement>('[data-music-wave]')].map((canvas) => ({
    canvas,
    owner: canvas.closest<HTMLElement>('[data-disclosure]')!,
    inPill: Boolean(canvas.closest('.music-pill')),
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
    activeWaves = waves.filter(({ canvas, owner, inPill }) =>
      canvas.clientWidth > 0 && (inPill || owner.hasAttribute('data-open')));
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
  for (const owner of new Set(waves.map((wave) => wave.owner))) owner.addEventListener('disclosurechange', sync);
  reducedMotion.addEventListener('change', sync);
  window.addEventListener('resize', sync);
  document.addEventListener('visibilitychange', sync);
  sync();
  return (next: boolean) => { playing = next; sync(); };
}

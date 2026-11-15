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
  return weight ? `rgb(${red / weight} ${green / weight} ${blue / weight})` : '';
}

export function initPillWave(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const heights = [11, 6, 13, 9, 12];
  let playing = false;
  let frame = 0;

  function draw(time: number) {
    const dpr = devicePixelRatio;
    const width = Math.round(18 * dpr);
    const height = Math.round(14 * dpr);
    const stroke = Math.max(1, Math.round(2 * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    heights.forEach((base, index) => {
      const amplitude = time ? .66 + .21 * Math.sin(time / (190 + index * 39) + 1.9 * index)
        + .12 * Math.sin(time / (330 + index * 27) - index * .8) : .65;
      const barHeight = Math.round(base * dpr * amplitude);
      const left = Math.round(index * (width - stroke) / (heights.length - 1));
      ctx.fillRect(left, Math.floor((height - barHeight) / 2), stroke, barHeight);
    });
  }

  function tick(time: number) {
    draw(time);
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    if (playing && canvas.clientWidth && !document.hidden && !reducedMotion.matches && document.documentElement.dataset.motion !== 'off') {
      frame = requestAnimationFrame(tick);
    } else {
      frame = 0;
      draw(0);
    }
  }
  new ResizeObserver(sync).observe(canvas);
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  reducedMotion.addEventListener('change', sync);
  window.addEventListener('resize', sync);
  document.addEventListener('visibilitychange', sync);
  sync();
  return (next: boolean) => { playing = next; sync(); };
}

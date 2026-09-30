import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { H264MP4Encoder } from 'h264-mp4-encoder';
import { readMp4Samples } from './mp4Samples';
import wasmEncoderUrl from 'h264-mp4-encoder/embuild/dist/h264-mp4-encoder.web.js?url';
import { CELL, contentBounds, type Rect } from '../model/geometry';
import { useFactory } from '../store/useFactory';
import { CANVAS_ID } from './viewport';

export type ExportFormat = 'png' | 'gif' | 'mp4';

/** Space around the whole factory so names under buildings aren't clipped. */
const PAD = { x: CELL * 1.5, top: CELL, bottom: CELL * 2.25 };
const PNG_SCALE = 2;
const MAX_PNG_SIDE = 8000;
/** GIFs are drawn larger than 1:1 and with bigger labels so text survives the 256-colour palette. */
const GIF_SCALE = 1.5;
const MAX_GIF_SIDE = 2100;
const GIF_TEXT_SCALE = 1.45;
/** Videos are full colour, so they can be sharper; one loop is repeated to make a short clip. */
const MP4_SCALE = 2;
const MAX_MP4_SIDE = 2560;
const MP4_TEXT_SCALE = 1.3;
const MP4_FPS = 30;
/** Frames in one seamless loop (the same motion the GIF shows in 20). */
const MP4_LOOP_FRAMES = 36;
const MP4_LOOPS = 5;
/** The fallback software encoder is slower, so it works at a smaller size. */
const MAX_WASM_SIDE = 1920;
const GIF_FRAMES = 20;
const GIF_FRAME_MS = 60;
/** The gear has 8 teeth, so turning it 1/8 per loop repeats seamlessly. */
const GEAR_TURN_PER_LOOP = 45;

/** Area covering every building and belt, in world pixels. */
export function factoryBounds(): Rect | null {
  const { pipeline } = useFactory.getState();
  const b = contentBounds(pipeline.nodes, pipeline.belts);
  if (!b) return null;
  return { x: b.x - PAD.x, y: b.y - PAD.top, w: b.w + PAD.x * 2, h: b.h + PAD.top + PAD.bottom };
}

/** All app CSS as text, plus the resolved colour variables so the image matches the current theme. */
function collectCss(): string {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      // Screen-size rules only lay out the panels, which aren't in the image.
      for (const rule of Array.from(sheet.cssRules)) if (!(rule instanceof CSSMediaRule)) css += `${rule.cssText}\n`;
    } catch {
      // Cross-origin stylesheets can't be read; the app's own styles always can.
    }
  }
  const vars = new Set(css.match(/--[\w-]+/g) ?? []);
  const root = getComputedStyle(document.documentElement);
  const resolved = [...vars].map((v) => `${v}: ${root.getPropertyValue(v).trim()};`).join(' ');
  return `${css}\n:root { ${resolved} }\n* { animation: none !important; transition: none !important; }\n`;
}

interface MovingItem {
  el: Element;
  path: SVGPathElement;
  length: number;
  /** Where this item starts, as a fraction of the path. */
  start: number;
  /** Fraction of the path between neighbouring items. */
  gap: number;
}

/** Grows an element about the point (px, py) of its own coordinates, keeping its transform. */
function scaleAbout(el: Element, s: number, px: number, py: number) {
  const t = el.getAttribute('transform') ?? '';
  el.setAttribute('transform', `${t} translate(${px} ${py}) scale(${s}) translate(${-px} ${-py})`);
}

/** Enlarges building names, area tags and arrow labels, each about its own anchor. */
function enlargeText(clone: SVGGElement, s: number) {
  // Building names hang below the building from their top middle; the smaller
  // type / technology line grows less (it's wide and would run into neighbours)
  // and moves down to clear the bigger name.
  clone.querySelectorAll('.node .labels').forEach((labels) => {
    const name = labels.querySelector(':scope > .node-name');
    if (name) scaleAbout(name, s, 0, -12);
    const meta = labels.querySelector(':scope > g');
    const m = 1 + (s - 1) / 2;
    const at = meta?.getAttribute('transform')?.match(/translate\(([-\d.e]+) ([-\d.e]+)\)/);
    if (meta && at) meta.setAttribute('transform', `translate(${Number(at[1]) * m} ${Number(at[2]) + 12 * (s - 1)}) scale(${m})`);
  });
  // Area tags grow from their top-left corner, inside the area.
  clone.querySelectorAll('.area-label').forEach((el) => scaleAbout(el, s, 0, 0));
  // Arrow labels stay centred on the arrow.
  clone.querySelectorAll('.arrow-label').forEach((el) => {
    const w = Number(el.querySelector('rect')?.getAttribute('width') ?? 0);
    scaleAbout(el, s, w / 2, 10);
  });
}

/** A copy of the drawn factory, cleaned of editing chrome, with handles to move items per frame. */
function snapshotWorld(textScale = 1) {
  const svg = document.querySelector(`#${CANVAS_ID} svg.canvas`);
  const world = svg?.querySelector(':scope > g');
  if (!world) throw new Error('Nothing to export');
  const clone = world.cloneNode(true) as SVGGElement;
  clone.removeAttribute('transform');
  clone
    .querySelectorAll('.hover-cell, .belt-ghost, .ghost-building, .marquee, .select-ring, .belt-glow, .belt-label, .pulse, .arrow-glow, .arrow-preview, .area-handle, .area-preview')
    .forEach((el) => el.remove());
  clone.querySelectorAll('.dimmed, .dim, .sel, .selected').forEach((el) => el.classList.remove('dimmed', 'dim', 'sel', 'selected'));
  if (textScale !== 1) enlargeText(clone, textScale);

  // Items ride along belts with SMIL; replace that with positions we control per frame.
  const measure = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  measure.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden');
  document.body.appendChild(measure);
  const items: MovingItem[] = [];
  for (const link of Array.from(clone.querySelectorAll('.link-items'))) {
    const riders = Array.from(link.children);
    riders.forEach((rider, i) => {
      const motion = rider.querySelector('animateMotion');
      if (!motion) return;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', motion.getAttribute('path') ?? '');
      measure.appendChild(path);
      motion.remove();
      items.push({ el: rider, path, length: path.getTotalLength(), start: i / riders.length, gap: 1 / riders.length });
    });
  }
  const gears = Array.from(clone.querySelectorAll('.spin'));
  gears.forEach((g) => g.classList.remove('spin'));

  /** Poses the copy at `t` in [0, 1): every item has moved t of the way to the next item's spot. */
  const pose = (t: number) => {
    for (const it of items) {
      const p = it.path.getPointAtLength((((it.start + t * it.gap) % 1) + 1) % 1 * it.length);
      it.el.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    }
    for (const g of gears) g.setAttribute('transform', `rotate(${(t * GEAR_TURN_PER_LOOP).toFixed(2)})`);
  };
  /** Everything drawn, enlarged labels and area tags included, in world pixels. */
  const bounds = (): Rect => {
    measure.appendChild(clone);
    const b = clone.getBBox();
    clone.remove();
    const pad = CELL / 2;
    return { x: b.x - pad, y: b.y - pad, w: b.width + pad * 2, h: b.height + pad * 2 };
  };
  return { clone, pose, bounds, dispose: () => measure.remove() };
}

function buildSvg(clone: SVGGElement, region: Rect, css: string, withGrid: boolean): string {
  const floor = getComputedStyle(document.documentElement).getPropertyValue('--floor').trim() || '#eceef2';
  const grid = withGrid
    ? `<defs><pattern id="xgrid" width="${CELL}" height="${CELL}" patternUnits="userSpaceOnUse"><path d="M ${CELL} 0 L 0 0 0 ${CELL}" class="grid-line"/></pattern></defs>
       <rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" fill="url(#xgrid)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${region.w}" height="${region.h}" viewBox="${region.x} ${region.y} ${region.w} ${region.h}">
<style><![CDATA[${css.replaceAll(']]>', ']]]]><![CDATA[>')}]]></style>
<rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" fill="${floor}"/>
${grid}
<g class="canvas-wrap flowing">${new XMLSerializer().serializeToString(clone)}</g>
</svg>`;
}

async function rasterize(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileName(ext: string) {
  const name = useFactory.getState().pipeline.name || 'factory';
  return `${name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'factory'}.${ext}`;
}

/** Scale that fits the region within `maxSide` pixels, never above `preferred`. */
function fitScale(region: Rect, preferred: number, maxSide: number) {
  return Math.min(preferred, maxSide / Math.max(region.w, region.h));
}

/**
 * Renders the factory (or just `region`, in world pixels) to a PNG or an
 * animated, seamlessly looping GIF and downloads it.
 */
export async function exportFactory(format: ExportFormat, region?: Rect, opts: { grid?: boolean } = {}): Promise<void> {
  if (!region && !factoryBounds()) throw new Error('Nothing to export yet');
  const css = collectCss();
  const snap = snapshotWorld(format === 'gif' ? GIF_TEXT_SCALE : format === 'mp4' ? MP4_TEXT_SCALE : 1);
  try {
    const area = region ?? snap.bounds();
    if (area.w < 4 || area.h < 4) throw new Error('Nothing to export yet');
    if (format === 'png') {
      const scale = fitScale(area, PNG_SCALE, MAX_PNG_SIDE);
      snap.pose(0);
      const canvas = await rasterize(buildSvg(snap.clone, area, css, !!opts.grid), Math.round(area.w * scale), Math.round(area.h * scale));
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Could not create the PNG');
      download(blob, fileName('png'));
      return;
    }
    if (format === 'mp4') {
      await exportMp4(snap, area, css, !!opts.grid);
      return;
    }
    const scale = fitScale(area, GIF_SCALE, MAX_GIF_SIDE);
    const w = Math.max(1, Math.round(area.w * scale));
    const h = Math.max(1, Math.round(area.h * scale));
    const gif = GIFEncoder();
    let palette: ReturnType<typeof quantize> | null = null;
    for (let f = 0; f < GIF_FRAMES; f++) {
      snap.pose(f / GIF_FRAMES);
      const canvas = await rasterize(buildSvg(snap.clone, area, css, !!opts.grid), w, h);
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, w, h);
      // One palette for every frame keeps colours steady and encoding fast.
      palette ??= quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: GIF_FRAME_MS });
      // Let the page breathe between frames.
      await new Promise((r) => setTimeout(r, 0));
    }
    gif.finish();
    download(new Blob([gif.bytes()], { type: 'image/gif' }), fileName('gif'));
  } finally {
    snap.dispose();
  }
}

/** H.264 where the browser can encode it (plays everywhere), else VP9, both in an MP4 file. */
async function pickCodec(width: number, height: number): Promise<{ config: VideoEncoderConfig; mux: 'avc' | 'vp9' } | null> {
  const bitrate = Math.min(20_000_000, Math.round(width * height * MP4_FPS * 0.15));
  const options: Array<{ codec: string; mux: 'avc' | 'vp9' }> = [
    { codec: 'avc1.640033', mux: 'avc' },
    { codec: 'avc1.4d0033', mux: 'avc' },
    { codec: 'avc1.42003e', mux: 'avc' },
    { codec: 'vp09.00.51.08', mux: 'vp9' },
  ];
  for (const o of options) {
    const config: VideoEncoderConfig = { codec: o.codec, width, height, bitrate, framerate: MP4_FPS };
    if (o.mux === 'avc') config.avc = { format: 'avc' };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return { config, mux: o.mux };
    } catch {
      // Unknown codec string in this browser: try the next.
    }
  }
  return null;
}

/** Draws one loop of frames at the given size. */
async function renderLoop(snap: ReturnType<typeof snapshotWorld>, area: Rect, css: string, grid: boolean, w: number, h: number) {
  const loop: HTMLCanvasElement[] = [];
  for (let f = 0; f < MP4_LOOP_FRAMES; f++) {
    snap.pose(f / MP4_LOOP_FRAMES);
    loop.push(await rasterize(buildSvg(snap.clone, area, css, grid), w, h));
    await new Promise((r) => setTimeout(r, 0));
  }
  return loop;
}

async function exportMp4(snap: ReturnType<typeof snapshotWorld>, area: Rect, css: string, grid: boolean) {
  // Video encoders want even sizes.
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  // The browser's own encoder (WebCodecs) only exists on HTTPS and localhost pages.
  const codec = typeof VideoEncoder === 'undefined' ? null : await pickCodec(even(area.w * fitScale(area, MP4_SCALE, MAX_MP4_SIDE)), even(area.h * fitScale(area, MP4_SCALE, MAX_MP4_SIDE)));
  if (!codec) {
    const scale = fitScale(area, MP4_SCALE, MAX_WASM_SIDE);
    await exportMp4Wasm(snap, area, css, grid, even(area.w * scale), even(area.h * scale));
    return;
  }
  const { width: w, height: h } = codec.config;

  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: codec.mux, width: w, height: h, frameRate: MP4_FPS }, fastStart: 'in-memory' });
  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failure = e),
  });
  encoder.configure(codec.config);

  // Draw one loop, then play it several times over.
  const loop = await renderLoop(snap, area, css, grid, w, h);
  try {
    const frameUs = 1_000_000 / MP4_FPS;
    for (let i = 0; i < MP4_LOOP_FRAMES * MP4_LOOPS; i++) {
      if (failure) throw failure;
      const frame = new VideoFrame(loop[i % MP4_LOOP_FRAMES], { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      encoder.encode(frame, { keyFrame: i % MP4_LOOP_FRAMES === 0 });
      frame.close();
      // Don't let the encoder queue grow without bound.
      while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  muxer.finalize();
  download(new Blob([muxer.target.buffer], { type: 'video/mp4' }), fileName('mp4'));
}

let wasmEncoder: Promise<void> | null = null;

/** Loads the WebAssembly H.264 encoder (only needed where WebCodecs isn't available, e.g. plain-HTTP sites). */
function loadWasmEncoder(): Promise<void> {
  wasmEncoder ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = wasmEncoderUrl;
    script.onload = () => resolve();
    script.onerror = () => {
      wasmEncoder = null;
      reject(new Error('Could not load the video encoder'));
    };
    document.head.appendChild(script);
  });
  return wasmEncoder;
}

/**
 * Software H.264 for pages without WebCodecs. Encoding is the slow part, so
 * one loop is encoded (starting on a key frame) and its frames are written
 * into the final file several times over.
 */
async function exportMp4Wasm(snap: ReturnType<typeof snapshotWorld>, area: Rect, css: string, grid: boolean, w: number, h: number) {
  await loadWasmEncoder();
  const HME = (window as unknown as { HME: { createH264MP4Encoder: () => Promise<H264MP4Encoder> } }).HME;
  const encoder = await HME.createH264MP4Encoder();
  let once: Uint8Array;
  try {
    encoder.width = w;
    encoder.height = h;
    encoder.frameRate = MP4_FPS;
    encoder.quantizationParameter = 22;
    encoder.speed = 5;
    encoder.groupOfPictures = MP4_LOOP_FRAMES;
    encoder.initialize();
    for (const frame of await renderLoop(snap, area, css, grid, w, h)) {
      encoder.addFrameRgba(frame.getContext('2d')!.getImageData(0, 0, w, h).data);
      // Keep the page responsive while encoding.
      await new Promise((r) => setTimeout(r, 0));
    }
    encoder.finalize();
    once = encoder.FS.readFile(encoder.outputFilename);
    encoder.FS.unlink(encoder.outputFilename);
  } finally {
    encoder.delete();
  }

  const loop = readMp4Samples(once);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: loop.width, height: loop.height, frameRate: MP4_FPS }, fastStart: 'in-memory' });
  const meta: EncodedVideoChunkMetadata = { decoderConfig: { codec: loop.codec, codedWidth: loop.width, codedHeight: loop.height, description: loop.avcC } };
  const frameUs = 1_000_000 / MP4_FPS;
  const n = loop.samples.length;
  for (let i = 0; i < n * MP4_LOOPS; i++) {
    const sample = loop.samples[i % n];
    muxer.addVideoChunkRaw(sample.data, sample.key ? 'key' : 'delta', Math.round(i * frameUs), Math.round(frameUs), i === 0 ? meta : undefined);
  }
  muxer.finalize();
  download(new Blob([muxer.target.buffer], { type: 'video/mp4' }), fileName('mp4'));
}

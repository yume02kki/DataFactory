/**
 * Just enough of an MP4 reader to pull the encoded frames back out of a
 * single-video-track file, so they can be written into a new file (e.g. to
 * repeat a loop without encoding it again).
 */

export interface Mp4Samples {
  /** The avcC box body: H.264 decoder configuration. */
  avcC: Uint8Array;
  /** Codec string for the decoder config, e.g. avc1.42c01f. */
  codec: string;
  width: number;
  height: number;
  samples: Array<{ data: Uint8Array; key: boolean }>;
}

interface Box {
  type: string;
  start: number;
  end: number;
  body: number;
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

function boxes(d: DataView, from: number, to: number): Box[] {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = d.getUint32(at);
    const type = String.fromCharCode(d.getUint8(at + 4), d.getUint8(at + 5), d.getUint8(at + 6), d.getUint8(at + 7));
    let body = at + 8;
    if (size === 1) {
      size = Number(d.getBigUint64(at + 8));
      body += 8;
    } else if (size === 0) size = to - at;
    if (size < 8) break;
    out.push({ type, start: at, end: at + size, body });
    at += size;
  }
  return out;
}

/** Finds the first box along a path of box types, e.g. ['moov', 'trak', 'mdia']. */
function find(d: DataView, path: string[], from = 0, to = d.byteLength): Box | null {
  const [head, ...rest] = path;
  const box = boxes(d, from, to).find((b) => b.type === head);
  if (!box || !rest.length) return box ?? null;
  if (!CONTAINERS.has(box.type)) return null;
  return find(d, rest, box.body, box.end);
}

export function readMp4Samples(bytes: Uint8Array): Mp4Samples {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stbl = find(d, ['moov', 'trak', 'mdia', 'minf', 'stbl']);
  if (!stbl) throw new Error('No video track in the encoded file');
  const inStbl = (type: string) => boxes(d, stbl.body, stbl.end).find((b) => b.type === type) ?? null;

  // stsd → avc1 (sample entry: 8 reserved/index bytes + 70 bytes of video fields) → avcC
  const stsd = inStbl('stsd');
  if (!stsd) throw new Error('Missing sample description');
  const [avc1] = boxes(d, stsd.body + 8, stsd.end);
  if (!avc1 || avc1.type !== 'avc1') throw new Error('Not an H.264 file');
  const width = d.getUint16(avc1.body + 24);
  const height = d.getUint16(avc1.body + 26);
  const avcCBox = boxes(d, avc1.body + 78, avc1.end).find((b) => b.type === 'avcC');
  if (!avcCBox) throw new Error('Missing H.264 configuration');
  const avcC = bytes.slice(avcCBox.body, avcCBox.end);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const codec = `avc1.${hex(avcC[1])}${hex(avcC[2])}${hex(avcC[3])}`;

  // Sample sizes.
  const stsz = inStbl('stsz');
  if (!stsz) throw new Error('Missing sample sizes');
  const fixed = d.getUint32(stsz.body + 4);
  const count = d.getUint32(stsz.body + 8);
  const sizes = Array.from({ length: count }, (_, i) => (fixed ? fixed : d.getUint32(stsz.body + 12 + i * 4)));

  // Chunk offsets, and how many samples each chunk holds.
  const stco = inStbl('stco');
  const co64 = inStbl('co64');
  const offsets: number[] = [];
  if (stco) for (let i = 0, n = d.getUint32(stco.body + 4); i < n; i++) offsets.push(d.getUint32(stco.body + 8 + i * 4));
  else if (co64) for (let i = 0, n = d.getUint32(co64.body + 4); i < n; i++) offsets.push(Number(d.getBigUint64(co64.body + 8 + i * 8)));
  else throw new Error('Missing chunk offsets');
  const stsc = inStbl('stsc');
  if (!stsc) throw new Error('Missing chunk map');
  const runs = Array.from({ length: d.getUint32(stsc.body + 4) }, (_, i) => ({
    firstChunk: d.getUint32(stsc.body + 8 + i * 12),
    perChunk: d.getUint32(stsc.body + 12 + i * 12),
  }));

  // Key frames (no stss means every frame is one).
  const stss = inStbl('stss');
  const keys = stss ? new Set(Array.from({ length: d.getUint32(stss.body + 4) }, (_, i) => d.getUint32(stss.body + 8 + i * 4) - 1)) : null;

  const samples: Mp4Samples['samples'] = [];
  let s = 0;
  offsets.forEach((offset, c) => {
    const run = [...runs].reverse().find((r) => r.firstChunk <= c + 1);
    let at = offset;
    for (let k = 0; k < (run?.perChunk ?? 0) && s < count; k++, s++) {
      samples.push({ data: bytes.slice(at, at + sizes[s]), key: keys ? keys.has(s) : true });
      at += sizes[s];
    }
  });
  return { avcC, codec, width, height, samples };
}

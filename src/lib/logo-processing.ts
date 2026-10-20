/**
 * Prepara un logo antes de subirlo (en el navegador, con canvas):
 * - Quita el fondo sólido si la imagen trae uno (muy común en PNG exportados
 *   con su recuadro de color), para que el logo se integre con el color de la
 *   plataforma en lugar de verse como un recuadro encima.
 * - Recorta los márgenes vacíos y reduce la imagen a un tamaño razonable, así
 *   carga rápido en todas las pantallas.
 *
 * El fondo se quita con un "relleno" desde los bordes: solo se borra el color
 * que toca el borde y está conectado a él, así que los detalles del mismo color
 * dentro del símbolo (rodeados por otro color) se conservan.
 */

/** Distancia de color por debajo de la cual un pixel se considera fondo. */
const TOLERANCE = 40;
/** Entre TOLERANCE y esta distancia, el pixel es borde suavizado: se vuelve semitransparente. */
const EDGE_TOLERANCE = TOLERANCE * 2.5;
/** Proporción mínima del borde que debe ser del mismo color para tratarlo como fondo sólido. */
const SOLID_BORDER_RATIO = 0.85;

export interface PreparedLogo {
  blob: Blob;
  removedBackground: boolean;
  width: number;
  height: number;
}

type RGB = [number, number, number];

const distance = (d: Uint8ClampedArray, i: number, c: RGB) =>
  Math.sqrt((d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2);

function borderIndexes(w: number, h: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < w; x++) out.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) out.push(y * w, y * w + w - 1);
  return out;
}

/** Color dominante del borde si casi todo el borde es de ese color y opaco. */
function solidBorderColor(d: Uint8ClampedArray, w: number, h: number): RGB | null {
  const border = borderIndexes(w, h);
  const buckets = new Map<number, { n: number; sum: RGB }>();
  for (const p of border) {
    const i = p * 4;
    if (d[i + 3] < 250) continue;
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    const b = buckets.get(key) ?? { n: 0, sum: [0, 0, 0] };
    b.n++; b.sum[0] += d[i]; b.sum[1] += d[i + 1]; b.sum[2] += d[i + 2];
    buckets.set(key, b);
  }
  let top: { n: number; sum: RGB } | null = null;
  for (const b of buckets.values()) if (!top || b.n > top.n) top = b;
  if (!top) return null;
  const color: RGB = [top.sum[0] / top.n, top.sum[1] / top.n, top.sum[2] / top.n];
  const matching = border.filter(p => d[p * 4 + 3] >= 250 && distance(d, p * 4, color) <= TOLERANCE).length;
  return matching / border.length >= SOLID_BORDER_RATIO ? color : null;
}

function removeBackground(d: Uint8ClampedArray, w: number, h: number, bg: RGB) {
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];
  for (const p of borderIndexes(w, h)) {
    if (!visited[p] && distance(d, p * 4, bg) <= TOLERANCE) { visited[p] = 1; queue.push(p); }
  }
  while (queue.length) {
    const p = queue.pop()!;
    d[p * 4 + 3] = 0;
    const x = p % w, y = (p - x) / w;
    const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const n of neighbors) {
      if (n < 0 || visited[n]) continue;
      visited[n] = 1;
      const i = n * 4;
      const dist = distance(d, i, bg);
      if (dist <= TOLERANCE) {
        queue.push(n);
      } else if (dist < EDGE_TOLERANCE) {
        // Borde suavizado: mezcla de logo y fondo. Se vuelve semitransparente y
        // se le resta el color del fondo para no dejar un halo.
        const a = (dist - TOLERANCE) / (EDGE_TOLERANCE - TOLERANCE);
        for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, (d[i + c] - (1 - a) * bg[c]) / a));
        d[i + 3] = Math.round(d[i + 3] * a);
      }
    }
  }
}

/** Caja que contiene los pixeles visibles, con un pequeño margen. */
function visibleBounds(d: Uint8ClampedArray, w: number, h: number) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w, h };
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
  const x = Math.max(0, minX - pad), y = Math.max(0, minY - pad);
  return { x, y, w: Math.min(w, maxX + pad + 1) - x, h: Math.min(h, maxY + pad + 1) - y };
}

/**
 * Devuelve el archivo listo para subir. Los SVG se suben tal cual (ya son
 * livianos y suelen tener fondo transparente).
 */
export async function prepareLogo(file: File, opts: { maxSize: number; removeSolidBackground: boolean }): Promise<PreparedLogo | null> {
  if (file.type === 'image/svg+xml') return null;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, opts.maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const image = ctx.getImageData(0, 0, w, h);
  const bg = opts.removeSolidBackground ? solidBorderColor(image.data, w, h) : null;
  if (bg) removeBackground(image.data, w, h, bg);

  const box = visibleBounds(image.data, w, h);
  const out = document.createElement('canvas');
  out.width = box.w; out.height = box.h;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;
  ctx.putImageData(image, 0, 0);
  outCtx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

  const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'));
  return blob ? { blob, removedBackground: !!bg, width: box.w, height: box.h } : null;
}

/** Scientific colour maps for result fields.
 *
 * Viridis is the default because it is perceptually uniform and remains
 * readable for viewers with colour vision deficiency - the spec requires that
 * red/green is never the only distinction, and every map here is paired with a
 * numeric legend showing the real minimum and maximum.
 *
 * Inferno is offered for temperature because a dark-to-bright ramp reads
 * naturally as cold-to-hot, and it is also perceptually uniform. */

type RGB = [number, number, number];

/** Viridis control points (sampled from the reference map). */
const VIRIDIS: RGB[] = [
  [0.267, 0.005, 0.329],
  [0.283, 0.141, 0.458],
  [0.254, 0.265, 0.53],
  [0.207, 0.372, 0.553],
  [0.164, 0.471, 0.558],
  [0.128, 0.567, 0.551],
  [0.135, 0.659, 0.518],
  [0.267, 0.749, 0.441],
  [0.478, 0.821, 0.318],
  [0.741, 0.873, 0.15],
  [0.993, 0.906, 0.144],
];

/** Inferno control points. */
const INFERNO: RGB[] = [
  [0.001, 0.0, 0.014],
  [0.11, 0.046, 0.235],
  [0.258, 0.039, 0.406],
  [0.397, 0.084, 0.433],
  [0.532, 0.132, 0.415],
  [0.666, 0.19, 0.359],
  [0.787, 0.28, 0.27],
  [0.881, 0.392, 0.16],
  [0.949, 0.53, 0.044],
  [0.98, 0.69, 0.08],
  [0.988, 0.998, 0.645],
];

export type ColorMapName = 'viridis' | 'inferno';

const MAPS: Record<ColorMapName, RGB[]> = { viridis: VIRIDIS, inferno: INFERNO };

/** Sample a map at ``t`` in [0, 1] with linear interpolation. */
export function sampleColorMap(t: number, name: ColorMapName = 'viridis'): RGB {
  const stops = MAPS[name];
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const scaled = clamped * (stops.length - 1);
  const index = Math.floor(scaled);
  const next = Math.min(index + 1, stops.length - 1);
  const frac = scaled - index;
  const a = stops[index];
  const b = stops[next];
  return [
    a[0] + (b[0] - a[0]) * frac,
    a[1] + (b[1] - a[1]) * frac,
    a[2] + (b[2] - a[2]) * frac,
  ];
}

/** Build a packed RGB vertex-colour array for a scalar field. */
export function fieldToColors(
  values: number[],
  min: number,
  max: number,
  name: ColorMapName = 'viridis',
): Float32Array {
  const out = new Float32Array(values.length * 3);
  const span = max - min;
  for (let i = 0; i < values.length; i += 1) {
    // A constant field (span of zero) is drawn at the middle of the ramp rather
    // than at an arbitrary end, so it does not read as an extreme value.
    const t = span > 0 ? (values[i] - min) / span : 0.5;
    const [r, g, b] = sampleColorMap(t, name);
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}

/** CSS gradient matching a map, for the legend bar. */
export function colorMapGradient(name: ColorMapName = 'viridis'): string {
  const steps = 12;
  const stops: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const [r, g, b] = sampleColorMap(i / steps, name);
    const rgb = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    stops.push(`${rgb} ${((i / steps) * 100).toFixed(1)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

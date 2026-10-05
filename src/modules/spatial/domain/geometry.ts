export interface PointMm {
  readonly x: number;
  readonly y: number;
}

export interface RectMm {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly depth: number;
}

export interface PolygonBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly depth: number;
}

export function polygonBounds(points: readonly PointMm[]): PolygonBounds | null {
  if (!points.length) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, depth: maxY - minY };
}

export function polygonArea(points: readonly PointMm[]): number {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];

    if (!current || !next) {
      continue;
    }

    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area) / 2;
}

export function isValidPolygon(points: unknown): points is readonly PointMm[] {
  if (!Array.isArray(points) || points.length < 3 || points.length > 256) return false;
  if (
    !points.every(
      (p) =>
        p &&
        typeof p === 'object' &&
        typeof p.x === 'number' &&
        typeof p.y === 'number' &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        Math.abs(p.x) <= 1_000_000 &&
        Math.abs(p.y) <= 1_000_000,
    )
  )
    return false;
  if (!Number.isFinite(polygonArea(points)) || polygonArea(points) <= 1e-7) return false;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const previous = points[(i + points.length - 1) % points.length]!;
    if (a.x === b.x && a.y === b.y) return false;
    // Adjacent edges may be collinear but may never double back.
    if (pointOnSegment(b, previous, a) || pointOnSegment(previous, a, b)) return false;
    for (let j = i + 1; j < points.length; j += 1) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (segmentsIntersect(a, b, points[j]!, points[(j + 1) % points.length]!)) return false;
    }
  }
  return true;
}

export function parsePolygon(value: unknown): PointMm[] | null {
  return isValidPolygon(value) ? value.map(({ x, y }) => ({ x, y })) : null;
}

function segmentsIntersect(a: PointMm, b: PointMm, c: PointMm, d: PointMm): boolean {
  return (
    properCrossing(a, b, c, d) ||
    pointOnSegment(a, c, d) ||
    pointOnSegment(b, c, d) ||
    pointOnSegment(c, a, b) ||
    pointOnSegment(d, a, b)
  );
}

/** Split edges at boundary contacts so concave escapes through vertices are rejected too. */
export function polygonInsidePolygon(
  inner: readonly PointMm[],
  outer: readonly PointMm[],
): boolean {
  if (!isValidPolygon(inner) || !isValidPolygon(outer)) return false;
  if (!inner.every((point) => pointInPolygon(point, outer))) return false;
  for (let i = 0; i < inner.length; i += 1) {
    const a = inner[i]!,
      b = inner[(i + 1) % inner.length]!;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const cuts = [0, 1];
    for (let j = 0; j < outer.length; j += 1) {
      const c = outer[j]!,
        d = outer[(j + 1) % outer.length]!;
      if (properCrossing(a, b, c, d)) return false;
      if (pointOnSegment(c, a, b)) cuts.push(((c.x - a.x) * dx + (c.y - a.y) * dy) / length2);
    }
    cuts.sort((left, right) => left - right);
    for (let k = 1; k < cuts.length; k += 1) {
      const t = (cuts[k - 1]! + cuts[k]!) / 2;
      if (!pointInPolygon({ x: a.x + t * dx, y: a.y + t * dy }, outer)) return false;
    }
  }
  return true;
}

function pointOnSegment(point: PointMm, start: PointMm, end: PointMm): boolean {
  if (start.x === end.x && start.y === end.y) return point.x === start.x && point.y === start.y;
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);

  if (Math.abs(cross) > 1e-7) {
    return false;
  }

  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;

  return dot >= 0 && dot <= squaredLength;
}

export function pointInPolygon(point: PointMm, polygon: readonly PointMm[]): boolean {
  let inside = false;

  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];

    if (!current || !previous) {
      continue;
    }

    if (pointOnSegment(point, previous, current)) {
      return true;
    }

    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function rectsOverlap(left: RectMm, right: RectMm): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.depth <= right.y ||
    right.y + right.depth <= left.y
  );
}

/**
 * Proper edge crossings catch concave-room and concave-bay escapes where
 * all four rectangle corners happen to be inside the surveyed polygon.
 * Collinear/shared boundary edges remain allowed.
 */
function properCrossing(a: PointMm, b: PointMm, c: PointMm, d: PointMm): boolean {
  const side = (p: PointMm, q: PointMm, r: PointMm) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = side(a, b, c);
  const abD = side(a, b, d);
  const cdA = side(c, d, a);
  const cdB = side(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function pointStrictlyInPolygon(point: PointMm, polygon: readonly PointMm[]): boolean {
  for (let index = 0; index < polygon.length; index += 1) {
    if (pointOnSegment(point, polygon[index]!, polygon[(index + 1) % polygon.length]!))
      return false;
  }
  return pointInPolygon(point, polygon);
}

export function polygonsOverlapArea(left: readonly PointMm[], right: readonly PointMm[]): boolean {
  if (!isValidPolygon(left) || !isValidPolygon(right)) return false;

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const a = left[leftIndex]!;
    const b = left[(leftIndex + 1) % left.length]!;
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const c = right[rightIndex]!;
      const d = right[(rightIndex + 1) % right.length]!;
      if (properCrossing(a, b, c, d)) return true;
    }
  }

  if (left.some((point) => pointStrictlyInPolygon(point, right))) return true;
  if (right.some((point) => pointStrictlyInPolygon(point, left))) return true;

  const centroid = (polygon: readonly PointMm[]) => ({
    x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
    y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length,
  });

  return (
    pointStrictlyInPolygon(centroid(left), right) || pointStrictlyInPolygon(centroid(right), left)
  );
}

export function rectOverlapsPolygon(rect: RectMm, polygon: readonly PointMm[]): boolean {
  if (rect.width <= 0 || rect.depth <= 0) return false;
  return polygonsOverlapArea(
    [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.depth },
      { x: rect.x, y: rect.y + rect.depth },
    ],
    polygon,
  );
}

export function rectInsidePolygon(rect: RectMm, polygon: readonly PointMm[]): boolean {
  if (
    ![rect.x, rect.y, rect.width, rect.depth].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.depth <= 0
  )
    return false;
  return polygonInsidePolygon(
    [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.depth },
      { x: rect.x, y: rect.y + rect.depth },
    ],
    polygon,
  );
}

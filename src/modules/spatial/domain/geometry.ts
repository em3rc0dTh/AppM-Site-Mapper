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

export interface PolygonBoundsMm {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

const EPSILON = 1e-7;

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

function pointsEqual(left: PointMm, right: PointMm): boolean {
  return Math.abs(left.x - right.x) <= EPSILON && Math.abs(left.y - right.y) <= EPSILON;
}

function orientation(a: PointMm, b: PointMm, c: PointMm): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function pointOnSegment(point: PointMm, start: PointMm, end: PointMm): boolean {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);

  if (Math.abs(cross) > EPSILON) {
    return false;
  }

  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;

  return dot >= -EPSILON && dot <= squaredLength + EPSILON;
}

function segmentsIntersect(a1: PointMm, a2: PointMm, b1: PointMm, b2: PointMm): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (
    ((o1 > EPSILON && o2 < -EPSILON) || (o1 < -EPSILON && o2 > EPSILON)) &&
    ((o3 > EPSILON && o4 < -EPSILON) || (o3 < -EPSILON && o4 > EPSILON))
  ) {
    return true;
  }

  return (
    (Math.abs(o1) <= EPSILON && pointOnSegment(b1, a1, a2)) ||
    (Math.abs(o2) <= EPSILON && pointOnSegment(b2, a1, a2)) ||
    (Math.abs(o3) <= EPSILON && pointOnSegment(a1, b1, b2)) ||
    (Math.abs(o4) <= EPSILON && pointOnSegment(a2, b1, b2))
  );
}

export function polygonSelfIntersects(points: readonly PointMm[]): boolean {
  if (points.length < 4) {
    return false;
  }

  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const a1 = points[firstIndex];
    const a2 = points[(firstIndex + 1) % points.length];

    if (!a1 || !a2) {
      continue;
    }

    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      const b1 = points[secondIndex];
      const b2 = points[(secondIndex + 1) % points.length];

      if (!b1 || !b2) {
        continue;
      }

      const adjacent =
        firstIndex === secondIndex ||
        (firstIndex + 1) % points.length === secondIndex ||
        (secondIndex + 1) % points.length === firstIndex;

      if (adjacent) {
        continue;
      }

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  return false;
}

export function polygonBounds(points: readonly PointMm[]): PolygonBoundsMm | null {
  if (points.length === 0) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function polygonCentroid(points: readonly PointMm[]): PointMm | null {
  if (points.length === 0) {
    return null;
  }

  const total = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

export function isValidPolygon(points: readonly PointMm[]): boolean {
  if (
    points.length < 3 ||
    points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
  ) {
    return false;
  }

  const uniqueVertices = new Set(points.map((point) => `${point.x}:${point.y}`));

  if (uniqueVertices.size < 3) {
    return false;
  }

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];

    if (current && next && pointsEqual(current, next)) {
      return false;
    }
  }

  return polygonArea(points) > 0 && !polygonSelfIntersects(points);
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

export function polygonContainedByPolygon(
  inner: readonly PointMm[],
  outer: readonly PointMm[],
): boolean {
  if (!isValidPolygon(inner) || !isValidPolygon(outer)) {
    return false;
  }

  if (!inner.every((point) => pointInPolygon(point, outer))) {
    return false;
  }

  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  const parameterOnSegment = (point: PointMm, start: PointMm, end: PointMm): number => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    return lengthSquared <= EPSILON
      ? 0
      : ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  };

  for (let innerIndex = 0; innerIndex < inner.length; innerIndex += 1) {
    const start = inner[innerIndex];
    const end = inner[(innerIndex + 1) % inner.length];

    if (!start || !end) {
      continue;
    }

    const rx = end.x - start.x;
    const ry = end.y - start.y;
    const parameters = [0, 1];

    for (let outerIndex = 0; outerIndex < outer.length; outerIndex += 1) {
      const edgeStart = outer[outerIndex];
      const edgeEnd = outer[(outerIndex + 1) % outer.length];

      if (!edgeStart || !edgeEnd) {
        continue;
      }

      const sx = edgeEnd.x - edgeStart.x;
      const sy = edgeEnd.y - edgeStart.y;
      const qpx = edgeStart.x - start.x;
      const qpy = edgeStart.y - start.y;
      const denominator = cross(rx, ry, sx, sy);

      if (Math.abs(denominator) > EPSILON) {
        const t = cross(qpx, qpy, sx, sy) / denominator;
        const u = cross(qpx, qpy, rx, ry) / denominator;

        if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
          parameters.push(Math.min(1, Math.max(0, t)));
        }
        continue;
      }

      if (Math.abs(cross(qpx, qpy, rx, ry)) <= EPSILON) {
        for (const point of [edgeStart, edgeEnd]) {
          if (pointOnSegment(point, start, end)) {
            parameters.push(Math.min(1, Math.max(0, parameterOnSegment(point, start, end))));
          }
        }
      }
    }

    const ordered = [...new Set(parameters.map((value) => Number(value.toFixed(12))))].sort(
      (left, right) => left - right,
    );

    for (let index = 0; index < ordered.length - 1; index += 1) {
      const left = ordered[index];
      const right = ordered[index + 1];

      if (left === undefined || right === undefined || right - left <= EPSILON) {
        continue;
      }

      const t = (left + right) / 2;
      const midpoint = {
        x: start.x + rx * t,
        y: start.y + ry * t,
      };

      if (!pointInPolygon(midpoint, outer)) {
        return false;
      }
    }
  }

  return true;
}

export function rectsOverlap(left: RectMm, right: RectMm): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.depth <= right.y ||
    right.y + right.depth <= left.y
  );
}

export function rectInsidePolygon(rect: RectMm, polygon: readonly PointMm[]): boolean {
  const corners: readonly PointMm[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.depth },
    { x: rect.x + rect.width, y: rect.y + rect.depth },
  ];

  return corners.every((corner) => pointInPolygon(corner, polygon));
}

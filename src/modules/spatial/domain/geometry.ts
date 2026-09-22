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

export function isValidPolygon(points: readonly PointMm[]): boolean {
  return (
    points.length >= 3 &&
    points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) &&
    polygonArea(points) > 0
  );
}

function pointOnSegment(point: PointMm, start: PointMm, end: PointMm): boolean {
  const cross =
    (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y);

  if (Math.abs(cross) > 1e-7) {
    return false;
  }

  const dot =
    (point.x - start.x) * (end.x - start.x) +
    (point.y - start.y) * (end.y - start.y);
  const squaredLength =
    (end.x - start.x) ** 2 + (end.y - start.y) ** 2;

  return dot >= 0 && dot <= squaredLength;
}

export function pointInPolygon(point: PointMm, polygon: readonly PointMm[]): boolean {
  let inside = false;

  for (let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1) {
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
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x;

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

export function rectInsidePolygon(rect: RectMm, polygon: readonly PointMm[]): boolean {
  const corners: readonly PointMm[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.depth },
    { x: rect.x + rect.width, y: rect.y + rect.depth },
  ];

  return corners.every((corner) => pointInPolygon(corner, polygon));
}

import Link from 'next/link';

/** Boundary authoring has one visual entry point; no JSON or fabricated default shape. */
export function RoomPolygonForm({ roomId }: Readonly<{ roomId: string }>) {
  return <Link href={`/blueprint/${roomId}`}>Open Blueprint to draw or edit the room boundary</Link>;
}

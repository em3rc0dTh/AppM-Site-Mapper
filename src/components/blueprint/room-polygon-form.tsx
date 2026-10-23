import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** Boundary authoring has one visual entry point; no JSON or fabricated default shape. */
export function RoomPolygonForm({ roomId }: Readonly<{ roomId: string }>) {
  const t = useTranslations('roomBoundary');
  return <Link href={`/blueprint/${roomId}`}>{t('openBlueprint')}</Link>;
}

export interface RecentContext {
  href: string;
  name: string;
  visitedAt: string;
}
export interface WorkspaceContext {
  lastContext: string | null;
  recent: RecentContext[];
  pinned: string[];
}
export const emptyContext = (): WorkspaceContext => ({ lastContext: null, recent: [], pinned: [] });
export function isWorkspaceHref(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 2048 &&
    /^\/(workspace|network|topology|blueprint|rack|device|power)(\/|\?|$)/.test(value) &&
    !/[\\\r\n]/.test(value) &&
    !/%(?:2f|5c|0a|0d)/i.test(value)
  );
}

export function ThradexAttribution({
  variant = 'page',
}: Readonly<{ variant?: 'page' | 'inspector' }>) {
  return (
    <div
      className={`sm-thradex-attribution sm-thradex-attribution--${variant}`}
      aria-label="Powered by Thradex"
    >
      <span>Powered by</span>
      <strong>Thradex</strong>
    </div>
  );
}

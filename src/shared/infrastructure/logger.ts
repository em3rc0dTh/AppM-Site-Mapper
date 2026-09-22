type LogLevel = 'info' | 'warn' | 'error';
type LogContext = Readonly<Record<string, unknown>>;

const sensitiveKeyPattern = /(password|secret|token|authorization|cookie|credential|api[-_]?key)/i;

function redact(context: LogContext): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[REDACTED]' : value,
    ]),
  );
}

function write(level: LogLevel, message: string, context: LogContext = {}) {
  const serialized = JSON.stringify({
    level,
    message,
    context: redact(context),
    timestamp: new Date().toISOString(),
  });

  if (level === 'error') {
    console.error(serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

export const logger = {
  info(message: string, context?: LogContext) {
    write('info', message, context);
  },
  warn(message: string, context?: LogContext) {
    write('warn', message, context);
  },
  error(message: string, context?: LogContext) {
    write('error', message, context);
  },
} as const;

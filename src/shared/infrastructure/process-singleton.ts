type ProcessSingletonRegistry = Map<string, unknown>;

type AppmGlobal = typeof globalThis & {
  __appmProcessSingletons?: ProcessSingletonRegistry;
};

function registry(): ProcessSingletonRegistry {
  const scope = globalThis as AppmGlobal;
  scope.__appmProcessSingletons ??= new Map<string, unknown>();
  return scope.__appmProcessSingletons;
}

export function getProcessSingleton<T>(key: string, factory: () => T): T {
  const values = registry();

  if (!values.has(key)) {
    values.set(key, factory());
  }

  return values.get(key) as T;
}

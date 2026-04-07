export async function loadNamedAdapter<TAdapter>(
  loadModule: () => Promise<Record<string, new (...args: any[]) => TAdapter>>,
  className: string,
): Promise<TAdapter> {
  const mod = await loadModule();
  const AdapterClass = mod[className];
  if (typeof AdapterClass !== 'function') {
    throw new Error(`Adapter module does not export ${String(className)}`);
  }
  return new AdapterClass();
}

export function ensureAdapterMethod<
  T extends object,
  K extends keyof T,
>(adapter: T, methodName: K): asserts adapter is T & Record<K, (...args: any[]) => any> {
  if (typeof adapter[methodName] !== 'function') {
    throw new Error(`Adapter does not implement ${String(methodName)}`);
  }
}

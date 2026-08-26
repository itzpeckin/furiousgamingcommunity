export function functionRoutePath(relativePath) {
  const normalized = String(relativePath).replaceAll('\\', '/');
  if (!normalized.startsWith('functions/') || !normalized.endsWith('.js')) return null;
  if (normalized.slice('functions/'.length).split('/').some(part => part.startsWith('_'))) return null;

  const withoutRoot = normalized.slice('functions/'.length, -'.js'.length);
  const routeFile = withoutRoot.endsWith('/index')
    ? withoutRoot.slice(0, -'/index'.length)
    : withoutRoot === 'index'
      ? ''
      : withoutRoot;

  const parts = routeFile.split('/').filter(Boolean).map(part => {
    const optionalCatchAll = part.match(/^\[\[([^\]]+)\]\]$/);
    if (optionalCatchAll) return `*${optionalCatchAll[1]}`;
    const parameter = part.match(/^\[([^\]]+)\]$/);
    if (parameter) return `:${parameter[1]}`;
    return part;
  });
  return `/${parts.join('/')}` || '/';
}

export function requestHandlers(source) {
  const names = new Set();
  const pattern = /export\s+(?:(?:async\s+)?function|const)\s+(onRequest(?:Get|Post|Put|Patch|Delete|Head|Options)?)/g;
  for (const match of source.matchAll(pattern)) names.add(match[1]);
  return [...names].sort();
}

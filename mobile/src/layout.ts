export function layoutForWidth(width: number) {
  const mode = width < 768 ? 'phone' : width < 1200 ? 'tablet' : 'desktop';
  return { mode, rail: mode === 'desktop' ? 104 : 0,
    detail: mode === 'phone' ? 0 : mode === 'tablet' ? 320 : 400 };
}

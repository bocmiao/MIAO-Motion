export function obsBrowserSourceUrl(origin, pathname) {
  const url = new URL(pathname || '/', origin);
  url.searchParams.set('broadcast', '1');
  url.searchParams.set('background', 'transparent');
  return url.href;
}

export function broadcastBackground(background) {
  return background === 'studio'
    ? { background: 'green', previous: 'studio' }
    : { background, previous: null };
}

export function restoreBroadcastBackground(background, previous) {
  return previous ?? background;
}

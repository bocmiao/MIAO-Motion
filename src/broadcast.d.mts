import type { Background } from './app-utils.mjs';
export function obsBrowserSourceUrl(origin: string, pathname: string): string;
export function broadcastBackground(background: Background): { background: Background; previous: Background | null };
export function restoreBroadcastBackground(background: Background, previous: Background | null): Background;

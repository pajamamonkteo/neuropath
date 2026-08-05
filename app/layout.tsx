import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'NeuroPath — one clear step at a time', description: 'Turn large school projects into calm, manageable daily steps.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#F7F4EF' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

import type { ReactNode } from 'react';
export const metadata = { title: 'Barber Shop', description: 'Book your appointment' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>{children}</body>
    </html>
  );
}

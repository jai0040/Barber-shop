import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Barber Shop Management System',
  description: 'Production-ready Barber Shop Management & Mobile Booking Platform',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased selection:bg-amber-100 selection:text-amber-900">
        {children}
      </body>
    </html>
  );
}

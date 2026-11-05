import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Barber Shop Management Platform',
    short_name: 'BarberPro',
    description: 'Modern Barber Shop Management, Point of Sale, and Mobile Customer Booking',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#d97706',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}

import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://classicbarber.com';
  const now = new Date();

  const publicRoutes = [
    '',
    '/classic-barber/services',
    '/classic-barber/book',
    '/classic-barber/barbers',
    '/classic-barber/memberships',
    '/classic-barber/reviews',
    '/classic-barber/products',
  ];

  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1.0 : route.includes('/book') ? 0.9 : 0.8,
  }));
}

import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/*/services',
          '/*/barbers',
          '/*/book',
          '/*/memberships',
          '/*/reviews',
          '/*/products',
        ],
        disallow: ['/admin/', '/worker/', '/auth/', '/my-account/'],
      },
    ],
    sitemap: 'https://classicbarber.com/sitemap.xml',
  };
}

import type { Metadata, Viewport } from 'next';
import './globals.css';
import SwRegister from './sw-register';
import InstallBanner from './InstallBanner';

export const metadata: Metadata = {
  title: 'Novum Scheduler',
  description: 'Installer scheduling for Novum Designs',
  applicationName: 'Novum Scheduler',
  appleWebApp: {
    capable: true,
    title: 'Novum',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <SwRegister />
        {children}
        <InstallBanner />
      </body>
    </html>
  );
}

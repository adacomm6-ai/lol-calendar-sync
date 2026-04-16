import type { Metadata } from 'next';

import './globals.css';
import Navbar from '@/components/Navbar';
import ConfirmDialogProvider from '@/components/ui/ConfirmDialogProvider';
import LocalProdBootstrap from '@/components/LocalProdBootstrap';

export const metadata: Metadata = {
  title: 'LOL HP',
  description: 'LPL & LCK Match Data Collection System',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/brand/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/brand-mark.svg', type: 'image/svg+xml' },
    ],
    shortcut: ['/brand/favicon-32x32.png'],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport = {
  themeColor: '#100b08',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        <LocalProdBootstrap />
        <ConfirmDialogProvider>
          <Navbar />
          <main className="flex-1 w-full px-2 py-6 sm:px-3 lg:px-4 xl:px-5 2xl:px-6">
            {children}
          </main>
        </ConfirmDialogProvider>
      </body>
    </html>
  );
}

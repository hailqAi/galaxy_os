import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';
import PortalShell from './portal-shell';
import localFont from 'next/font/local';

const beVietnam = localFont({
  src: [
    { path: './assets/be-vietnam-pro-3.ttf', weight: '400' },
    { path: './assets/be-vietnam-pro-1.ttf', weight: '500' },
    { path: './assets/be-vietnam-pro-2.ttf', weight: '600' },
    { path: './assets/be-vietnam-pro-0.ttf', weight: '700' },
  ],
  variable: '--font-be-vietnam-pro',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Galaxy OS',
  description: 'Hệ thống vận hành Galaxy Centre',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await connection();
  return (
    <html lang="vi">
      <body className={beVietnam.variable}>
        <PortalShell
          chatEnabled={process.env.FEATURE_PROJECT_CHAT === 'true'}
          aiEnabled={process.env.FEATURE_PROJECT_AI === 'true'}
        >
          {children}
        </PortalShell>
      </body>
    </html>
  );
}

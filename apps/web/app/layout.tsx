import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import PortalShell from './portal-shell';

export const metadata: Metadata = {
  title: 'Galaxy OS',
  description: 'Hệ thống vận hành Galaxy Centre',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <PortalShell>{children}</PortalShell>
      </body>
    </html>
  );
}

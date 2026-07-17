import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Galaxy OS',
  description: 'Hệ thống vận hành Galaxy Centre',
};

const navigation = [
  ['/', 'Tổng quan'],
  ['/projects', 'Dự án'],
  ['/settings', 'Cài đặt'],
] as const;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
          <aside className="bg-ink px-5 py-6 text-white">
            <Link className="text-xl font-semibold tracking-wide" href="/">
              Galaxy OS
            </Link>
            <p className="mt-1 text-sm text-white/60">Galaxy Centre</p>
            <nav
              aria-label="Điều hướng chính"
              className="mt-8 flex gap-2 md:flex-col"
            >
              {navigation.map(([href, label]) => (
                <Link
                  className="rounded px-3 py-2 text-sm hover:bg-white/10"
                  href={href}
                  key={href}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
          <div>
            <header className="flex min-h-16 items-center justify-between border-b border-black/10 bg-white px-6">
              <span className="font-medium">Không gian vận hành</span>
              <span className="text-sm text-black/60">Môi trường nội bộ</span>
            </header>
            <main className="p-6 lg:p-10">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';
import { settingsLinks } from './model';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="settings-title">
      <h1 className="text-3xl font-semibold" id="settings-title">
        Cài đặt
      </h1>
      <nav aria-label="Cài đặt" className="mt-5 flex flex-wrap gap-2">
        {settingsLinks.map(([href, label]) => (
          <Link
            className="rounded border border-black/15 bg-white px-3 py-2 text-sm hover:border-brass"
            href={href}
            key={href}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </section>
  );
}

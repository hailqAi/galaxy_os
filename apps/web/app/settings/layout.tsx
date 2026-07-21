import type { ReactNode } from 'react';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="settings-title">
      <h1 className="text-3xl font-semibold" id="settings-title">
        Cài đặt
      </h1>
      <div className="mt-6">{children}</div>
    </section>
  );
}

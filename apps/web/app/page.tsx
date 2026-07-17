export default function DashboardPage() {
  return (
    <section aria-labelledby="page-title">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-brass">
        Sprint 0
      </p>
      <h1 className="mt-2 text-3xl font-semibold" id="page-title">
        Tổng quan
      </h1>
      <div className="mt-8 max-w-3xl rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium">Nền tảng Galaxy OS đã sẵn sàng</h2>
        <p className="mt-2 text-black/65">
          Các chức năng ERP sẽ được bổ sung theo từng sprint đã phê duyệt.
        </p>
      </div>
    </section>
  );
}

import Link from 'next/link';
export default function ForbiddenPage() {
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <section className="panel max-w-md">
        <h1 className="text-3xl font-semibold">Không có quyền truy cập</h1>
        <p className="mt-3">Tài khoản của bạn không được phép mở trang này.</p>
        <Link className="mt-5 inline-block text-brass underline" href="/">
          Về trang chủ
        </Link>
      </section>
    </main>
  );
}

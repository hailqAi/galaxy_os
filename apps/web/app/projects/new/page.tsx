import Link from 'next/link';
import { ProjectForm } from '../project-form';
export default function NewProjectPage() {
  return (
    <div className="grid gap-5">
      <p>
        <Link href="/projects">Dự án</Link> / Tạo mới
      </p>
      <header>
        <h1 className="text-2xl font-semibold">
          CHUẨN BỊ ĐẦU TƯ &amp; KHỞI TẠO DỰ ÁN
        </h1>
        <p className="text-sm text-black/60">
          Nhập thông tin để tạo một dự án mới và mở Bước 1.
        </p>
      </header>
      <ProjectForm />
    </div>
  );
}

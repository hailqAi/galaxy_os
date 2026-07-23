import Link from 'next/link';
import { ProjectForm } from '../project-form';
export default function NewProjectPage() {
  return (
    <div className="grid gap-5">
      <p>
        <Link href="/projects">Dự án</Link> / Tạo mới
      </p>
      <header>
        <h1 className="text-2xl font-semibold">Tạo dự án</h1>
        <p className="text-sm text-black/60">Khởi tạo Project Hub mới</p>
      </header>
      <ProjectForm />
    </div>
  );
}

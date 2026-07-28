import Link from 'next/link';
import { LeadForm } from '../lead-form';

export default function NewLeadPage() {
  return (
    <div className="grid gap-5">
      <p className="text-sm">
        <Link href="/crm/leads">Khách hàng tiềm năng</Link> / Thêm mới
      </p>
      <header>
        <h1 className="text-2xl font-semibold">Thêm Lead</h1>
        <p className="text-sm text-black/60">
          Ghi nhận khách hàng tiềm năng mới
        </p>
      </header>
      <LeadForm />
    </div>
  );
}

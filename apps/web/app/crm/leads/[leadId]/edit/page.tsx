'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import { LeadForm } from '../../lead-form';

type Lead = Parameters<typeof LeadForm>[0]['lead'];
export default function EditLeadPage() {
  const id = String(useParams().leadId);
  const [lead, setLead] = useState<Lead>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<NonNullable<Lead>>(`/leads/${id}`)
      .then(setLead)
      .catch((reason: Error) => setError(reason.message));
  }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!lead) return <p role="status">Đang tải Lead…</p>;
  return (
    <div className="grid gap-5">
      <p className="text-sm">
        <Link href={`/crm/leads/${id}`}>{lead.name}</Link> / Chỉnh sửa
      </p>
      <h1 className="text-2xl font-semibold">Chỉnh sửa Lead</h1>
      <LeadForm lead={lead} />
    </div>
  );
}

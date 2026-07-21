'use client';

import { useParams } from 'next/navigation';
import { UserDetail } from '../user-detail';

export default function Page() {
  return <UserDetail edit userId={String(useParams().userId)} />;
}

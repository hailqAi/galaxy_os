'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { ProjectForm } from '../../project-form';
type Project = Parameters<typeof ProjectForm>[0]['project'];
export default function EditProjectPage() {
  const id = String(useParams().projectId);
  const [project, setProject] = useState<Project>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<NonNullable<Project>>(`/projects/${id}`)
      .then(setProject)
      .catch((reason: Error) => setError(reason.message));
  }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!project) return <p role="status">Đang tải dự án…</p>;
  return (
    <div className="grid gap-5">
      <p>
        <Link href={`/projects/${id}`}>{project.name}</Link> / Chỉnh sửa
      </p>
      <h1 className="text-2xl font-semibold">Chỉnh sửa dự án</h1>
      <ProjectForm project={project} />
    </div>
  );
}

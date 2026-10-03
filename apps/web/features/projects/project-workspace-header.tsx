'use client';
import React from 'react';
import Link from 'next/link';

export const projectGroups = [
  ['CONSULTING', 'Tư vấn & báo giá'],
  ['COMMERCIAL', 'Hợp đồng & tài chính'],
  ['SUPPLY', 'Cung ứng & giao hàng'],
  ['AFTER_SALES', 'Thi công & hậu mãi'],
] as const;

export function ProjectWorkspaceHeader({
  projectId,
  name = 'Dự án',
  code,
  active,
  permissions,
  aiEnabled = false,
}: {
  projectId: string;
  name?: string;
  code?: string;
  active: string;
  permissions: string[];
  aiEnabled?: boolean;
}) {
  const base = `/projects/${projectId}`;
  const roomAccess = active === 'work' || !permissions.includes('project.read');
  return (
    <header className="project-workspace-header">
      <p className="breadcrumb">
        <Link href={roomAccess ? '/work' : '/projects'}>
          {roomAccess ? '← Các dự án được cấp' : 'Dự án'}
        </Link>
        <span>/</span>
        {name}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          {code && <p className="mt-1 text-sm text-slate-500">{code}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {aiEnabled && (
            <Link className="ai-launch" href={`${base}/ai`}>
              ✦ Hỏi Galaxy AI
            </Link>
          )}
          {permissions.includes('project.read') && (
            <details className="workspace-more">
              <summary>Quản lý hồ sơ</summary>
              <div className="panel grid gap-2">
                <Link href={`${base}/stage-1`}>Quy trình & giai đoạn</Link>
                <Link href={`${base}/members`}>Thành viên & quyền</Link>
                {permissions.includes('quotation.read') && (
                  <Link href={`${base}/quotations`}>Báo giá</Link>
                )}
                {permissions.includes('contract.read') && (
                  <Link href={`${base}/contracts`}>Hợp đồng</Link>
                )}
                <Link href={`${base}/activity`}>Lịch sử hoạt động</Link>
              </div>
            </details>
          )}
        </div>
      </div>
      <nav className="workspace-tabs" aria-label="Không gian dự án">
        {[
          ['overview', 'Tổng quan', permissions.includes('project.read')],
          ['work', 'Làm việc', true],
          [
            'products',
            'Hạng mục',
            permissions.includes('project.product.view'),
          ],
          ['files', 'Hồ sơ & kiến thức', permissions.includes('file.read')],
        ].map(([route, label, allowed]) =>
          allowed ? (
            <Link
              key={String(route)}
              href={`${base}/${route}`}
              aria-current={active === route ? 'page' : undefined}
            >
              {label}
            </Link>
          ) : (
            <span key={String(route)} title="Chưa được cấp quyền">
              {label}
            </span>
          ),
        )}
      </nav>
    </header>
  );
}

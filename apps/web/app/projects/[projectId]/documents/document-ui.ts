import { projectDomainLabel } from '../../../../features/projects/project-domain-labels';

export const documentPresentationLabel = (
  kind: 'document' | 'stage' | 'status' | 'step',
  value: string,
) => {
  if (kind === 'document' && !/^[A-Z][A-Z0-9_]+$/.test(value)) return value;
  if (kind === 'status' && value === 'MISSING') return 'Chưa có file';
  return projectDomainLabel(
    kind,
    value,
    kind === 'status' ? 'requiredDocument' : undefined,
  );
};

export const documentStatusClass = (status: string) =>
  ({
    MISSING: 'bg-amber-100 text-amber-800',
    DRAFT: 'bg-slate-100 text-slate-700',
    PENDING_REVIEW: 'bg-purple-100 text-purple-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-red-100 text-red-800',
    SUPERSEDED: 'bg-slate-200 text-slate-600',
    NOT_APPLICABLE: 'bg-slate-100 text-slate-600',
  })[status] ?? 'bg-slate-100 text-slate-700';

export const documentActions = (
  status: string,
  hasFile: boolean,
  permissions: string[],
) => ({
  edit:
    permissions.includes('project.document.manage') &&
    ['MISSING', 'DRAFT', 'REJECTED'].includes(status),
  upload:
    permissions.includes('project.document.manage') &&
    permissions.includes('file.upload') &&
    ['MISSING', 'DRAFT', 'REJECTED', 'SUPERSEDED'].includes(status),
  submit:
    permissions.includes('project.document.manage') &&
    hasFile &&
    status === 'DRAFT',
  review:
    permissions.includes('project.document.review') &&
    status === 'PENDING_REVIEW',
  notApplicable:
    permissions.includes('project.document.review') &&
    !['APPROVED', 'SUPERSEDED', 'NOT_APPLICABLE'].includes(status),
  restore:
    permissions.includes('project.document.review') &&
    status === 'NOT_APPLICABLE',
  supersede:
    permissions.includes('project.document.manage') && status === 'APPROVED',
});

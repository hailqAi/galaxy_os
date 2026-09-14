import { describe, expect, it } from 'vitest';
import {
  documentActions,
  documentPresentationLabel,
  documentStatusClass,
} from './document-ui';

describe('required document UI rules', () => {
  it('presents archive codes as Vietnamese business labels', () => {
    expect(documentPresentationLabel('status', 'MISSING')).toBe('Chưa có file');
    expect(documentPresentationLabel('status', 'PENDING_REVIEW')).toBe(
      'Đang chờ phê duyệt',
    );
    expect(documentPresentationLabel('stage', 'STAGE_1')).toBe('Giai đoạn 1');
    expect(documentPresentationLabel('step', 'ASSIGNMENT')).toBe(
      'Tiếp nhận & Phân công',
    );
    expect(documentPresentationLabel('document', 'PROJECT_DOSSIER')).toBe(
      'Hồ sơ khởi tạo dự án',
    );
    expect(documentPresentationLabel('document', 'Biên bản khảo sát')).toBe(
      'Biên bản khảo sát',
    );
  });

  it('keeps every authoritative status color distinct', () => {
    expect(documentStatusClass('MISSING')).toContain('amber');
    expect(documentStatusClass('DRAFT')).toContain('slate');
    expect(documentStatusClass('PENDING_REVIEW')).toContain('purple');
    expect(documentStatusClass('APPROVED')).toContain('emerald');
    expect(documentStatusClass('REJECTED')).toContain('red');
    expect(documentStatusClass('SUPERSEDED')).toContain('slate-200');
    expect(documentStatusClass('NOT_APPLICABLE')).toContain('slate-100');
  });

  it('shows only state- and permission-valid actions', () => {
    expect(
      documentActions('DRAFT', true, ['project.document.manage']),
    ).toMatchObject({ edit: true, upload: false, submit: true, review: false });
    expect(
      documentActions('DRAFT', true, [
        'project.document.manage',
        'file.upload',
      ]),
    ).toMatchObject({ edit: true, upload: true, submit: true });
    expect(
      documentActions('PENDING_REVIEW', true, ['project.document.review']),
    ).toMatchObject({ edit: false, submit: false, review: true });
    expect(
      documentActions('APPROVED', true, ['project.document.manage']),
    ).toMatchObject({ edit: false, submit: false, supersede: true });
    expect(documentActions('DRAFT', false, [])).toEqual({
      edit: false,
      upload: false,
      submit: false,
      review: false,
      notApplicable: false,
      restore: false,
      supersede: false,
    });
  });

  it('does not invent actions for terminal document states', () => {
    expect(
      documentActions('NOT_APPLICABLE', true, [
        'project.document.manage',
        'project.document.review',
      ]),
    ).toEqual({
      edit: false,
      upload: false,
      submit: false,
      review: false,
      notApplicable: false,
      restore: true,
      supersede: false,
    });
    expect(
      documentActions('SUPERSEDED', true, [
        'project.document.manage',
        'project.document.review',
        'file.upload',
      ]),
    ).toEqual({
      edit: false,
      upload: true,
      submit: false,
      review: false,
      notApplicable: false,
      restore: false,
      supersede: false,
    });
  });

  it('requires a replacement upload before a rejected document can be resubmitted', () => {
    expect(
      documentActions('REJECTED', true, [
        'project.document.manage',
        'file.upload',
      ]),
    ).toMatchObject({ upload: true, submit: false });
  });
});

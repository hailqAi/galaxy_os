import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import {
  NewProjectFormView,
  createNewProjectSubmitter,
  finishProjectCreation,
  isCurrentCustomerDetail,
  loadProjectCustomer,
  projectFormError,
} from './project-form';

const values = {
  name: '  Galaxy Tower  ',
  estimatedInvestmentAmount: '35.000.000.000 ₫',
  customerId: 'customer-1',
  primaryContactId: 'contact-1',
};

describe('new Project form', () => {
  it('localizes authorization and validation failures with actionable guidance', () => {
    expect(projectFormError(new ApiError('Forbidden', 403))).toBe(
      'Bạn không có quyền khởi tạo dự án.',
    );
    expect(projectFormError(new ApiError('Bad Request', 400))).toBe(
      'Thông tin dự án chưa hợp lệ. Vui lòng kiểm tra lại.',
    );
    expect(projectFormError(new ApiError('Conflict', 409))).toBe(
      'Yêu cầu tạo dự án đã được xử lý trước đó.',
    );
  });

  it('renders only neutral Galaxy Project fields without legacy public-sector taxonomy', () => {
    const markup = renderToStaticMarkup(
      <NewProjectFormView
        customers={[
          {
            id: 'customer-1',
            displayName: 'Galaxy Centre',
            contacts: [{ id: 'contact-1', displayName: 'Trần Đại Diện' }],
          },
        ]}
        onSubmit={() => undefined}
      />,
    );

    expect(markup.match(/data-business-input=/g) ?? []).toHaveLength(3);
    expect(markup).toContain('TÊN DỰ ÁN *');
    expect(markup).toContain('GIÁ TRỊ DỰ KIẾN (VND)');
    expect(markup).toContain('KHÁCH HÀNG / ĐẠI DIỆN KHÁCH HÀNG');
    expect(markup).toContain('KHỞI TẠO DỰ ÁN');
    expect(markup).not.toMatch(
      /ĐẦU TƯ XÂY DỰNG|NGUỒN VỐN|CHỦ ĐẦU TƯ|PUBLIC_INVESTMENT|ODA|PPP/,
    );
    for (const forbidden of ['Mã dự án', 'PLANNING', 'SURVEY', 'ON_TRACK'])
      expect(markup).not.toContain(forbidden);
  });

  it('reuses one command key across retry and double submit and keeps money as a decimal string', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({
        id: 'project-new',
        code: 'PRJ-NEW',
        stageOneUrl: '/projects/project-new/stage-1?step=1',
      });
    const submit = createNewProjectSubmitter(request, 'create-command-1');

    await expect(submit(values)).rejects.toThrow('offline');
    await Promise.all([submit(values), submit(values)]);

    expect(request).toHaveBeenCalledTimes(3);
    for (const [, init] of request.mock.calls) {
      expect(init).toMatchObject({ method: 'POST' });
      expect(JSON.parse(String(init?.body))).toEqual({
        name: 'Galaxy Tower',
        estimatedInvestmentAmount: '35000000000',
        customerId: 'customer-1',
        primaryContactId: 'contact-1',
        idempotencyKey: 'create-command-1',
      });
    }
  });

  it('loads representatives for the selected investor from the scoped Customer detail', async () => {
    const request = vi.fn().mockResolvedValue({
      id: 'customer-1',
      displayName: 'Galaxy Centre',
      contacts: [{ id: 'contact-1', displayName: 'Trần Đại Diện' }],
    });

    await expect(loadProjectCustomer('customer-1', request)).resolves.toEqual({
      id: 'customer-1',
      displayName: 'Galaxy Centre',
      contacts: [{ id: 'contact-1', displayName: 'Trần Đại Diện' }],
    });
    expect(request).toHaveBeenCalledWith('/customers/customer-1');
  });

  it('ignores a customer detail response after another investor is selected', () => {
    expect(isCurrentCustomerDetail('customer-b', 'customer-a')).toBe(false);
    expect(isCurrentCustomerDetail('customer-b', 'customer-b')).toBe(true);
  });

  it('refreshes route data and replaces with the exact server stageOneUrl', () => {
    const refresh = vi.fn();
    const replace = vi.fn();

    finishProjectCreation(
      {
        id: 'project-new',
        code: 'PRJ-NEW',
        stageOneUrl: '/projects/project-new/stage-1?step=1',
      },
      refresh,
      replace,
    );

    expect(refresh).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith(
      '/projects/project-new/stage-1?step=1',
    );
  });

  it('rejects a create response that points outside the new Project Stage 1', () => {
    const refresh = vi.fn();
    const replace = vi.fn();

    expect(() =>
      finishProjectCreation(
        {
          id: 'project-new',
          code: 'PRJ-NEW',
          stageOneUrl: '/projects/another-project/stage-1?step=1',
        },
        refresh,
        replace,
      ),
    ).toThrow('Đường dẫn Giai đoạn 1 không hợp lệ.');
    expect(refresh).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import {
  definitionInputFromForm,
  OptionalDocumentMatrix,
  optionalDocumentDuplicateMessage,
  saveOptionalDocumentDefinition,
} from './stage-1/optional-document-matrix';
import * as optionalDocumentMatrix from './stage-1/optional-document-matrix';
import type { ProjectDocumentQueueItem } from '../../../features/projects/project-document-upload-queue';
import * as stageOne from './project-stage-one';

const legacyData = {
  project: { id: 'project-701', code: 'PRJ-701', name: 'Galaxy Tower' },
  initiation: {
    name: 'Galaxy Tower',
    estimatedInvestmentAmount: '35000000000.00',
    fundingSource: 'PUBLIC_INVESTMENT_2026',
    customerId: 'customer-1',
    primaryContactId: 'contact-1',
  },
  steps: [
    {
      number: 1,
      step: 'ASSIGNMENT',
      label: 'TIẾP NHẬN & PHÂN CÔNG',
      status: 'IN_PROGRESS',
      documentTypes: [
        {
          id: 'workflow-definition-1',
          name: 'Văn bản chủ trương đầu tư',
          customNameRequired: false,
          required: true,
        },
        {
          id: 'workflow-definition-other',
          name: 'Hồ sơ khác',
          customNameRequired: true,
          required: false,
        },
      ],
    },
    {
      number: 2,
      step: 'SURVEY',
      label: 'KHẢO SÁT & THIẾT LẬP BỘ MÁY',
      status: 'NOT_STARTED',
      documentTypes: [
        {
          id: 'workflow-definition-2',
          name: 'Biên bản khảo sát',
          customNameRequired: false,
          required: true,
        },
      ],
    },
    {
      number: 3,
      step: 'PROPOSAL',
      label: 'LẬP & THẨM ĐỊNH HỒ SƠ ĐỀ XUẤT',
      status: 'NOT_STARTED',
      documentTypes: [
        {
          id: 'workflow-definition-3',
          name: 'Thuyết minh',
          customNameRequired: false,
          required: true,
        },
      ],
    },
    {
      number: 4,
      step: 'FINANCIAL_PLANNING',
      label: 'XÁC ĐỊNH NGUỒN VỐN & KẾ HOẠCH',
      status: 'NOT_STARTED',
      documentTypes: [
        {
          id: 'workflow-definition-4',
          name: 'Kế hoạch vốn',
          customNameRequired: false,
          required: true,
        },
      ],
    },
    {
      number: 5,
      step: 'KICKOFF_APPROVAL',
      label: 'PHÊ DUYỆT DỰ ÁN',
      status: 'DONE',
      documentTypes: [
        {
          id: 'workflow-definition-5',
          name: 'Quyết định phê duyệt dự án đầu tư xây dựng',
          customNameRequired: false,
          required: true,
        },
      ],
    },
  ],
  options: {
    projects: [
      { id: 'project-701', code: 'PRJ-701', name: 'Galaxy Tower' },
      { id: 'project-702', code: 'PRJ-702', name: 'Galaxy Annex' },
    ],
    members: [
      { id: 'actor-1', displayName: 'Nguyễn Minh', email: 'minh@example.com' },
      { id: 'actor-2', displayName: 'Hà Linh', email: 'linh@example.com' },
    ],
  },
  documentDefinitions: [
    {
      id: 'definition-1',
      name: 'Văn bản chủ trương / Quyết định giao nhiệm vụ',
      workstreamKey: 'ASSIGNMENT',
      description: 'Căn cứ khởi tạo dự án',
      position: 0,
      initialMatrix: true,
      active: true,
      required: false,
      files: [],
    },
    {
      id: 'definition-2',
      name: 'Báo cáo khảo sát & Phương án nhân sự',
      workstreamKey: 'SURVEY',
      position: 1,
      initialMatrix: true,
      active: true,
      required: false,
      files: [],
    },
    {
      id: 'definition-3',
      name: 'Văn bản xác nhận / Cân đối nguồn vốn',
      workstreamKey: 'FINANCIAL_PLANNING',
      position: 3,
      initialMatrix: true,
      active: true,
      required: false,
      files: [],
    },
    {
      id: 'definition-4',
      name: 'Hồ sơ Báo cáo Kinh tế - Kỹ thuật',
      workstreamKey: 'PROPOSAL',
      position: 2,
      initialMatrix: true,
      active: true,
      required: false,
      files: [],
    },
    {
      id: 'definition-5',
      name: 'Quyết định phê duyệt Báo cáo Kinh tế - Kỹ thuật',
      workstreamKey: 'KICKOFF_APPROVAL',
      position: 4,
      initialMatrix: true,
      active: true,
      required: false,
      files: [],
    },
    {
      id: 'workflow-definition-1',
      name: 'Văn bản chủ trương đầu tư',
      workstreamKey: 'ASSIGNMENT',
      position: 0,
      initialMatrix: false,
      active: true,
      required: false,
      files: [],
    },
    {
      id: 'workflow-definition-other',
      name: 'Hồ sơ khác',
      workstreamKey: 'ASSIGNMENT',
      position: 1,
      initialMatrix: false,
      active: true,
      required: false,
      files: [],
    },
    {
      id: 'workflow-definition-2',
      name: 'Biên bản khảo sát',
      workstreamKey: 'SURVEY',
      position: 0,
      initialMatrix: false,
      active: true,
      required: false,
      files: [],
    },
    {
      id: 'workflow-definition-3',
      name: 'Thuyết minh',
      workstreamKey: 'PROPOSAL',
      position: 0,
      initialMatrix: false,
      active: true,
      required: false,
      files: [],
    },
    {
      id: 'workflow-definition-4',
      name: 'Kế hoạch vốn',
      workstreamKey: 'FINANCIAL_PLANNING',
      position: 0,
      initialMatrix: false,
      active: true,
      required: false,
      files: [],
    },
    {
      id: 'workflow-definition-5',
      name: 'Quyết định phê duyệt dự án đầu tư xây dựng',
      workstreamKey: 'KICKOFF_APPROVAL',
      position: 0,
      initialMatrix: false,
      active: true,
      required: false,
      files: [],
    },
  ],
  permittedCommands: { manageDocumentDefinitions: true },
  capabilities: {
    canSwitchProject: true,
    canManageProjectAccess: true,
    canReadDocuments: true,
    canUploadDocuments: true,
    canSubmitDocuments: true,
    canManageDocumentTypes: true,
    canCompleteStep: true,
    canReopenStep: true,
    canPreviewFiles: true,
    canDownloadFiles: true,
    canDeleteProjectDocuments: true,
    canDeleteProject: true,
    canManageKeyDossier: true,
    canDeleteKeyDossierItem: true,
    canDeleteAttachment: true,
    canUploadWorkflowDocuments: true,
    canUploadKeyDossierAttachments: true,
    canReadFinance: true,
    canManageFinance: true,
  },
  documents: [
    {
      id: 'document-1',
      source: 'STAGE_ONE',
      legacyRequirementId: 'definition-1',
      contextType: 'STAGE_MATRIX_DOCUMENT',
      step: 'ASSIGNMENT',
      documentType: 'Văn bản chủ trương đầu tư',
      displayName: 'Chủ trương 2026',
      status: 'UPLOADED',
      currentVersion: 1,
      currentFileAssetId: 'file-1',
      submittedAt: '2026-08-12T03:04:05.000Z',
      submittedOfficer: { id: 'actor-1', displayName: 'Nguyễn Minh' },
      currentFileAsset: {
        id: 'file-1',
        originalFilename: 'chu-truong.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '1024',
      },
    },
    {
      id: 'document-2',
      source: 'STAGE_ONE',
      legacyRequirementId: 'workflow-definition-2',
      contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
      step: 'SURVEY',
      documentType: 'Biên bản khảo sát',
      displayName: 'Biên bản khảo sát',
      status: 'UPLOADED',
      currentVersion: 1,
      currentFileAssetId: 'file-2',
      currentFileAsset: {
        id: 'file-2',
        originalFilename: 'survey.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '512',
      },
    },
    {
      id: 'document-3',
      source: 'STAGE_ONE',
      legacyRequirementId: 'definition-1',
      contextType: 'STAGE_MATRIX_DOCUMENT',
      step: 'ASSIGNMENT',
      documentType: 'Văn bản chủ trương đầu tư',
      displayName: 'Chủ trương bổ sung',
      status: 'UPLOADED',
      currentVersion: 1,
      currentFileAssetId: 'file-3',
      submittedAt: '2026-08-12T04:04:05.000Z',
      submittedOfficer: { id: 'actor-1', displayName: 'Nguyễn Minh' },
      currentFileAsset: {
        id: 'file-3',
        originalFilename: 'chu-truong-bo-sung.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '1024',
      },
    },
    {
      id: 'workflow-document-1',
      source: 'STAGE_ONE',
      legacyRequirementId: 'workflow-definition-1',
      contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
      step: 'ASSIGNMENT',
      documentType: 'Văn bản chủ trương đầu tư',
      displayName: 'Biên bản bổ sung',
      status: 'UPLOADED',
      currentVersion: 1,
      currentFileAssetId: 'workflow-file-1',
      submittedAt: '2026-08-12T05:04:05.000Z',
      submittedOfficer: { id: 'actor-1', displayName: 'Nguyễn Minh' },
      currentFileAsset: {
        id: 'workflow-file-1',
        originalFilename: 'workflow.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '1024',
      },
    },
  ],
  approval: null,
} as const;

const data = {
  ...legacyData,
  keyDossier: {
    milestones: [],
    items: legacyData.documentDefinitions.filter(
      ({ initialMatrix }) => initialMatrix,
    ),
    attachments: legacyData.documents.filter(
      ({ contextType }) => contextType === 'STAGE_MATRIX_DOCUMENT',
    ),
  },
  workflow: {
    definitions: legacyData.documentDefinitions.filter(
      ({ initialMatrix }) => !initialMatrix,
    ),
    documents: legacyData.documents.filter(
      ({ contextType }) => contextType === 'STAGE_WORKFLOW_STEP_DOCUMENT',
    ),
  },
} as const;

const actor = {
  userId: 'actor-1',
  displayName: 'Nguyễn Minh',
  organization: { id: 'organization-1', name: 'Galaxy' },
  permissions: [
    'project.update',
    'estimate.update',
    'estimate.read',
    'project.manage_members',
    'file.upload',
    'file.download',
    'file.delete',
    'project.document.manage',
  ],
};

const constraints = { maxBytes: 20, allowedExtensions: ['.pdf', '.docx'] };
const queuedDocument = {
  idempotencyKey: 'queue-item-1',
  projectId: 'project-701',
  definitionId: 'workflow-definition-1',
  definitionName: 'Văn bản chủ trương đầu tư',
  contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
  targetType: 'STAGE_DOCUMENT',
  stageKey: 'STAGE_1',
  workstreamKey: 'ASSIGNMENT',
  submittedOfficerId: 'actor-1',
  filename: 'pending.pdf',
  size: 4,
  mimeType: 'application/pdf',
  status: 'QUEUED',
  progress: 0,
  confirmedBytes: 0,
  attempts: 0,
  error: '',
  valid: true,
} satisfies ProjectDocumentQueueItem;
afterEach(() => vi.unstubAllGlobals());

describe('simplified Stage 1 cutover', () => {
  it('renders an independent Key Dossier milestone instead of a Workflow Step', () => {
    const definition = {
      ...data.documentDefinitions[0]!,
      workstreamKey: 'LEGACY_SNAPSHOT',
      referenceMilestoneId: 'milestone-contract',
      referenceMilestone: {
        id: 'milestone-contract',
        code: 'HS-02',
        name: 'Căn cứ hợp đồng',
        position: 1,
        active: true,
      },
    };
    const markup = renderToStaticMarkup(
      <OptionalDocumentMatrix
        actor={actor}
        capabilities={data.capabilities}
        definitions={[definition]}
        milestones={[definition.referenceMilestone]}
        officerOptions={data.options.members}
        onChanged={() => undefined}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        projectId="project-701"
        queueByWorkstream={{}}
      />,
    );

    expect(markup).toContain('HS-02 — Căn cứ hợp đồng');
    expect(markup).toContain('Mốc phân loại riêng của Hồ sơ chủ chốt');
    expect(markup).not.toContain('Bước 1 —');
  });

  it('renders item deletion separately from attachment deletion', () => {
    const markup = renderToStaticMarkup(
      <OptionalDocumentMatrix
        actor={actor}
        capabilities={data.capabilities}
        definitions={[data.documentDefinitions[0]!]}
        milestones={[]}
        officerOptions={data.options.members}
        onChanged={() => undefined}
        onDeleteItem={() => undefined}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        projectId="project-701"
        queueByWorkstream={{}}
      />,
    );

    expect(markup).toContain('Xóa mục');
    expect(markup).not.toContain('Xóa tệp');
  });

  it.each([
    ['application/pdf', true],
    ['image/jpeg', true],
    ['image/png', true],
    ['image/webp', true],
    ['video/mp4', true],
    ['text/plain', true],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      false,
    ],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      false,
    ],
    ['text/csv', false],
    ['image/vnd.dwg', false],
    ['application/zip', false],
  ])('classifies the Project preview MIME %s', (mimeType, expected) => {
    const predicate = (
      optionalDocumentMatrix as unknown as {
        isPreviewableProjectFile?: (value?: string) => boolean;
      }
    ).isPreviewableProjectFile;

    expect(predicate).toBeTypeOf('function');
    expect(predicate?.(mimeType)).toBe(expected);
  });

  it('exports the concise workspace and URL mapper', () => {
    expect(stageOne.SimpleStageOneView).toBeTypeOf('function');
    expect(stageOne.stepFromSearchParam).toBeTypeOf('function');
  });

  it('renders an actionable initial-load error instead of a permanent status', () => {
    const loading = renderToStaticMarkup(<stageOne.StageOneLoadState />);
    const failed = renderToStaticMarkup(
      <stageOne.StageOneLoadState
        error="Không thể tải dự án."
        onRetry={() => undefined}
      />,
    );

    expect(loading).toContain('role="status"');
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('Không thể tải dự án.');
    expect(failed).toContain('THỬ TẢI LẠI');
  });

  it('renders saved initiation values in explicit existing-project edit mode and no create CTA', () => {
    if (!stageOne.SimpleStageOneView) return;
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        constraints={constraints}
        customers={[
          {
            id: 'customer-1',
            displayName: 'Galaxy Centre',
            contacts: [
              {
                id: 'contact-1',
                displayName: 'Trần Đại Diện',
                isPrimary: true,
              },
            ],
          },
        ]}
        data={data}
        onCompleteStep={() => undefined}
        onEditInitiation={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={1}
      />,
    );

    expect(markup).toContain('GIAI ĐOẠN 1');
    expect(markup).not.toContain('STAGE 1');
    expect(markup).not.toContain('BCNCTKT');
    expect(markup).toContain('KHỞI TẠO, HỒ SƠ DỰ ÁN &amp; PHÊ DUYỆT');
    expect(markup.match(/data-project-stage-header=/g) ?? []).toHaveLength(1);
    expect(markup.match(/data-project-stage-header-row=/g) ?? []).toHaveLength(
      2,
    );
    expect(markup.match(/data-stage-control=/g) ?? []).toHaveLength(5);
    expect(markup).toMatch(
      /^<main class="[^"]*mx-auto[^"]*w-full[^"]*max-w-\[1280px\]/,
    );
    const headerMarkup = markup.match(
      /<header[^>]*data-project-stage-header[\s\S]*?<\/header>/,
    )?.[0];
    expect(headerMarkup).toBeDefined();
    expect(headerMarkup).not.toContain('data-status=');
    expect(markup).toContain('THÔNG TIN KHỞI TẠO DỰ ÁN');
    expect(markup).toContain('Galaxy Tower');
    expect(markup).toContain('35.000.000.000');
    expect(markup).not.toMatch(
      /Ngân sách Đầu tư công|ĐẦU TƯ XÂY DỰNG|CHỦ ĐẦU TƯ|Ban QLDA|BCNCTKT/,
    );
    expect(markup).toContain('Trần Đại Diện');
    expect(markup).toContain('aria-label="Chỉnh sửa thông tin khởi tạo dự án"');
    expect(markup).not.toContain('KHỞI TẠO &amp; KÝ PHÊ DUYỆT DỰ ÁN');
    expect(markup).not.toContain('POST');
    for (const label of [
      'Tiếp nhận &amp; Phân công',
      'Khảo sát &amp; Thiết lập bộ máy',
      'Lập &amp; Thẩm định hồ sơ đề xuất',
      'Xác định nguồn vốn &amp; Kế hoạch',
      'Phê duyệt dự án',
    ])
      expect(markup).toContain(label);
    for (const forbidden of [
      'ĐỊNH TUYẾN NGHIỆP VỤ',
      'VIỆC CẦN XỬ LÝ',
      'CỜ ĐỎ',
      'BAN ĐIỀU HÀNH',
      'MỨC ĐỘ SẴN SÀNG',
      'NGÂN SÁCH SƠ BỘ',
      'Preliminary Revenue',
      'TODO',
      'DONE',
    ])
      expect(markup).not.toContain(forbidden);
  });

  it('renders update fields and save action only while editing', () => {
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[
          {
            id: 'customer-1',
            displayName: 'Galaxy Centre',
            contacts: [
              {
                id: 'contact-1',
                displayName: 'Trần Đại Diện',
                isPrimary: true,
              },
            ],
          },
        ]}
        data={data}
        editingInitiation
        onCancelEditInitiation={() => undefined}
        onCompleteStep={() => undefined}
        onEditInitiation={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        onUpdateInitiation={() => undefined}
        selectedStep={1}
      />,
    );

    expect(markup.match(/data-business-input=/g) ?? []).toHaveLength(3);
    expect(markup).toContain('aria-label="Khách hàng"');
    expect(markup).toContain('Lưu thay đổi');
    expect(markup).toContain('Hủy');
    expect(markup).not.toContain('KHỞI TẠO &amp; KÝ PHÊ DUYỆT DỰ ÁN');
  });

  it('hides the edit action when backend capabilities deny initiation editing', () => {
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={{
          ...data,
          capabilities: { ...data.capabilities, canManageFinance: false },
        }}
        onCompleteStep={() => undefined}
        onEditInitiation={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );

    expect(markup).not.toContain(
      'aria-label="Chỉnh sửa thông tin khởi tạo dự án"',
    );
  });

  it('omits financial initiation fields when backend capabilities deny finance read', () => {
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={{ ...actor, permissions: ['project.read'] }}
        customers={[]}
        data={{
          ...data,
          capabilities: {
            ...data.capabilities,
            canReadFinance: false,
            canManageFinance: false,
          },
        }}
        onCompleteStep={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );

    expect(markup).not.toContain('Giá trị dự kiến');
    expect(markup).not.toContain('35.000.000.000');
  });

  it('switches only to a persisted visible Project and drops the old Step context', () => {
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={data}
        onCompleteStep={() => undefined}
        onEditInitiation={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );
    expect(markup).toContain('PRJ-702 · Galaxy Annex');
    expect(markup).not.toContain('+ KHỞI TẠO DỰ ÁN MỚI');
  });

  it('hides Project access management when the backend capability is absent', () => {
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={{
          ...data,
          capabilities: {
            ...data.capabilities,
            canManageProjectAccess: false,
          },
        }}
        onCompleteStep={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );

    expect(markup).not.toContain('PHÂN QUYỀN DỰ ÁN');
  });

  it('places the exact five-row optional matrix immediately after initiation', () => {
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        constraints={constraints}
        customers={[]}
        data={data}
        onCompleteStep={() => undefined}
        onUpdateInitiation={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={1}
      />,
    );
    const information = markup.indexOf('THÔNG TIN KHỞI TẠO DỰ ÁN');
    const matrix = markup.indexOf('HỒ SƠ CHỦ CHỐT CỦA DỰ ÁN');
    const steps = markup.indexOf('QUY TRÌNH 5 BƯỚC');
    expect(information).toBeLessThan(matrix);
    expect(matrix).toBeLessThan(steps);
    expect(markup).toContain('Danh mục hồ sơ cần lưu theo dự án.');
    expect(markup.match(/HỒ SƠ CHỦ CHỐT CỦA DỰ ÁN/g) ?? []).toHaveLength(1);
    expect(markup).toContain('>TÊN HỒ SƠ</th>');
    expect(markup).not.toContain('>TÊN LOẠI HỒ SƠ</th>');
    expect(markup).toContain('QUẢN LÝ LOẠI HỒ SƠ');
    let previousRow = matrix;
    for (const name of [
      'Văn bản chủ trương / Quyết định giao nhiệm vụ',
      'Báo cáo khảo sát &amp; Phương án nhân sự',
      'Hồ sơ Báo cáo Kinh tế - Kỹ thuật',
      'Văn bản xác nhận / Cân đối nguồn vốn',
      'Quyết định phê duyệt Báo cáo Kinh tế - Kỹ thuật',
    ]) {
      const row = markup.indexOf(name, previousRow);
      expect(row).toBeGreaterThan(previousRow);
      previousRow = row;
    }
    for (const workflowStep of [
      'Bước 1 — Tiếp nhận &amp; Phân công',
      'Bước 2 — Khảo sát &amp; Thiết lập bộ máy',
      'Bước 3 — Lập &amp; Thẩm định hồ sơ đề xuất',
      'Bước 4 — Xác định nguồn vốn &amp; Kế hoạch',
      'Bước 5 — Phê duyệt dự án',
    ])
      expect(markup).not.toContain(workflowStep);
    expect(markup).toContain('Không phân loại');
    expect(markup.match(/data-optional-document-row=/g) ?? []).toHaveLength(5);
    expect(markup).not.toContain('data-optional-document-card=');
    const matrixMarkup = markup.slice(matrix, steps);
    expect(matrixMarkup.match(/<th(?:\s|>)/g) ?? []).toHaveLength(5);
    expect(matrixMarkup).toMatch(
      /<th[^>]*>TÊN HỒ SƠ<\/th><th[^>]*>BƯỚC THAM CHIẾU<\/th><th[^>]*>TRẠNG THÁI<\/th><th[^>]*>TỆP ĐÍNH KÈM<\/th><th[^>]*>THAO TÁC<\/th>/,
    );
    expect(markup).toContain('Chưa có tệp');
    expect(markup).toContain('-- Chưa có --');
    expect(markup.match(/data-row-upload-action=/g) ?? []).toHaveLength(5);
    expect(markup.match(/>TẢI LÊN<\/button>/g) ?? []).toHaveLength(4);
    expect(markup.match(/>THÊM TỆP<\/button>/g) ?? []).toHaveLength(1);
    expect(markup).not.toContain('⋯');
    expect(markup).not.toContain('Thao tác khác');
    expect(markup).not.toMatch(/\d+\/5 hồ sơ/);
    expect(markup).not.toContain('CHƯA THỂ HOÀN TẤT');
  });

  it('shows Matrix filenames and filters an injected Workflow-context file', () => {
    const extraFiles = [
      {
        ...data.documents[0],
        id: 'document-4',
        currentFileAssetId: 'file-4',
        displayName: 'Phụ lục 1',
        currentFileAsset: {
          ...data.documents[0].currentFileAsset,
          id: 'file-4',
          originalFilename: 'phu-luc-1.pdf',
        },
      },
      {
        ...data.documents[0],
        id: 'document-5',
        currentFileAssetId: 'file-5',
        displayName: 'Phụ lục 2',
        currentFileAsset: {
          ...data.documents[0].currentFileAsset,
          id: 'file-5',
          originalFilename: 'phu-luc-2.pdf',
        },
      },
    ];
    const definitions = data.documentDefinitions.map((definition, index) => ({
      ...definition,
      files:
        index === 0
          ? [data.documents[0]]
          : index === 1
            ? [data.documents[1], data.documents[2], ...extraFiles]
            : [],
    }));
    const markup = renderToStaticMarkup(
      <OptionalDocumentMatrix
        actor={actor}
        capabilities={data.capabilities}
        constraints={constraints}
        definitions={definitions}
        onChanged={() => undefined}
        onDelete={() => undefined}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        officerOptions={data.options.members}
        projectId="project-701"
        queueByWorkstream={{}}
      />,
    );

    expect(markup).toContain('Chưa có tệp');
    expect(markup).toContain('Đã lưu');
    expect(markup).not.toContain('Đã tải lên');
    expect(markup).not.toContain('Đã tải 3 tệp');
    expect(markup).toContain('chu-truong.pdf');
    expect(markup).not.toContain('survey.pdf');
    expect(markup).toContain('chu-truong-bo-sung.pdf');
    expect(markup.match(/data-attachment-chip=/g) ?? []).toHaveLength(3);
    expect(markup).toContain('data-attachment-overflow="1"');
    expect(markup).toContain('+ 1 tệp');
    expect(markup.match(/data-attachment-overflow-file=/g) ?? []).toHaveLength(
      1,
    );
    expect(markup).toContain('/api/v1/files/file-1/preview');
    expect(markup).toContain('/api/v1/files/file-1/download');
    expect(markup).toContain('>Xóa</button>');
    expect(markup).not.toContain('Thông tin &amp; lịch sử');
    expect(markup.match(/>THÊM TỆP<\/button>/g) ?? []).toHaveLength(2);
    expect(markup.match(/>TẢI LÊN<\/button>/g) ?? []).toHaveLength(3);
    expect(markup).not.toContain('>Upload<');
    expect(markup).toContain('>Xem<');
    expect(markup).not.toContain('Tải thêm file');
    expect(markup).not.toContain('Sửa loại hồ sơ');
    expect(markup).not.toContain('Đổi bước thực hiện');
    expect(markup).not.toContain('Ẩn loại hồ sơ');
  });

  it('opens one native matrix management dialog for active and hidden definitions', () => {
    const archived = {
      ...data.documentDefinitions[0],
      id: 'definition-archived',
      name: 'Hồ sơ đã ẩn',
      active: false,
      files: [data.documents[0]],
    };
    const outsideInitialMatrix = {
      ...data.documentDefinitions[1],
      id: 'definition-outside-matrix',
      name: 'Hồ sơ ngoài danh mục ban đầu',
      initialMatrix: false,
    };
    const markup = renderToStaticMarkup(
      <OptionalDocumentMatrix
        actor={actor}
        capabilities={data.capabilities}
        constraints={constraints}
        definitions={[
          ...data.documentDefinitions,
          archived,
          outsideInitialMatrix,
        ]}
        onChanged={() => undefined}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        officerOptions={data.options.members}
        projectId="project-701"
        queueByWorkstream={{}}
      />,
    );

    expect(markup.match(/QUẢN LÝ LOẠI HỒ SƠ/g) ?? []).toHaveLength(1);
    expect(markup.match(/<dialog(?:\s|>)/g) ?? []).toHaveLength(1);
    expect(markup).toContain('data-definition-management-dialog="true"');
    expect(
      markup.match(/data-definition-management-item=/g) ?? [],
    ).toHaveLength(6);
    expect(markup).toContain('Tên loại hồ sơ');
    expect(markup).toContain('Bước tham chiếu');
    expect(markup).not.toContain('Bước thực hiện');
    expect(markup).toContain('Mô tả');
    expect(markup).not.toContain('+ THÊM LOẠI HỒ SƠ');
    expect(markup).not.toContain('Sửa loại hồ sơ');
    expect(markup).not.toContain('Đổi bước thực hiện');
    expect(markup).toContain('Thứ tự hiển thị');
    expect(markup).toContain('Đang sử dụng');
    expect(markup).not.toContain('Ẩn loại hồ sơ');
    expect(markup).toContain('Khôi phục');
    expect(markup).toContain('Hồ sơ đã ẩn');
    expect(markup).not.toContain('Hồ sơ ngoài danh mục ban đầu');
  });

  it('hides Matrix management for an ordinary actor', () => {
    const markup = renderToStaticMarkup(
      <OptionalDocumentMatrix
        actor={{ ...actor, permissions: ['file.upload'] }}
        capabilities={{
          ...data.capabilities,
          canManageKeyDossier: false,
        }}
        constraints={constraints}
        definitions={data.documentDefinitions}
        onChanged={() => undefined}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        officerOptions={data.options.members}
        projectId="project-701"
        queueByWorkstream={{}}
      />,
    );

    expect(markup).not.toContain('QUẢN LÝ LOẠI HỒ SƠ');
    expect(markup).not.toContain('data-definition-management-dialog');
  });

  it('posts definition create/edit/reorder commands and explains duplicate rejection', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'definition-new' });
    await saveOptionalDocumentDefinition(
      'project-701',
      undefined,
      {
        name: 'Hồ sơ mới',
        referenceMilestoneId: 'milestone-survey',
        description: 'Mô tả',
        position: 5,
        initialMatrix: true,
        active: true,
      },
      request,
    );
    await saveOptionalDocumentDefinition(
      'project-701',
      'definition-1',
      {
        name: 'Tên mới',
        referenceMilestoneId: 'milestone-assignment',
        position: 0,
        initialMatrix: true,
        active: false,
      },
      request,
    );
    expect(request.mock.calls[0]?.[0]).toBe(
      '/projects/project-701/stage-1/key-dossier/items',
    );
    expect(request.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect(request.mock.calls[1]?.[0]).toBe(
      '/projects/project-701/stage-1/key-dossier/items/definition-1',
    );
    expect(request.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toMatchObject({
      referenceMilestoneId: 'milestone-assignment',
      position: 0,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      optionalDocumentDuplicateMessage(
        new ApiError('duplicate definition', 409),
      ),
    ).toBe('Tên mục Hồ sơ chủ chốt đã tồn tại. Hãy đổi tên trước khi lưu.');
    expect(
      optionalDocumentDuplicateMessage(
        new ApiError(
          'Document definition Step cannot change after files or history exist',
          409,
        ),
      ),
    ).toBe('Không thể đổi mốc sau khi loại hồ sơ đã có tệp hoặc lịch sử.');
  });

  it('maps active deactivation and hidden restoration from native form values', () => {
    const values = new FormData();
    values.set('name', 'Tên mới');
    values.set('referenceMilestoneId', 'milestone-proposal');
    values.set('description', 'Mô tả mới');
    values.set('position', '4');

    expect(
      definitionInputFromForm(values, data.documentDefinitions[0]),
    ).toMatchObject({
      name: 'Tên mới',
      referenceMilestoneId: 'milestone-proposal',
      description: 'Mô tả mới',
      position: 4,
      active: false,
    });
    expect(
      definitionInputFromForm(values, {
        ...data.documentDefinitions[0],
        active: false,
      }),
    ).toMatchObject({ position: 4, active: true });
  });

  it('bridges a legacy Required Document anchor to the uploaded logical row', () => {
    expect(stageOne.documentIdFromHash('#document-legacy%20requirement')).toBe(
      'legacy requirement',
    );
    expect(stageOne.documentIdFromHash('#document-bad%')).toBe('');
    expect(stageOne.documentIdFromHash('#step-documents')).toBe('');
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        constraints={constraints}
        customers={[]}
        data={data}
        highlightedDocumentId="definition-1"
        onCompleteStep={() => undefined}
        onUpdateInitiation={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={1}
      />,
    );

    expect(markup.match(/id="document-definition-1"/g) ?? []).toHaveLength(1);
    expect(markup.match(/data-highlighted="true"/g) ?? []).toHaveLength(1);
    expect(markup).toContain('id="document-document-1"');
  });

  it('derives selection, detail and completion action from the same URL step', () => {
    if (!stageOne.SimpleStageOneView || !stageOne.stepFromSearchParam) return;
    expect(stageOne.stepFromSearchParam('5')).toBe(5);
    expect(stageOne.stepFromSearchParam('0')).toBe(1);
    expect(stageOne.stepFromSearchParam('x')).toBe(1);
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        constraints={constraints}
        customers={[]}
        data={data}
        onCompleteStep={() => undefined}
        onUpdateInitiation={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={5}
      />,
    );
    expect(markup).toContain('CHI TIẾT BƯỚC 5');
    expect(markup).toContain('HOÀN TẤT QUY TRÌNH');
    expect(markup).toContain('+ THÊM HỒ SƠ');
    expect(markup).not.toContain('data-upload-scope=');
    expect(markup).toContain('data-document-list="KICKOFF_APPROVAL"');
    expect(markup).toContain('aria-current="step"');
    expect(stageOne.stageOneStepUrl?.('project-701', 3)).toBe(
      '/projects/project-701/stage-1?step=3',
    );
  });

  it.each(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED'])(
    'keeps the selected-Step add action and submitted list visible while %s',
    (status) => {
      const markup = renderToStaticMarkup(
        <stageOne.SimpleStageOneView
          actor={actor}
          constraints={constraints}
          customers={[]}
          data={{
            ...data,
            steps: data.steps.map((item) =>
              item.number === 2 ? { ...item, status } : item,
            ),
          }}
          onCompleteStep={() => undefined}
          onNavigate={() => undefined}
          onQueueChange={() => undefined}
          selectedStep={2}
        />,
      );

      expect(markup).toContain('+ THÊM HỒ SƠ');
      expect(markup).not.toContain('data-upload-scope=');
      expect(markup).toContain('data-document-list="SURVEY"');
      expect(markup).toContain('survey.pdf');
    },
  );

  it('retains queues only for the exact Project, stage, workstream and definition row', () => {
    const queues = {
      'project-701:STAGE_1:ASSIGNMENT:definition-1:STAGE_MATRIX_DOCUMENT:STAGE_DOCUMENT':
        [{ idempotencyKey: 'right' }],
      'project-701:STAGE_1:ASSIGNMENT:definition-2:STAGE_MATRIX_DOCUMENT:STAGE_DOCUMENT':
        [{ idempotencyKey: 'other-row' }],
    } as unknown as Record<string, stageOne.StageOneUploadQueueItem[]>;
    expect(
      stageOne.stageOneQueueMap(queues, 'project-701', [
        {
          definitionId: 'definition-1',
          workstreamKey: 'ASSIGNMENT',
          contextType: 'STAGE_MATRIX_DOCUMENT',
          targetType: 'STAGE_DOCUMENT',
        },
      ]),
    ).toEqual({
      'ASSIGNMENT:definition-1': [{ idempotencyKey: 'right' }],
    });
  });

  it('removes only the exact stale Matrix or Workflow queue', () => {
    const matrixKey =
      'project-701:STAGE_1:ASSIGNMENT:definition-1:STAGE_MATRIX_DOCUMENT:STAGE_DOCUMENT';
    const workflowKey =
      'project-701:STAGE_1:ASSIGNMENT:definition-1:STAGE_WORKFLOW_STEP_DOCUMENT:STAGE_DOCUMENT';
    const queues = {
      [matrixKey]: [{ idempotencyKey: 'matrix' }],
      [workflowKey]: [{ idempotencyKey: 'workflow' }],
    } as unknown as Record<string, stageOne.StageOneUploadQueueItem[]>;

    expect(
      stageOne.removeStageOneTargetQueue(queues, 'project-701', {
        definitionId: 'definition-1',
        workstreamKey: 'ASSIGNMENT',
        contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
        targetType: 'STAGE_DOCUMENT',
      }),
    ).toEqual({ [matrixKey]: queues[matrixKey] });
  });

  it('does not offer on-behalf officer options without manage-members permission', () => {
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={{
          ...actor,
          permissions: ['file.upload', 'project.document.manage'],
        }}
        constraints={constraints}
        customers={[]}
        data={data}
        onCompleteStep={() => undefined}
        onUpdateInitiation={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );
    expect(markup).not.toContain('>Hà Linh</option>');
  });

  it('hides upload actions when the server capability is absent despite client permissions', () => {
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        constraints={constraints}
        customers={[]}
        data={{
          ...data,
          capabilities: {
            ...data.capabilities,
            canUploadDocuments: false,
            canUploadWorkflowDocuments: false,
            canUploadKeyDossierAttachments: false,
            canCompleteStep: false,
          },
        }}
        onCompleteStep={() => undefined}
        onUpdateInitiation={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );
    expect(markup).not.toContain('Bấm để chọn tệp');
    expect(markup).not.toContain('HOÀN TẤT &amp; CHUYỂN SANG BƯỚC 2');
    expect(markup).not.toContain('aria-label="Tải lên Hồ sơ Báo cáo');
    expect(markup).toContain('Bạn không có quyền tải hồ sơ cho dự án này.');
  });

  it('never exposes missing-file completion warning copy', () => {
    if (!stageOne.SimpleStageOneView) return;
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={data}
        onCompleteStep={() => undefined}
        onUpdateInitiation={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={1}
      />,
    );
    expect(markup).not.toContain('CHƯA THỂ HOÀN TẤT BƯỚC');
    expect(markup).not.toContain('Cần bổ sung:');
  });

  it('presents failures as alerts rather than green success copy', () => {
    if (!stageOne.SimpleStageOneView) return;
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={data}
        message="Không thể tải hồ sơ."
        onCompleteStep={() => undefined}
        onUpdateInitiation={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={1}
      />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('text-red-700');
  });

  it('replaces a searched customer option with its representative details', () => {
    expect(stageOne.replaceStageOneCustomer).toBeTypeOf('function');
    expect(
      stageOne.replaceStageOneCustomer?.(
        [
          { id: 'customer-1', displayName: 'Galaxy Centre' },
          { id: 'customer-2', displayName: 'Galaxy South' },
        ],
        {
          id: 'customer-2',
          displayName: 'Galaxy South',
          contacts: [{ id: 'contact-2', displayName: 'Lê Đại Diện' }],
        },
      ),
    ).toEqual([
      { id: 'customer-1', displayName: 'Galaxy Centre' },
      {
        id: 'customer-2',
        displayName: 'Galaxy South',
        contacts: [{ id: 'contact-2', displayName: 'Lê Đại Diện' }],
      },
    ]);
  });

  it('loads representative details for a newly selected customer', async () => {
    const request = vi.fn().mockResolvedValue({
      id: 'customer-2',
      displayName: 'Galaxy South',
      contacts: [{ id: 'contact-2', displayName: 'Lê Đại Diện' }],
    });
    await expect(
      stageOne.loadStageOneCustomer?.('customer-2', request),
    ).resolves.toMatchObject({ contacts: [{ id: 'contact-2' }] });
    expect(request).toHaveBeenCalledWith('/customers/customer-2');
  });

  it('searches the Customer endpoint instead of only filtering the first page', async () => {
    const request = vi.fn().mockResolvedValue({
      items: [{ id: 'customer-101', displayName: 'Nhà đầu tư số 101' }],
    });
    await expect(
      stageOne.searchStageOneCustomers?.('nhà đầu tư 101', request),
    ).resolves.toEqual([
      { id: 'customer-101', displayName: 'Nhà đầu tư số 101' },
    ]);
    expect(request).toHaveBeenCalledWith(
      '/customers?pageSize=20&status=ACTIVE&sort=displayName&direction=asc&search=nh%C3%A0+%C4%91%E1%BA%A7u+t%C6%B0+101',
    );
  });

  it('ignores an older Customer search response that resolves last', async () => {
    let resolveOlder!: (value: { items: stageOne.CustomerOption[] }) => void;
    const older = new Promise<{ items: stageOne.CustomerOption[] }>(
      (resolve) => {
        resolveOlder = resolve;
      },
    );
    const request = vi
      .fn()
      .mockReturnValueOnce(older)
      .mockResolvedValueOnce({
        items: [{ id: 'new', displayName: 'Kết quả mới' }],
      });
    let generation = 1;
    const first = stageOne.latestStageOneCustomerSearch?.(
      'a',
      1,
      () => generation,
      request,
    );
    generation = 2;
    await expect(
      stageOne.latestStageOneCustomerSearch?.(
        'abc',
        2,
        () => generation,
        request,
      ),
    ).resolves.toEqual([{ id: 'new', displayName: 'Kết quả mới' }]);
    resolveOlder({ items: [{ id: 'old', displayName: 'Kết quả cũ' }] });
    await expect(first).resolves.toBeUndefined();
  });

  it('keeps the Matrix separate and initially closes the selected-Step upload panel', () => {
    if (!stageOne.SimpleStageOneView) return;
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        constraints={constraints}
        customers={[]}
        data={data}
        onCompleteStep={() => undefined}
        onUpdateInitiation={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={1}
      />,
    );
    expect(markup.match(/data-optional-document-matrix=/g) ?? []).toHaveLength(
      1,
    );
    expect(markup.match(/data-upload-scope=/g) ?? []).toHaveLength(0);
    expect(markup.match(/data-document-list=/g) ?? []).toHaveLength(1);
    expect(markup).toContain('+ THÊM HỒ SƠ');
    expect(markup).toContain('data-document-list="ASSIGNMENT"');
    expect(markup).toContain('QUY TRÌNH 5 BƯỚC HỒ SƠ DỰ ÁN');
    expect(markup).toContain('HOÀN TẤT &amp; CHUYỂN SANG BƯỚC 2');
    expect(markup).not.toMatch(/<input[^>]+multiple=""[^>]+type="file"/);
    expect(markup).toContain('workflow.pdf');
    for (const heading of [
      'TÊN HỒ SƠ',
      'TỆP',
      'NGƯỜI NỘP',
      'NGÀY NỘP',
      'TRẠNG THÁI',
      'THAO TÁC',
    ])
      expect(markup).toContain(`>${heading}</th>`);
    expect(markup).toContain('Nguyễn Minh');
    expect(markup).toContain('Đã tải tệp');
    expect(markup).not.toContain('survey.pdf');
    expect(markup).not.toContain('UPLOADED');
    expect(markup).toContain('DANH SÁCH HỒ SƠ ĐÃ NỘP — BƯỚC 1');
    expect(markup).not.toContain('HỒ SƠ HỖ TRỢ TÙY CHỌN');
    expect(markup).not.toContain('NỘP HỒ SƠ');
    expect(markup).not.toContain('/documents/document-1/history');
  });

  it('names the empty submitted list for the selected Step', () => {
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={{
          ...data,
          workflow: { ...data.workflow, documents: [] },
        }}
        onCompleteStep={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );

    expect(markup).toContain('Chưa có hồ sơ nào được nộp cho Bước 1.');
  });

  it('gates Workflow preview and download independently by backend capability', () => {
    const previewOnly = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={{
          ...data,
          capabilities: { ...data.capabilities, canDownloadFiles: false },
        }}
        onCompleteStep={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );
    const downloadOnly = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={{
          ...data,
          capabilities: { ...data.capabilities, canPreviewFiles: false },
        }}
        onCompleteStep={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );

    expect(previewOnly).toContain('/api/v1/files/workflow-file-1/preview');
    expect(previewOnly).not.toContain('/api/v1/files/workflow-file-1/download');
    expect(downloadOnly).not.toContain('/api/v1/files/workflow-file-1/preview');
    expect(downloadOnly).toContain('/api/v1/files/workflow-file-1/download');
  });

  it('keeps unsupported Workflow and Matrix files download-only', () => {
    const unsupported = {
      ...data.documents[3],
      id: 'workflow-document-docx',
      currentFileAssetId: 'workflow-file-docx',
      currentFileAsset: {
        ...data.documents[3].currentFileAsset,
        id: 'workflow-file-docx',
        originalFilename: 'workflow.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    };
    const workflow = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={{
          ...data,
          workflow: { ...data.workflow, documents: [unsupported] },
        }}
        onCompleteStep={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );
    const matrix = renderToStaticMarkup(
      <OptionalDocumentMatrix
        actor={actor}
        capabilities={data.capabilities}
        definitions={[
          {
            ...data.documentDefinitions[0],
            files: [
              {
                ...unsupported,
                contextType: 'STAGE_MATRIX_DOCUMENT',
              },
            ],
          },
        ]}
        onChanged={() => undefined}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        officerOptions={data.options.members}
        projectId="project-701"
        queueByWorkstream={{}}
      />,
    );

    for (const markup of [workflow, matrix]) {
      expect(markup).not.toContain('/files/workflow-file-docx/preview');
      expect(markup).toContain('/files/workflow-file-docx/download');
    }
  });

  it('renders Matrix and Workflow definitions and files as disjoint persisted contexts', () => {
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        constraints={constraints}
        customers={[]}
        data={data}
        onCompleteStep={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={1}
      />,
    );
    const matrixStart = markup.indexOf('data-optional-document-matrix');
    const workflowStart = markup.indexOf('QUY TRÌNH 5 BƯỚC');
    const matrix = markup.slice(matrixStart, workflowStart);
    const workflow = markup.slice(workflowStart);

    expect(matrix).toContain('chu-truong.pdf');
    expect(matrix).not.toContain('workflow.pdf');
    expect(matrix).not.toContain('workflow-definition-1');
    expect(workflow).toContain('workflow.pdf');
    expect(workflow).not.toContain('chu-truong.pdf');
  });

  it('does not expose version or details actions in the Workflow file list', () => {
    const allowed = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={data}
        onCompleteStep={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );
    const forbidden = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={{
          ...data,
          capabilities: { ...data.capabilities, canUploadDocuments: false },
        }}
        onCompleteStep={() => undefined}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );

    expect(allowed).not.toContain('Tải version mới');
    expect(forbidden).not.toContain('Tải version mới');
    expect(allowed).not.toContain('Xem lịch sử');
  });

  it('opens delete confirmation and Project permissions as native modal dialogs', () => {
    const source = readFileSync(
      new URL('./project-stage-one.tsx', import.meta.url),
      'utf8',
    );
    expect(source.match(/\.showModal\(\)/g)).toHaveLength(2);
    expect(source).not.toMatch(/<dialog[^>]*\sopen(?:\s|>)/);
  });

  it('opens filename chips directly and keeps row actions upload-only', () => {
    if (!stageOne.SimpleStageOneView) return;
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={data}
        onCompleteStep={() => undefined}
        onUpdateInitiation={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={1}
      />,
    );
    expect(markup).toContain('/api/v1/files/file-1/download');
    expect(markup).not.toContain('Xem lịch sử');
    expect(markup).not.toContain('Tải phiên bản mới');
    expect(markup).not.toContain('Đang tải phiên bản mới cho:');
    expect(markup).not.toContain('>Hà Linh</option>');
    expect(markup).toContain('+ THÊM HỒ SƠ');
    expect(markup.match(/data-upload-scope=/g) ?? []).toHaveLength(0);
    expect(markup.match(/data-document-list=/g) ?? []).toHaveLength(1);
  });

  it('shows only View, Download and authorized Delete for Matrix and Workflow files', () => {
    if (!stageOne.SimpleStageOneView) return;
    const allowed = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={data}
        onCompleteStep={() => undefined}
        onDeleteDocument={() => Promise.resolve()}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );
    const denied = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={{
          ...actor,
          permissions: actor.permissions.filter(
            (permission) => permission !== 'file.delete',
          ),
        }}
        customers={[]}
        data={{
          ...data,
          capabilities: {
            ...data.capabilities,
            canDeleteProjectDocuments: false,
            canDeleteAttachment: false,
          },
        }}
        onCompleteStep={() => undefined}
        onDeleteDocument={() => Promise.resolve()}
        onNavigate={() => undefined}
        selectedStep={1}
      />,
    );

    expect(allowed).toContain('>Xem</a>');
    expect(allowed).toContain('>Tải xuống</a>');
    expect(allowed).toContain('>Xóa</button>');
    expect(allowed).not.toContain('Thông tin &amp; lịch sử');
    expect(allowed).not.toContain('Xem lịch sử');
    expect(allowed).not.toContain('Tải version mới');
    expect(denied).not.toContain('>Xóa</button>');
  });

  it('keeps Matrix row actions enabled while a Workflow queue is pending', () => {
    const markup = renderToStaticMarkup(
      <OptionalDocumentMatrix
        actor={actor}
        capabilities={data.capabilities}
        constraints={constraints}
        definitions={data.documentDefinitions}
        onChanged={() => undefined}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        officerOptions={data.options.members}
        projectId="project-701"
        queueByWorkstream={{
          'ASSIGNMENT:workflow-definition-1': [queuedDocument],
        }}
      />,
    );
    const actions = markup.match(
      /<button[^>]*data-row-upload-action="true"[^>]*>/g,
    );

    expect(actions).toHaveLength(5);
    expect(actions?.some((action) => action.includes('disabled=""'))).toBe(
      false,
    );
  });

  it('offers Workflow add-file when the Matrix has no definitions', () => {
    if (!stageOne.SimpleStageOneView) return;
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={{
          ...data,
          keyDossier: { ...data.keyDossier, items: [], attachments: [] },
        }}
        onCompleteStep={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={1}
      />,
    );

    expect(markup).not.toContain('data-optional-document-row="true"');
    expect(markup).toContain('data-document-list="ASSIGNMENT"');
    expect(markup).toContain('THÊM HỒ SƠ');
  });

  it('disables other Matrix rows while the open Matrix queue is active', () => {
    const markup = renderToStaticMarkup(
      <OptionalDocumentMatrix
        actor={actor}
        capabilities={data.capabilities}
        constraints={constraints}
        definitions={data.documentDefinitions}
        onChanged={() => undefined}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        officerOptions={data.options.members}
        projectId="project-701"
        queueByWorkstream={{
          'ASSIGNMENT:definition-1': [
            {
              ...queuedDocument,
              contextType: 'STAGE_MATRIX_DOCUMENT',
              definitionId: 'definition-1',
              status: 'READY_TO_SUBMIT',
            },
          ],
        }}
        uploadingId="definition-1"
      />,
    );
    const otherRow = markup.match(
      /<button[^>]*aria-label="Tải lên Báo cáo khảo sát &amp; Phương án nhân sự"[^>]*>/,
    )?.[0];
    const recoveredRow = markup.match(
      /<button[^>]*aria-label="Tải lên Văn bản chủ trương \/ Quyết định giao nhiệm vụ"[^>]*>/,
    )?.[0];

    expect(otherRow).toContain('disabled=""');
    expect(recoveredRow).not.toContain('disabled=""');
  });

  it('reports a Matrix submit retry as submitting instead of uploading', () => {
    const markup = renderToStaticMarkup(
      <OptionalDocumentMatrix
        actor={actor}
        capabilities={data.capabilities}
        constraints={constraints}
        definitions={data.documentDefinitions}
        onChanged={() => undefined}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        officerOptions={data.options.members}
        projectId="project-701"
        queueByWorkstream={{
          'ASSIGNMENT:definition-1': [
            {
              ...queuedDocument,
              contextType: 'STAGE_MATRIX_DOCUMENT',
              definitionId: 'definition-1',
              status: 'SUBMITTING',
            },
          ],
        }}
      />,
    );

    expect(markup).toContain('Đang nộp hồ sơ');
  });

  it('allows switching Matrix rows after every queue item is terminal', () => {
    const markup = renderToStaticMarkup(
      <OptionalDocumentMatrix
        actor={actor}
        capabilities={data.capabilities}
        constraints={constraints}
        definitions={data.documentDefinitions}
        onChanged={() => undefined}
        onQueueChange={() => undefined}
        onUploaded={() => undefined}
        officerOptions={data.options.members}
        projectId="project-701"
        queueByWorkstream={{
          'ASSIGNMENT:definition-1': [
            {
              ...queuedDocument,
              contextType: 'STAGE_MATRIX_DOCUMENT',
              definitionId: 'definition-1',
              status: 'SUBMITTED',
            },
          ],
        }}
        uploadingId="definition-1"
      />,
    );
    const otherRow = markup.match(
      /<button[^>]*aria-label="Tải lên Báo cáo khảo sát &amp; Phương án nhân sự"[^>]*>/,
    )?.[0];

    expect(otherRow).not.toContain('disabled=""');
  });

  it('mounts only the Matrix queue worker while its live upload surface is open', () => {
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={data}
        matrixUploadingDefinitionId="definition-1"
        onCompleteStep={() => undefined}
        onMatrixUploadingDefinitionIdChange={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={1}
      />,
    );

    expect(markup).toContain(
      'aria-label="Tải lên Văn bản chủ trương / Quyết định giao nhiệm vụ"',
    );
    expect(markup.match(/data-upload-scope=/g) ?? []).toHaveLength(1);
    expect(markup).toContain(
      'data-upload-scope="project-701:STAGE_1:ASSIGNMENT:definition-1:STAGE_MATRIX_DOCUMENT:STAGE_DOCUMENT"',
    );
  });

  it('keeps legacy Matrix files out of the selected-Step submitted records', async () => {
    if (!stageOne.SimpleStageOneView) return;
    const legacy = {
      ...data,
      keyDossier: {
        ...data.keyDossier,
        attachments: [
          {
            ...data.documents[0],
            id: 'legacy-1',
            source: 'LEGACY_REQUIRED_DOCUMENT' as const,
          },
        ],
      },
    };
    const markup = renderToStaticMarkup(
      <stageOne.SimpleStageOneView
        actor={actor}
        customers={[]}
        data={legacy}
        onCompleteStep={() => undefined}
        onUpdateInitiation={() => undefined}
        onNavigate={() => undefined}
        onQueueChange={() => undefined}
        selectedStep={1}
      />,
    );
    expect(markup).not.toContain('Xem lịch sử');
    expect(markup).not.toContain('Tải phiên bản mới');

    const request = vi.fn().mockResolvedValue({
      current: {
        downloadId: 'legacy-current',
        filename: 'legacy-v2.pdf',
        version: 2,
        status: 'UPLOADED',
        uploader: { displayName: 'Nguyễn Minh' },
        timestamp: '2026-08-12T03:04:05.000Z',
      },
      versions: [
        {
          downloadId: 'legacy-v1',
          filename: 'legacy-v1.pdf',
          version: 1,
          status: 'UPLOADED',
          actor: { displayName: 'Hà Linh' },
          timestamp: '2026-08-11T03:04:05.000Z',
        },
      ],
    });
    await expect(
      stageOne.loadStageOneDocumentHistory?.(
        'project-701',
        legacy.keyDossier.attachments[0]!,
        request,
      ),
    ).resolves.toMatchObject({
      currentVersion: 2,
      versions: [
        { version: 2, downloadId: 'legacy-current' },
        { version: 1, downloadId: 'legacy-v1' },
      ],
    });
    expect(request).toHaveBeenCalledWith(
      '/projects/project-701/required-documents/legacy-1/history',
    );
  });

  it('patches existing initiation and never calls the create endpoint', async () => {
    expect(stageOne.updateSimpleStageOne).toBeTypeOf('function');
    expect(stageOne.completeSimpleStageOneStep).toBeTypeOf('function');
    if (!stageOne.updateSimpleStageOne || !stageOne.completeSimpleStageOneStep)
      return;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(data))
      .mockResolvedValueOnce(Response.json(data))
      .mockResolvedValueOnce(
        Response.json({
          completed: true,
          nextStep: 5,
          stageCompleted: false,
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const values = {
      name: 'Galaxy Tower',
      estimatedInvestmentAmount: '35.000.000.000 ₫',
      customerId: 'customer-1',
      primaryContactId: 'contact-1',
    };
    await stageOne.updateSimpleStageOne(
      'project-701',
      values,
      'stage-one-update-1',
    );
    await stageOne.updateSimpleStageOne(
      'project-701',
      values,
      'stage-one-update-1',
    );
    await expect(
      stageOne.completeSimpleStageOneStep('project-701', 'FINANCIAL_PLANNING'),
    ).resolves.toEqual({
      completed: true,
      nextStep: 5,
      stageCompleted: false,
    });
    for (const call of fetch.mock.calls.slice(0, 2)) {
      expect(JSON.parse(String(call[1]?.body))).toMatchObject({
        estimatedInvestmentAmount: '35000000000',
        idempotencyKey: 'stage-one-update-1',
      });
      expect(JSON.parse(String(call[1]?.body))).not.toHaveProperty(
        'fundingSource',
      );
    }
    expect(fetch.mock.calls[0]?.[0]).toBe(
      '/api/v1/projects/project-701/stage-1/initiate-simple',
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' });
    expect(fetch.mock.calls[0]?.[0]).not.toBe('/api/v1/projects');
    expect(fetch.mock.calls[2]?.[0]).toBe(
      '/api/v1/projects/project-701/stage-1/steps/FINANCIAL_PLANNING/complete',
    );
  });

  it.each([
    ['reader', ['project.read']],
    ['editor', ['project.read', 'project.update']],
  ])(
    'loads the selected investor for a %s without requesting upload constraints',
    async () => {
      const customers = [
        { id: 'customer-1', displayName: 'Galaxy Centre', contacts: [] },
      ];
      const loadCustomers = vi.fn().mockResolvedValue(customers);
      const request = vi.fn().mockRejectedValue(new ApiError('Forbidden', 403));
      const onCustomers = vi.fn();
      const onConstraints = vi.fn();
      const onError = vi.fn();

      await stageOne.loadStageOneSupportingData(
        'customer-1',
        { canUploadDocuments: false },
        { onCustomers, onConstraints, onError },
        { loadCustomers, request },
      );

      expect(loadCustomers).toHaveBeenCalledWith('customer-1');
      expect(onCustomers).toHaveBeenCalledWith(customers);
      expect(request).not.toHaveBeenCalled();
      expect(onConstraints).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it('preserves the selected step after a successful existing-project save', () => {
    const replace = vi.fn();

    stageOne.replaceAfterInitiationUpdate('project-701', 4, replace);

    expect(replace).toHaveBeenCalledWith(
      '/projects/project-701/stage-1?step=4',
    );
  });

  it('navigates a successful completion even when the refresh fails', async () => {
    const navigate = vi.fn();
    const refreshError = new Error('refresh failed');

    await expect(
      stageOne.applySimpleStageOneCompletion(
        { completed: true, nextStep: 3, stageCompleted: false },
        'project-701',
        () => Promise.reject(refreshError),
        navigate,
      ),
    ).rejects.toBe(refreshError);
    expect(navigate).toHaveBeenCalledWith(
      '/projects/project-701/stage-1?step=3',
    );
  });

  it('uses real redirects for legacy Stage 1 routes', () => {
    const config = readFileSync(
      new URL('../../../next.config.ts', import.meta.url),
      'utf8',
    );
    for (const [route, step] of [
      ['initiation', 1],
      ['survey', 2],
      ['requirements', 3],
      ['approval', 5],
    ] as const) {
      expect(config).toContain(`stage-1/${route}`);
      expect(config).toContain(`stage-1?step=${step}`);
    }
    expect(
      readFileSync(
        new URL('./stage-1/documents/page.tsx', import.meta.url),
        'utf8',
      ),
    ).toContain('step-documents');
  });

  it('runs browser acceptance on isolated ports and stores evidence in the approved directory', () => {
    const playwrightConfig = readFileSync(
      new URL('../../../playwright.stage-one.config.ts', import.meta.url),
      'utf8',
    );
    const visualEvidence = readFileSync(
      new URL('../../../tests/browser/visual-evidence.ts', import.meta.url),
      'utf8',
    );
    const fixture = readFileSync(
      new URL(
        '../../../../api/scripts/stage-one-playwright-fixture.mjs',
        import.meta.url,
      ),
      'utf8',
    );

    expect(playwrightConfig).toContain(
      "process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100'",
    );
    expect(playwrightConfig).toContain('baseURL,');
    expect(playwrightConfig).toContain(
      "url: 'http://127.0.0.1:3101/api/v1/health'",
    );
    expect(playwrightConfig).toContain("url: 'http://127.0.0.1:3100'");
    expect(playwrightConfig).not.toContain('127.0.0.1:3000');
    expect(playwrightConfig).not.toContain('port: 3101');
    expect(playwrightConfig).not.toContain('port: 3001');
    expect(visualEvidence).toContain("'../../.artifacts/p0-final'");
    expect(visualEvidence).not.toContain('optional-documents-stage2');
    expect(fixture).toContain('p0-stage-one-create-browser');
    expect(fixture).toContain('cleanupCreatedProject');
    expect(fixture).toContain('creationIdempotencyKey');
  });
});

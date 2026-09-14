export type ProjectDomainLabelKind =
  | 'projectType'
  | 'workstream'
  | 'step'
  | 'document'
  | 'status'
  | 'risk'
  | 'role'
  | 'readiness'
  | 'stage'
  | 'boolean';

const labels: Partial<Record<ProjectDomainLabelKind, Record<string, string>>> =
  {
    projectType: {
      DESIGN_AND_BUILD: 'Thiết kế & thi công trọn gói',
      DESIGN_ONLY: 'Chỉ thiết kế',
      PRODUCT_SUPPLY: 'Chỉ cung cấp sản phẩm',
      PRODUCT_SUPPLY_AND_INSTALLATION: 'Cung cấp sản phẩm & lắp đặt',
      INSTALLATION_ONLY: 'Chỉ lắp đặt',
      INTERNAL: 'Dự án nội bộ',
      RENOVATION_WARRANTY: 'Cải tạo/Bảo hành',
      CUSTOM: 'Tùy chỉnh',
    },
    workstream: {
      PROJECT_MANAGEMENT: 'Quản lý dự án',
      DESIGN: 'Thiết kế',
      PRODUCT: 'Sản phẩm nội thất',
      COMMERCIAL: 'Thương mại',
      PROCUREMENT: 'Mua hàng',
      PRODUCTION: 'Sản xuất',
      LOGISTICS: 'Logistics & vận chuyển',
      WAREHOUSE: 'Kho',
      INSTALLATION: 'Lắp đặt',
      HANDOVER: 'Bàn giao',
      INTERNAL: 'Nội bộ',
      WARRANTY: 'Bảo hành',
      CUSTOM: 'Tùy chỉnh',
    },
    step: {
      ASSIGNMENT: 'Tiếp nhận & Phân công',
      SURVEY: 'Khảo sát & Thiết lập bộ máy',
      PROPOSAL: 'Lập & Thẩm định hồ sơ đề xuất',
      FINANCIAL_PLANNING: 'Xác định nguồn vốn & Kế hoạch',
      KICKOFF_APPROVAL: 'Phê duyệt dự án',
    },
    document: {
      PROJECT_DOSSIER: 'Hồ sơ khởi tạo dự án',
      RESPONSIBILITY_MATRIX: 'Ma trận trách nhiệm',
      SURVEY_REPORT: 'Báo cáo khảo sát',
      SITE_CONSTRAINTS: 'Điều kiện hiện trường',
      SCOPE_STATEMENT: 'Phạm vi công việc',
      PROPOSAL: 'Đề xuất dự án',
      PROPOSAL_MILESTONES: 'Các mốc chính của dự án',
      PROPOSAL_WBS: 'Cấu trúc công việc dự án',
      RISK_REGISTER: 'Danh mục rủi ro',
      RESOURCE_PLAN: 'Kế hoạch nguồn lực',
      PRELIMINARY_FINANCIAL_PLAN: 'Kế hoạch tài chính sơ bộ',
      KICKOFF_APPROVAL: 'Quyết định phê duyệt khởi động',
      TECHNICAL_DRAWING: 'Bản vẽ kỹ thuật',
    },
    status: {
      PLANNING: 'Đang lập kế hoạch',
      ACTIVE: 'Đang hoạt động',
      ON_HOLD: 'Tạm dừng',
      ON_TRACK: 'Đúng tiến độ',
      AT_RISK: 'Có rủi ro',
      OFF_TRACK: 'Chậm tiến độ',
      TODO: 'Chưa bắt đầu',
      NOT_STARTED: 'Chưa bắt đầu',
      NOT_INITIALIZED: 'Chưa khởi tạo',
      NOT_APPLICABLE: 'Không áp dụng',
      BYPASSED_WITH_APPROVAL: 'Bỏ qua có phê duyệt',
      IN_PROGRESS: 'Đang thực hiện',
      IN_REVIEW: 'Đang chờ phê duyệt',
      UNDER_REVIEW: 'Đang chờ phê duyệt',
      READY_FOR_REVIEW: 'Sẵn sàng trình duyệt',
      PENDING: 'Chờ duyệt',
      BLOCKED: 'Bị chặn',
      DONE: 'Hoàn thành',
      COMPLETED: 'Hoàn thành',
      CANCELLED: 'Đã hủy',
      WARNING: 'Cảnh báo',
      CRITICAL: 'Nghiêm trọng',
      DRAFT: 'Bản nháp',
      MISSING: 'Chưa có',
      UPLOADED: 'Đã tải tệp',
      PENDING_REVIEW: 'Đang chờ phê duyệt',
      APPROVED: 'Đã phê duyệt',
      APPROVED_WITH_COMMENTS: 'Phê duyệt kèm ý kiến',
      REVISION_REQUIRED: 'Yêu cầu chỉnh sửa',
      REJECTED: 'Bị từ chối',
      SUPERSEDED: 'Đã được thay thế',
    },
    risk: {
      LOW: 'Thấp',
      MEDIUM: 'Trung bình',
      NORMAL: 'Trung bình',
      HIGH: 'Cao',
      CRITICAL: 'Nghiêm trọng',
    },
    role: {
      PROJECT_OWNER: 'Chủ dự án',
      SALES_OWNER: 'Sales phụ trách',
      PROJECT_DIRECTOR: 'Giám đốc dự án',
      PROJECT_MANAGER: 'Quản lý dự án',
      DESIGNER: 'Thiết kế',
      DOCUMENT_OWNER: 'Phụ trách hồ sơ',
    },
    readiness: {
      PROJECT_DOSSIER: 'HỒ SƠ DỰ ÁN',
      PEOPLE: 'NHÂN SỰ & PHÂN CÔNG',
      SURVEY: 'KHẢO SÁT',
      PROPOSAL: 'ĐỀ XUẤT DỰ ÁN',
      FINANCE: 'NGÂN SÁCH SƠ BỘ',
      DOCUMENTS: 'HỒ SƠ CẦN HOÀN THÀNH',
      APPROVAL: 'PHÊ DUYỆT KHỞI ĐỘNG',
    },
    stage: {
      STAGE_1: 'Giai đoạn 1',
      STAGE_2: 'Giai đoạn 2',
      STAGE_3: 'Giai đoạn 3',
      STAGE_4: 'Giai đoạn 4',
      STAGE_5: 'Giai đoạn 5',
      STAGE_ONE: 'Giai đoạn 1',
      STAGE_TWO: 'Giai đoạn 2',
      STAGE_THREE: 'Giai đoạn 3',
      STAGE_FOUR: 'Giai đoạn 4',
      STAGE_FIVE: 'Giai đoạn 5',
    },
  };

const booleanLabels: Record<string, [string, string]> = {
  requiresSurvey: ['Bắt buộc', 'Không yêu cầu'],
  requiresPreliminaryFinance: ['Bắt buộc', 'Không yêu cầu'],
};
const requiredDocumentStatusLabels: Record<string, string> = {
  DRAFT: 'Đã tải lên',
};

function unknownLabel(value: string) {
  const humanized = value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .join(' ');
  return humanized
    ? `Không xác định: ${humanized[0]!.toUpperCase()}${humanized.slice(1)}`
    : 'Không xác định';
}

export function projectDomainLabel(
  kind: ProjectDomainLabelKind,
  value: string | boolean | null | undefined,
  context?: string,
) {
  if (kind === 'boolean' && typeof value === 'boolean') {
    const contextual = context && booleanLabels[context];
    return contextual ? contextual[value ? 0 : 1] : value ? 'Có' : 'Không';
  }
  const code = typeof value === 'string' ? value : '';
  if (kind === 'status' && context === 'requiredDocument')
    return (
      requiredDocumentStatusLabels[code] ??
      labels.status?.[code] ??
      unknownLabel(code)
    );
  const label = labels[kind]?.[code];
  if (label) return label;
  if (process.env.NODE_ENV === 'development')
    console.warn('Unknown Project domain label', { kind, value });
  return unknownLabel(code);
}

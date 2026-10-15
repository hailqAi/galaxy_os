import { describe, expect, it, vi } from 'vitest';
import { projectDomainLabel } from './project-domain-labels';

describe('projectDomainLabel', () => {
  it.each([
    ['projectType', 'DESIGN_AND_BUILD', 'Thiết kế & thi công trọn gói'],
    ['projectType', 'DESIGN_ONLY', 'Chỉ thiết kế'],
    ['projectType', 'PRODUCT_SUPPLY', 'Chỉ cung cấp sản phẩm'],
    [
      'projectType',
      'PRODUCT_SUPPLY_AND_INSTALLATION',
      'Cung cấp sản phẩm & lắp đặt',
    ],
    ['projectType', 'INSTALLATION_ONLY', 'Chỉ lắp đặt'],
    ['projectType', 'INTERNAL', 'Dự án nội bộ'],
    ['projectType', 'RENOVATION_WARRANTY', 'Cải tạo/Bảo hành'],
    ['projectType', 'CUSTOM', 'Tùy chỉnh'],
    ['workstream', 'PROJECT_MANAGEMENT', 'Quản lý dự án'],
    ['workstream', 'DESIGN', 'Thiết kế'],
    ['workstream', 'PRODUCT', 'Sản phẩm nội thất'],
    ['workstream', 'COMMERCIAL', 'Thương mại'],
    ['workstream', 'PROCUREMENT', 'Mua hàng'],
    ['workstream', 'PRODUCTION', 'Sản xuất'],
    ['workstream', 'LOGISTICS', 'Logistics & vận chuyển'],
    ['workstream', 'WAREHOUSE', 'Kho'],
    ['workstream', 'INSTALLATION', 'Lắp đặt'],
    ['workstream', 'HANDOVER', 'Bàn giao'],
    ['workstream', 'INTERNAL', 'Nội bộ'],
    ['workstream', 'WARRANTY', 'Bảo hành'],
    ['workstream', 'CUSTOM', 'Tùy chỉnh'],
    ['step', 'ASSIGNMENT', 'Tiếp nhận & Phân công'],
    ['step', 'SURVEY', 'Khảo sát & Thiết lập bộ máy'],
    ['step', 'PROPOSAL', 'Lập & Thẩm định hồ sơ đề xuất'],
    ['step', 'FINANCIAL_PLANNING', 'Xác định nguồn vốn & Kế hoạch'],
    ['step', 'KICKOFF_APPROVAL', 'Phê duyệt dự án'],
    ['document', 'PROJECT_DOSSIER', 'Hồ sơ khởi tạo dự án'],
    ['document', 'RESPONSIBILITY_MATRIX', 'Ma trận trách nhiệm'],
    ['document', 'SURVEY_REPORT', 'Báo cáo khảo sát'],
    ['document', 'SITE_CONSTRAINTS', 'Điều kiện hiện trường'],
    ['document', 'SCOPE_STATEMENT', 'Phạm vi công việc'],
    ['document', 'PROPOSAL', 'Đề xuất dự án'],
    ['document', 'PROPOSAL_MILESTONES', 'Các mốc chính của dự án'],
    ['document', 'PROPOSAL_WBS', 'Cấu trúc công việc dự án'],
    ['document', 'RISK_REGISTER', 'Danh mục rủi ro'],
    ['document', 'RESOURCE_PLAN', 'Kế hoạch nguồn lực'],
    ['document', 'PRELIMINARY_FINANCIAL_PLAN', 'Kế hoạch tài chính sơ bộ'],
    ['document', 'KICKOFF_APPROVAL', 'Quyết định phê duyệt khởi động'],
    ['document', 'TECHNICAL_DRAWING', 'Bản vẽ kỹ thuật'],
    ['status', 'ACTIVE', 'Đang hoạt động'],
    ['status', 'PLANNING', 'Đang lập kế hoạch'],
    ['status', 'ON_HOLD', 'Tạm dừng'],
    ['status', 'ON_TRACK', 'Đúng tiến độ'],
    ['status', 'AT_RISK', 'Có rủi ro'],
    ['status', 'OFF_TRACK', 'Chậm tiến độ'],
    ['status', 'TODO', 'Chưa bắt đầu'],
    ['status', 'NOT_STARTED', 'Chưa bắt đầu'],
    ['status', 'NOT_INITIALIZED', 'Chưa khởi tạo'],
    ['status', 'NOT_APPLICABLE', 'Không áp dụng'],
    ['status', 'BYPASSED_WITH_APPROVAL', 'Bỏ qua có phê duyệt'],
    ['status', 'IN_PROGRESS', 'Đang thực hiện'],
    ['status', 'IN_REVIEW', 'Đang chờ phê duyệt'],
    ['status', 'READY_FOR_REVIEW', 'Sẵn sàng trình duyệt'],
    ['status', 'UNDER_REVIEW', 'Đang chờ phê duyệt'],
    ['status', 'PENDING', 'Chờ duyệt'],
    ['status', 'BLOCKED', 'Bị chặn'],
    ['status', 'DONE', 'Hoàn thành'],
    ['status', 'COMPLETED', 'Hoàn thành'],
    ['status', 'CANCELLED', 'Đã hủy'],
    ['status', 'WARNING', 'Cảnh báo'],
    ['status', 'CRITICAL', 'Nghiêm trọng'],
    ['status', 'DRAFT', 'Bản nháp'],
    ['status', 'DRAFT', 'Đã tải lên', 'requiredDocument'],
    ['status', 'MISSING', 'Chưa có'],
    ['status', 'UPLOADED', 'Đã tải tệp'],
    ['status', 'PENDING_REVIEW', 'Đang chờ phê duyệt'],
    ['status', 'APPROVED', 'Đã phê duyệt'],
    ['status', 'APPROVED_WITH_COMMENTS', 'Phê duyệt kèm ý kiến'],
    ['status', 'REVISION_REQUIRED', 'Yêu cầu chỉnh sửa'],
    ['status', 'REJECTED', 'Bị từ chối'],
    ['status', 'SUPERSEDED', 'Đã được thay thế'],
    ['risk', 'LOW', 'Thấp'],
    ['risk', 'NORMAL', 'Trung bình'],
    ['risk', 'MEDIUM', 'Trung bình'],
    ['risk', 'HIGH', 'Cao'],
    ['risk', 'CRITICAL', 'Nghiêm trọng'],
    ['role', 'PROJECT_OWNER', 'Chủ dự án'],
    ['role', 'SALES_OWNER', 'Sales phụ trách'],
    ['role', 'PROJECT_DIRECTOR', 'Giám đốc dự án'],
    ['role', 'PROJECT_MANAGER', 'Quản lý dự án'],
    ['role', 'DESIGNER', 'Thiết kế'],
    ['role', 'DOCUMENT_OWNER', 'Phụ trách hồ sơ'],
    ['readiness', 'PROJECT_DOSSIER', 'HỒ SƠ DỰ ÁN'],
    ['readiness', 'DOCUMENTS', 'HỒ SƠ CẦN HOÀN THÀNH'],
    ['readiness', 'PEOPLE', 'NHÂN SỰ & PHÂN CÔNG'],
    ['readiness', 'SURVEY', 'KHẢO SÁT'],
    ['readiness', 'PROPOSAL', 'ĐỀ XUẤT DỰ ÁN'],
    ['readiness', 'FINANCE', 'NGÂN SÁCH SƠ BỘ'],
    ['readiness', 'APPROVAL', 'PHÊ DUYỆT KHỞI ĐỘNG'],
    ['stage', 'STAGE_1', 'Giai đoạn 1'],
    ['stage', 'STAGE_2', 'Giai đoạn 2'],
    ['stage', 'STAGE_3', 'Giai đoạn 3'],
    ['stage', 'STAGE_4', 'Giai đoạn 4'],
    ['stage', 'STAGE_5', 'Giai đoạn 5'],
    ['boolean', true, 'Có'],
    ['boolean', false, 'Không'],
    ['boolean', true, 'Bắt buộc', 'requiresSurvey'],
    ['boolean', false, 'Không yêu cầu', 'requiresSurvey'],
    ['boolean', true, 'Bắt buộc', 'requiresPreliminaryFinance'],
    ['boolean', false, 'Không yêu cầu', 'requiresPreliminaryFinance'],
  ] as const)('labels %s %s', (kind, value, expected, context?) => {
    expect(projectDomainLabel(kind, value, context)).toBe(expected);
  });

  it('humanizes an unknown code without rendering its raw form or logging outside development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');

    const label = projectDomainLabel('status', 'WAITING_FOR_CUSTOMER');

    expect(label).toBe('Không xác định: Waiting for customer');
    expect(label).not.toContain('WAITING_FOR_CUSTOMER');
    expect(warn).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    warn.mockRestore();
  });

  it('warns only in development for an unknown code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'development');

    expect(projectDomainLabel('status', 'WAITING_FOR_CUSTOMER')).toBe(
      'Không xác định: Waiting for customer',
    );
    expect(warn).toHaveBeenCalledWith('Unknown Project domain label', {
      kind: 'status',
      value: 'WAITING_FOR_CUSTOMER',
    });
    vi.unstubAllEnvs();
    warn.mockRestore();
  });
});

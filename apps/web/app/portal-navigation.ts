export const navigation: {
  href: string;
  label: string;
  permission?: string;
}[] = [
  { href: '/', label: 'Tổng quan' },
  {
    href: '/crm/leads',
    label: 'Khách hàng tiềm năng',
    permission: 'crm.lead.read',
  },
  {
    href: '/crm/opportunities',
    label: 'Cơ hội',
    permission: 'crm.opportunity.read',
  },
  { href: '/customers', label: 'Khách hàng', permission: 'crm.customer.read' },
  { href: '/projects', label: 'Dự án', permission: 'project.read' },
  {
    href: '/catalog',
    label: 'Sản phẩm & Thương hiệu',
    permission: 'catalog.read',
  },
  { href: '/partners', label: 'Nhà cung cấp', permission: 'supplier.read' },
  {
    href: '/procurement/requests',
    label: 'Yêu cầu mua hàng',
    permission: 'purchase_request.read',
  },
  {
    href: '/procurement/rfqs',
    label: 'RFQ nhà cung cấp',
    permission: 'procurement.rfq.read',
  },
  {
    href: '/procurement/supplier-quotes',
    label: 'Báo giá nhà cung cấp',
    permission: 'procurement.supplier_quotation.read',
  },
  {
    href: '/procurement/comparisons',
    label: 'So sánh nhà cung cấp',
    permission: 'procurement.supplier_selection.read',
  },
  {
    href: '/procurement/purchase-orders',
    label: 'Đơn mua hàng',
    permission: 'procurement.purchase_order.read',
  },
  {
    href: '/procurement/proforma-invoices',
    label: 'Proforma Invoice',
    permission: 'procurement.proforma_invoice.read',
  },
  {
    href: '/finance/payables',
    label: 'Công nợ nhà cung cấp',
    permission: 'supplier_payable.read',
  },
  {
    href: '/finance/supplier-payments',
    label: 'Thanh toán nhà cung cấp',
    permission: 'supplier_payment.read',
  },
  { href: '/production', label: 'Sản xuất', permission: 'production.read' },
  {
    href: '/logistics/shipments',
    label: 'Vận chuyển',
    permission: 'logistics.shipment.read',
  },
  {
    href: '/logistics/customs',
    label: 'Hải quan',
    permission: 'logistics.customs.read',
  },
  {
    href: '/logistics/landed-costs',
    label: 'Landed Cost',
    permission: 'logistics.landed_cost.read',
  },
  { href: '/warehouses', label: 'Kho', permission: 'warehouse.read' },
  { href: '/inventory', label: 'Tồn kho', permission: 'inventory.read' },
  { href: '/installations', label: 'Lắp đặt', permission: 'installation.read' },
  {
    href: '/after-sales',
    label: 'After-sales',
    permission: 'service_ticket.read',
  },
  { href: '/tasks', label: 'Công việc', permission: 'task.read' },
  { href: '/surveys', label: 'Khảo sát & Yêu cầu', permission: 'survey.read' },
  { href: '/files', label: 'Tệp tin', permission: 'file.read' },
  {
    href: '/notifications',
    label: 'Thông báo',
    permission: 'notification.read',
  },
  { href: '/import', label: 'Nhập dữ liệu', permission: 'import.read' },
  {
    href: '/marketing/content',
    label: 'Nội dung Marketing',
    permission: 'marketing.content.read',
  },
  {
    href: '/marketing/calendar',
    label: 'Lịch xuất bản',
    permission: 'marketing.content.read',
  },
  {
    href: '/marketing/publishing',
    label: 'Hàng đợi xuất bản',
    permission: 'marketing.content.read',
  },
  {
    href: '/settings/organization',
    label: 'Tổ chức',
    permission: 'organization.read',
  },
  {
    href: '/settings/departments',
    label: 'Phòng ban',
    permission: 'department.read',
  },
  { href: '/settings/users', label: 'Người dùng', permission: 'user.read' },
  { href: '/settings/roles', label: 'Vai trò', permission: 'role.read' },
  { href: '/settings/audit-logs', label: 'Nhật ký', permission: 'audit.read' },
  {
    href: '/settings/custom-fields',
    label: 'Trường tùy chỉnh',
    permission: 'custom_fields.read',
  },
  {
    href: '/settings/system',
    label: 'Cấu hình hệ thống',
    permission: 'system.settings.read',
  },
  { href: '/account/profile', label: 'Hồ sơ' },
  { href: '/account/change-password', label: 'Đổi mật khẩu' },
];

export const visibleNavigation = (
  permissions: string[],
  administrationScope:
    | 'SYSTEM'
    | 'SELF'
    | 'MANAGED_DEPARTMENTS'
    | 'ORGANIZATION' = 'SELF',
  marketingEnabled = process.env.FEATURE_MARKETING === 'true',
) =>
  navigation.filter(
    (item) =>
      (marketingEnabled || !item.href.startsWith('/marketing')) &&
      (!item.permission || permissions.includes(item.permission)) &&
      (item.href !== '/settings/users' || administrationScope !== 'SELF'),
  );

export const routePermissions = navigation.flatMap((item) =>
  item.permission ? ([[item.href, item.permission]] as [string, string][]) : [],
);

import WorkOrderClient from './work-order-client';

export default async function WorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <WorkOrderClient
      key={id}
      id={id}
      deliveryEnabled={process.env.FEATURE_PROJECT_CHAT === 'true'}
    />
  );
}

import { Prisma } from '@prisma/client';

type EstimateLineInput = {
  sellQuantity: string;
  purchaseQuantity?: string;
  purchaseUnitPrice: string | null;
  exchangeRate: string;
  sellingUnitPrice: string;
  freight?: string;
  tax?: string;
  installation?: string;
  other?: string;
};

const money = (value: Prisma.Decimal) => value.toFixed(2);

export function calculateEstimateLine(input: EstimateLineInput) {
  const sellQuantity = new Prisma.Decimal(input.sellQuantity);
  const purchaseQuantity = new Prisma.Decimal(
    input.purchaseQuantity ?? input.sellQuantity,
  );
  const exchangeRate = new Prisma.Decimal(input.exchangeRate);
  const sellingUnitPrice = new Prisma.Decimal(input.sellingUnitPrice);
  if (
    sellQuantity.lte(0) ||
    purchaseQuantity.lte(0) ||
    exchangeRate.lte(0) ||
    sellingUnitPrice.lt(0)
  )
    throw new RangeError('Estimate values are outside the supported range');
  const revenue = sellQuantity.mul(sellingUnitPrice);
  if (input.purchaseUnitPrice === null)
    return {
      totalCost: null,
      revenue: money(revenue),
      profit: null,
      margin: null,
      markup: null,
      completeness: 'MISSING_PRICE' as const,
    };

  const purchaseUnitPrice = new Prisma.Decimal(input.purchaseUnitPrice);
  const extras = [
    input.freight,
    input.tax,
    input.installation,
    input.other,
  ].map((value) => new Prisma.Decimal(value ?? 0));
  if (purchaseUnitPrice.lt(0) || extras.some((value) => value.lt(0)))
    throw new RangeError('Estimate values are outside the supported range');
  const totalCost = extras.reduce(
    (sum, value) => sum.add(value),
    purchaseQuantity.mul(purchaseUnitPrice).mul(exchangeRate),
  );
  const profit = revenue.sub(totalCost);
  return {
    totalCost: money(totalCost),
    revenue: money(revenue),
    profit: money(profit),
    margin: revenue.eq(0) ? null : profit.div(revenue).toFixed(6),
    markup: totalCost.eq(0) ? null : profit.div(totalCost).toFixed(6),
    completeness: 'COMPLETE' as const,
  };
}

export function sumEstimateCosts(
  lines: readonly {
    totalCost: string | null;
    contributesToTotal: boolean;
  }[],
) {
  const included = lines.filter(({ contributesToTotal }) => contributesToTotal);
  if (included.some(({ totalCost }) => totalCost === null)) return null;
  return money(
    included.reduce(
      (sum, { totalCost }) => sum.add(totalCost!),
      new Prisma.Decimal(0),
    ),
  );
}

export function allocateAmount(total: string, weights: readonly string[]) {
  const amount = new Prisma.Decimal(total);
  const parsed = weights.map((weight) => new Prisma.Decimal(weight));
  const weightTotal = parsed.reduce(
    (sum, weight) => sum.add(weight),
    new Prisma.Decimal(0),
  );
  if (
    amount.lt(0) ||
    !parsed.length ||
    parsed.some((weight) => weight.lt(0)) ||
    weightTotal.lte(0)
  )
    throw new RangeError('Allocation values are outside the supported range');
  const allocated = parsed.map((weight) =>
    amount
      .mul(weight)
      .div(weightTotal)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
  );
  let remainingCents = amount
    .toDecimalPlaces(2)
    .sub(
      allocated.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0)),
    )
    .mul(100)
    .toNumber();
  for (
    let index = 0;
    remainingCents > 0;
    index = (index + 1) % allocated.length
  ) {
    allocated[index] = allocated[index]!.add(0.01);
    remainingCents -= 1;
  }
  return allocated.map(money);
}

export function expectedMonetaryValue(
  probability: string | null,
  financialImpact: string | null,
) {
  if (probability === null || financialImpact === null) return null;
  const chance = new Prisma.Decimal(probability);
  const impact = new Prisma.Decimal(financialImpact);
  if (chance.lt(0) || chance.gt(1) || impact.lt(0))
    throw new RangeError('Risk values are outside the supported range');
  return money(chance.mul(impact));
}

export function estimateAtCompletion(input: {
  actualCost: string;
  remainingCommitment: string;
  uncommittedCost: string;
  cashAdvance?: string;
  currentBudget: string;
}) {
  const forecast = new Prisma.Decimal(input.actualCost)
    .add(input.remainingCommitment)
    .add(input.uncommittedCost);
  return {
    forecast: money(forecast),
    variance: money(new Prisma.Decimal(input.currentBudget).sub(forecast)),
  };
}

export function remainingRiskContingency(
  approvedAmount: string,
  riskStatus: string,
) {
  return riskStatus === 'OCCURRED'
    ? '0.00'
    : money(new Prisma.Decimal(approvedAmount));
}

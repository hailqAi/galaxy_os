import { Prisma } from '@prisma/client';

export const ToolDecimal = Prisma.Decimal.clone({ precision: 80 });

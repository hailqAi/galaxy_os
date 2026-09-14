const INVALID_MONEY = 'Giá trị tiền không hợp lệ.';

export function normalizeVietnameseMoney(
  value: string | null | undefined,
): string | null {
  if (value == null || !value.trim()) return null;
  const compact = value.trim().replace(/\s/g, '');
  const amount = compact.endsWith('₫') ? compact.slice(0, -1) : compact;
  if (!amount || amount.includes('₫')) throw new Error(INVALID_MONEY);

  const grouped = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(amount);
  const commaDecimal = /^\d{1,18},\d{1,2}$/.test(amount);
  const canonical = grouped
    ? amount.replaceAll('.', '').replace(',', '.')
    : commaDecimal
      ? amount.replace(',', '.')
      : amount;
  const match = /^(\d{1,18})(?:\.(\d{1,2}))?$/.exec(canonical);
  if (!match) throw new Error(INVALID_MONEY);
  return match[2] === undefined ? match[1]! : `${match[1]!}.${match[2]}`;
}

export function formatVietnameseMoney(value: string | null | undefined) {
  const negative = value?.trim().startsWith('-') ?? false;
  const canonical = normalizeVietnameseMoney(
    negative ? value!.trim().slice(1) : value,
  );
  if (canonical === null) return '';
  const [integer = '', decimal] = canonical.split('.');
  const fraction = decimal?.replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${fraction ? `,${fraction}` : ''} ₫`;
}

export function subtractVietnameseMoney(
  revenue: string | null | undefined,
  cost: string | null | undefined,
) {
  const left = normalizeVietnameseMoney(revenue);
  const right = normalizeVietnameseMoney(cost);
  if (left === null || right === null) return null;
  const minor = (value: string) => {
    const [integer = '', decimal = ''] = value.split('.');
    return BigInt(integer) * BigInt(100) + BigInt(decimal.padEnd(2, '0'));
  };
  const result = minor(left) - minor(right);
  const negative = result < BigInt(0);
  const absolute = negative ? -result : result;
  const fraction = String(absolute % BigInt(100)).padStart(2, '0');
  return `${negative ? '-' : ''}${absolute / BigInt(100)}${fraction === '00' ? '' : `.${fraction}`}`;
}

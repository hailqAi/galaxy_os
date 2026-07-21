export const can = (permissions: string[], permission: string) =>
  permissions.includes(permission);

export function organizationInput(input: Record<string, FormDataEntryValue>) {
  const currency = String(input.defaultCurrency ?? '');
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error('Mã tiền tệ phải gồm 3 chữ cái in hoa.');
  return {
    name: String(input.name),
    timezone: String(input.timezone),
    defaultCurrency: currency,
  };
}

export const departmentAssignments = (ids: string[], primary: string) =>
  ids.map((departmentId) => ({
    departmentId,
    isPrimary: departmentId === primary,
  }));

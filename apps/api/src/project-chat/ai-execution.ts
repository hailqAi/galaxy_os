import { z } from 'zod';

export const executor = z.enum(['AUTO', 'SIWC', 'MCP_EVENTS']);
export const executionSelection = z
  .object({
    requested_executor: executor,
    effective_executor: z.enum(['GALAXY_DATA', 'SIWC', 'MCP_EVENTS']),
    context: z.enum(['GENERAL', 'PROJECT']),
  })
  .strict();
export function referencesPreviousFile(question: string) {
  const text = question
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
  return /\b(?:file|tep|workbook|bang tinh)\b[^.!?\n]*\b(?:vua|gan nhat|truoc|just|last|previous)\b|\b(?:last|previous)\s+(?:file|workbook)\b/.test(
    text,
  );
}
export function requestedOutputs(question: string) {
  const normalized = question
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\bexcel\b/g, 'xlsx');
  const formats = [
    'xlsx',
    'docx',
    'pdf',
    'pptx',
    'png',
    'jpeg',
    'mp4',
    'txt',
    'zip',
  ];
  const outputs = new Set<string>();
  for (const clause of normalized.split(/[.;!?\n]/)) {
    const pattern =
      /\b(?:(?:tao|xuat|tra|create|produce|export|return|deliver|bat buoc)\s+(?:(?:mot|a|an|the|file|tep|workbook|document|ket qua|dinh dang|dang|sang|ra|ca|bang tinh)\s+)*|(?:chuyen(?: doi)?|convert)\s+(?:.*?\s+)?(?:sang|thanh|to)\s+(?:(?:mot|a|an|the|file|tep|workbook|dinh dang)\s+)*)(xlsx|docx|pdf|pptx|png|jpeg|mp4|txt|zip)\b/g;
    for (const match of clause.matchAll(pattern)) {
      if (
        /^(?:chuyen|convert)\b/.test(match[0]) &&
        /\b(?:huong dan|cach|how to|how can|how do|giai thich)\b/.test(
          clause.slice(0, match.index),
        )
      )
        continue;
      if (
        /(?:khong(?: can)?|do not|don't)\s*$/.test(clause.slice(0, match.index))
      )
        continue;
      outputs.add(match[1]!);
      const rest = clause.slice(match.index! + match[0].length);
      const additional =
        /^(?:\s*(?:cung|va|and|,|\/|\+)\s*(xlsx|docx|pdf|pptx|png|jpeg|mp4|txt|zip)\b)+/.exec(
          rest,
        );
      if (additional)
        for (const format of formats)
          if (new RegExp('\\b' + format + '\\b').test(additional[0]))
            outputs.add(format);
    }
  }
  return formats.filter((format) => outputs.has(format));
}
export function chooseExecution(input: {
  requested: z.infer<typeof executor>;
  question: string;
  sourceCount: number;
  outputFormat?: string;
  pinnedContext?: boolean;
}) {
  const question = input.question
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
    .replace(/[?!.,]+$/g, '')
    .trim();
  const context =
    !input.sourceCount &&
    !input.outputFormat &&
    !input.pinnedContext &&
    (/^(?:chao|xin chao|hello|hi|hey)$/.test(question) ||
      [...question].length === 1)
      ? ('GENERAL' as const)
      : ('PROJECT' as const);
  if (input.requested !== 'AUTO')
    return { effective: input.requested, context };
  if (
    input.sourceCount ||
    input.outputFormat ||
    referencesPreviousFile(input.question) ||
    requestedOutputs(input.question).length
  )
    return { effective: 'MCP_EVENTS' as const, context: 'PROJECT' as const };
  const count =
    /^(?:(?:galaxy\s?os|os|he thong)\s+)?(?:dang\s+)?(?:co bao nhieu|dem|so luong)(?:\s+cac)?\s+(?:du an|projects?)(?:\s+(dang trien khai|dang thuc hien|dang hoat dong))?$/.exec(
      question,
    );
  if (count && !input.pinnedContext)
    return {
      effective: 'GALAXY_DATA' as const,
      context: 'PROJECT' as const,
      intent: 'COUNT_PROJECTS' as const,
      filters: count[1] ? { status: 'ACTIVE' as const } : {},
    };
  return { effective: 'SIWC' as const, context };
}

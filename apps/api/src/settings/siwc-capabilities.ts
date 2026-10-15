import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { ChatGptConnectionService } from './chatgpt-connection.service';
import { renderDocument } from '../project-chat/ai-document';
import { scanPages } from '../project-chat/ai-native-source';
const effort = z.enum(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
export const siwcPreferenceSchema = z
  .object({
    model: z.string().min(1).max(200),
    reasoning: z.enum(['default', ...effort.options]),
  })
  .strict();
export const siwcPreferenceKey = (
  actor: Pick<CurrentActor, 'organizationId' | 'userId'>,
) => `siwc.preference.${actor.organizationId}.${actor.userId}`;
export async function siwcPreference(
  tx: Pick<Prisma.TransactionClient, 'systemSetting'>,
  actor: Pick<CurrentActor, 'organizationId' | 'userId'>,
) {
  const row = await tx.systemSetting.findUnique({
    where: { key: siwcPreferenceKey(actor) },
  });
  const parsed = siwcPreferenceSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}
const input = z
  .object({
    model: z.string().min(1).max(200),
    reasoningEfforts: z.array(effort).max(6).default([]),
    webSearch: z.boolean().default(false),
    imageInput: z.boolean().default(false),
    pdfInput: z.boolean().default(false),
  })
  .strict();
const profile = z
  .object({
    generation: z.string(),
    model: z.string(),
    reasoningModes: z.array(z.string()),
    effortEvidence: z.record(
      z.string(),
      z.enum(['REQUEST_ACCEPTED', 'PROVIDER_REPORTED']),
    ),
    webSearch: z.boolean(),
    imageInput: z.boolean().default(false),
    pdfInput: z.boolean().default(false),
    receipts: z.array(
      z.object({
        kind: z.string(),
        status: z.string(),
        requestedEffort: z.string().nullable(),
        requestedModel: z.string().optional(),
        sentModel: z.string().optional(),
        sentEffort: z.string().nullable().optional(),
        evidenceLevel: z.string().optional(),
        observedEffort: z.string().nullable(),
        observedModel: z.string().nullable(),
        requestId: z.string().nullable(),
      }),
    ),
    checkedAt: z.string(),
  })
  .strict();
const key = (org: string, model: string) =>
  'siwc.capabilities.' +
  org +
  '.' +
  createHash('sha256').update(model).digest('hex');
export async function siwcCapabilities(
  tx: Pick<Prisma.TransactionClient, 'systemSetting'>,
  org: string,
  generation: string,
  model: string,
) {
  const row = await tx.systemSetting.findUnique({
    where: { key: key(org, model) },
  });
  const parsed = profile.safeParse(row?.value);
  return parsed.success &&
    parsed.data.generation === generation &&
    parsed.data.model === model
    ? parsed.data
    : {
        reasoningModes: ['default'],
        effortEvidence: {},
        webSearch: false,
        imageInput: false,
        pdfInput: false,
        receipts: [],
        checkedAt: null,
      };
}
@Injectable()
export class SiwcCapabilityService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ChatGptConnectionService)
    private readonly connection: ChatGptConnectionService,
  ) {}
  async check(actor: CurrentActor, value: unknown) {
    const parsed = input.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('SIWC_CAPABILITY_INPUT_INVALID');
    const q = parsed.data;
    const owner = await this.connection.owner(actor);
    if (!owner.models.some((m) => m.id === q.model))
      throw new ConflictException('MODEL_NOT_AVAILABLE');
    const result: z.infer<typeof profile> = {
      generation: owner.generation,
      model: q.model,
      reasoningModes: ['default'],
      effortEvidence: {},
      webSearch: false,
      imageInput: false,
      pdfInput: false,
      receipts: [],
      checkedAt: new Date().toISOString(),
    };
    for (const requestedEffort of [...new Set(q.reasoningEfforts)]) {
      try {
        const response = await this.connection.respond(
          actor,
          owner.generation,
          {
            model: q.model,
            instructions:
              'Answer accurately. This is a synthetic capability check; do not use Project data.',
            input: [
              {
                role: 'user',
                content:
                  'Explain why adding binary floating point 0.1 and 0.2 can differ from decimal 0.3; include a correct TypeScript solution.',
              },
            ],
            tools: [],
            reasoningEffort: requestedEffort,
          },
          AbortSignal.timeout(110000),
        );
        const matched =
          response.model === q.model &&
          (!response.reasoningEffort ||
            response.reasoningEffort === requestedEffort);
        if (matched) {
          result.reasoningModes.push(requestedEffort);
          result.effortEvidence[requestedEffort] = response.reasoningEffort
            ? 'PROVIDER_REPORTED'
            : 'REQUEST_ACCEPTED';
        }
        result.receipts.push({
          kind: 'reasoning',
          status: matched ? 'ACCEPTED' : 'MISMATCH',
          requestedEffort,
          requestedModel: q.model,
          sentModel: q.model,
          sentEffort: requestedEffort,
          evidenceLevel: response.reasoningEffort
            ? 'PROVIDER_REPORTED'
            : 'REQUEST_ACCEPTED',
          observedEffort: response.reasoningEffort ?? null,
          observedModel: response.model,
          requestId: response.requestId ?? null,
        });
      } catch {
        result.receipts.push({
          kind: 'reasoning',
          status: 'UNVERIFIED',
          requestedEffort,
          requestedModel: q.model,
          sentModel: q.model,
          sentEffort: requestedEffort,
          evidenceLevel: 'UNVERIFIED',
          observedEffort: null,
          observedModel: null,
          requestId: null,
        });
      }
    }
    if (q.webSearch) {
      try {
        const response = await this.connection.respond(
          actor,
          owner.generation,
          {
            model: q.model,
            instructions:
              'Use native web search and cite the official OpenAI source. This is a synthetic capability check.',
            input: [
              {
                role: 'user',
                content:
                  'Find the official Sign in with ChatGPT preview limitations and list unsupported hosted tools. Cite the official documentation.',
              },
            ],
            tools: [],
            nativeWebSearch: true,
          },
          AbortSignal.timeout(110000),
        );
        result.webSearch =
          response.model === q.model &&
          (response.webSearches ?? 0) > 0 &&
          (response.webCitations?.length ?? 0) > 0;
        result.receipts.push({
          kind: 'native_web_search',
          status: result.webSearch ? 'LIVE_TOOL_VERIFIED' : 'UNVERIFIED',
          requestedEffort: null,
          requestedModel: q.model,
          sentModel: q.model,
          sentEffort: null,
          evidenceLevel: result.webSearch ? 'LIVE_TOOL_VERIFIED' : 'UNVERIFIED',
          observedEffort: response.reasoningEffort ?? null,
          observedModel: response.model,
          requestId: response.requestId ?? null,
        });
      } catch {
        result.receipts.push({
          kind: 'native_web_search',
          status: 'UNVERIFIED',
          requestedEffort: null,
          requestedModel: q.model,
          sentModel: q.model,
          sentEffort: null,
          evidenceLevel: 'UNVERIFIED',
          observedEffort: null,
          observedModel: null,
          requestId: null,
        });
      }
    }
    for (const kind of ['imageInput', 'pdfInput'] as const)
      if (q[kind]) {
        let observedModel: string | null = null,
          requestId: string | null = null;
        try {
          const pdf = await renderDocument(
            {
              format: 'pdf',
              title: 'Synthetic capability corpus',
              blocks: [{ kind: 'heading', text: 'E02-SIWC-7392' }],
            },
            [],
          );
          const checksum = createHash('sha256').update(pdf.bytes).digest('hex');
          const media =
            kind === 'imageInput'
              ? {
                  type: 'input_image',
                  detail: 'auto',
                  image_url:
                    'data:image/png;base64,' +
                    (
                      await scanPages(
                        {
                          organizationId: actor.organizationId,
                          projectId: 'synthetic-capability',
                          roomId: '',
                          sourceId: 'synthetic-capability',
                          version: checksum,
                          text: '',
                        },
                        'Synthetic.pdf',
                        pdf.bytes,
                        checksum,
                        AbortSignal.timeout(10000),
                        1,
                      )
                    ).media[0]!.bytes.toString('base64'),
                }
              : {
                  type: 'input_file',
                  filename: 'Synthetic.pdf',
                  file_data:
                    'data:application/pdf;base64,' +
                    pdf.bytes.toString('base64'),
                };
          const response = await this.connection.respond(
            actor,
            owner.generation,
            {
              model: q.model,
              instructions:
                'Read the supplied synthetic original. Do not use web or Project data.',
              input: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: 'Transcribe the verification marker exactly as shown in the supplied content.',
                    },
                    media,
                  ],
                },
              ],
              tools: [],
            },
            AbortSignal.timeout(110000),
          );
          observedModel = response.model;
          requestId = response.requestId ?? null;
          result[kind] =
            response.model === q.model &&
            !response.calls.length &&
            response.text.includes('E02-SIWC-7392');
        } catch {
          result[kind] = false;
        }
        result.receipts.push({
          kind: kind === 'imageInput' ? 'native_image' : 'native_pdf',
          status: result[kind] ? 'LIVE_CONTENT_VERIFIED' : 'UNVERIFIED',
          requestedEffort: null,
          requestedModel: q.model,
          sentModel: q.model,
          sentEffort: null,
          observedEffort: null,
          observedModel,
          requestId,
          evidenceLevel: result[kind] ? 'LIVE_CONTENT_VERIFIED' : 'UNVERIFIED',
        });
      }
    await this.connection.owner(actor, owner.generation);
    await this.db.$transaction(
      async (tx) => {
        const previous = await siwcCapabilities(
          tx,
          actor.organizationId,
          owner.generation,
          q.model,
        );
        const retested = new Set(q.reasoningEfforts);
        result.reasoningModes = [
          ...new Set([
            ...previous.reasoningModes.filter(
              (mode) => !retested.has(mode as z.infer<typeof effort>),
            ),
            ...result.reasoningModes,
          ]),
        ];
        result.effortEvidence = {
          ...Object.fromEntries(
            Object.entries(previous.effortEvidence).filter(
              ([mode]) => !retested.has(mode as z.infer<typeof effort>),
            ),
          ),
          ...result.effortEvidence,
        };
        if (!q.webSearch) result.webSearch = previous.webSearch;
        if (!q.imageInput) result.imageInput = previous.imageInput;
        if (!q.pdfInput) result.pdfInput = previous.pdfInput;
        result.receipts = [
          ...previous.receipts.filter((receipt) =>
            receipt.kind === 'reasoning'
              ? !retested.has(receipt.requestedEffort as z.infer<typeof effort>)
              : receipt.kind === 'native_image'
                ? !q.imageInput
                : receipt.kind === 'native_pdf'
                  ? !q.pdfInput
                  : !q.webSearch,
          ),
          ...result.receipts,
        ];
        await tx.systemSetting.upsert({
          where: { key: key(actor.organizationId, q.model) },
          create: { key: key(actor.organizationId, q.model), value: result },
          update: { value: result },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return result;
  }
}

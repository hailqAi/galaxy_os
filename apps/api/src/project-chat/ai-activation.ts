import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import {
  AiError,
  ActivationEvidence,
  ConfiguredModel,
  activationEvidence,
} from './ai-registry';

export const activationFixtureVersion = 'galaxy-ai-activation-v1' as const;
// Fixture tổng hợp cố định, không lấy bất kỳ nội dung/file/URL nào từ Project hoặc client.
export function activationFixture(capability: 'text' | 'image' | 'pdf') {
  const handle = 'ACTIVATION_SOURCE';
  if (capability === 'text')
    return {
      sources: [
        {
          handle,
          text: 'Thẻ thử NG-42: chiều rộng 900 mm. Trạng thái: chưa xác nhận. Nguồn tổng hợp để kiểm tra kết nối.',
        },
      ],
      questions: [
        'Chào ngắn bằng tiếng Việt và nêu mã thẻ thử.',
        'Chiều rộng của thẻ thử là bao nhiêu?',
        'Nhắc lại chiều rộng vừa trả lời và trạng thái xác nhận.',
      ],
      assertions: [/NG-42/i, /900/, /900[\s\S]*chưa|chưa[\s\S]*900/i],
      media: [],
    };
  const pdf = capability === 'pdf';
  return {
    sources: [
      {
        handle,
        text: 'Tài liệu tổng hợp đính kèm, chỉ dùng nội dung nhìn thấy để trả lời; trích nguồn ACTIVATION_SOURCE.',
      },
    ],
    questions: [
      pdf
        ? 'Đọc PDF: mã tài liệu và kích thước ghi trên trang là gì?'
        : 'Nêu tên màu nền chính của ảnh bằng tiếng Việt.',
    ],
    assertions: [
      pdf
        ? /ACTIVATION-PDF-47[\s\S]*625|625[\s\S]*ACTIVATION-PDF-47/i
        : /xanh (dương|lam)|blue/i,
    ],
    media: [
      {
        handle,
        mime: pdf ? 'application/pdf' : 'image/png',
        bytes: Buffer.from(
          pdf
            ? 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA0MDAgMjAwXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA1IDAgUiA+PiA+PiAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA1NiA+PgpzdHJlYW0KQlQgL0YxIDE4IFRmIDI0IDEyMCBUZCAoQUNUSVZBVElPTi1QREYtNDc6IDYyNSBtbSkgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNDcgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MTcKJSVFT0YK'
            : 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAABWklEQVR4nO3OQQ0AMBAEofVv+iqDxzRBANvuo/wgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwgzg/i/CDOD+L8IM4P4vwg7QGY6MOyYa3yZwAAAABJRU5ErkJggg==',
          'base64',
        ),
      },
    ],
  };
}

export async function recordActivation(
  config: ConfiguredModel,
  evidence: ActivationEvidence,
) {
  const checked = activationEvidence.parse(evidence);
  if (!config.fileDigest || !process.env.GALAXY_AI_CONFIG_FILE)
    throw new AiError('CREDENTIAL_NOT_LOADED');
  await new Promise<void>((done, reject) => {
    const child = execFile(
      'python3',
      [
        resolve(__dirname, '../../../../scripts/configure-ai.py'),
        'record-test',
        '--provider',
        config.provider,
        '--file',
        process.env.GALAXY_AI_CONFIG_FILE!,
      ],
      { timeout: 5000, maxBuffer: 4096 },
      (error, _stdout, stderr) => {
        if (error)
          reject(
            new AiError(
              stderr.trim() === 'CONFIG_CHANGED'
                ? 'CONFIG_CHANGED'
                : 'EVIDENCE_WRITE_FAILED',
            ),
          );
        else done();
      },
    );
    child.stdin?.on('error', () => {});
    child.stdin?.end(
      JSON.stringify({ expectedDigest: config.fileDigest, evidence: checked }),
    );
  });
}

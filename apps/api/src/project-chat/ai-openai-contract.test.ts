import { expect, it, vi } from 'vitest';
import {
  openAiRequest,
  openAiResult,
  dispatchOpenAiCapability,
} from './ai-openai-contract';

it('capability chưa nối budget/ACL luôn chặn trước network, không fallback paid', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  await expect(dispatchOpenAiCapability()).rejects.toThrow(
    'NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET',
  );
  expect(network).not.toHaveBeenCalled();
  network.mockRestore();
});
it('Responses dùng tool schema hiện có, call_id thật, không chứa Project do model chọn', () => {
  const request = openAiRequest('responses', {
    model: 'configured-model',
    input: [{ role: 'user', content: 'Tính 3 × 7' }],
    tools: ['calculate'],
    maxOutputTokens: 500,
  });
  expect(request.path).toBe('/responses');
  expect(request.body).toMatchObject({
    store: false,
    parallel_tool_calls: false,
    tools: [{ type: 'function', name: 'calculate' }],
  });
  expect(JSON.stringify(request.body)).not.toContain('projectId');
  const result = openAiResult('responses', {
    id: 'resp_1',
    model: 'actual-model',
    status: 'completed',
    output: [
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'calculate',
        arguments:
          '{"operation":"multiply","operands":["3","7"],"decimalPlaces":null}',
      },
    ],
    usage: { input_tokens: 11, output_tokens: 22 },
  });
  expect(result).toMatchObject({
    id: 'resp_1',
    calls: [{ call_id: 'call_1', name: 'calculate' }],
    text: '',
    usage: { input_tokens: 11 },
  });
  expect(() =>
    openAiRequest('responses', {
      model: 'x',
      input: [{ role: 'user', content: 'x' }],
      tools: ['shell'],
      maxOutputTokens: 10,
    }),
  ).toThrow();
});
it('ảnh và audio dùng endpoint riêng, multipart bytes, không URL/fakepath hoặc model chat mặc định', async () => {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
    'base64',
  );
  const source = { bytes, mime: 'image/png' as const };
  const edit = openAiRequest(
    'edit_image',
    {
      model: 'configured-image-model',
      prompt: 'Bản nháp ảnh',
      size: '1024x1024',
      quality: 'low',
    },
    source,
  );
  expect(edit.path).toBe('/images/edits');
  expect(edit.body).toBeInstanceOf(FormData);
  const image = (edit.body as FormData).get('image[]') as Blob;
  expect(Buffer.from(await image.arrayBuffer())).toEqual(bytes);
  expect(
    openAiResult('generate_image', {
      data: [{ b64_json: bytes.toString('base64') }],
      usage: { total_tokens: 1 },
    }),
  ).toMatchObject({ bytes, mime: 'image/png', label: 'Ảnh AI tạo/chỉnh' });
  expect(() =>
    openAiResult('generate_image', {
      data: [{ url: 'http://192.168.1.80/private' }],
    }),
  ).toThrow();
  expect(() =>
    openAiRequest(
      'edit_image',
      { model: 'x', prompt: 'x', size: '1024x1024', quality: 'low' },
      { bytes: Buffer.from('%PDF-x'), mime: 'image/png' },
    ),
  ).toThrow();
  const speech = openAiRequest('speak_response', {
    model: 'configured-audio-model',
    input: 'Xin chào',
    voice: 'coral',
  });
  expect(speech).toMatchObject({
    path: '/audio/speech',
    body: { response_format: 'mp3' },
  });
  expect(openAiResult('transcribe_audio', { text: 'Xin chào' })).toEqual({
    text: 'Xin chào',
  });
  const audio = openAiRequest(
    'transcribe_audio',
    { model: 'configured-transcribe-model' },
    { bytes: Buffer.from('RIFFxxxxWAVEfmt '), mime: 'audio/wav' },
  );
  expect(audio.path).toBe('/audio/transcriptions');
  expect((audio.body as FormData).get('file')).toBeInstanceOf(Blob);
});
it('giới hạn input/output, chỉ text người dùng, không reasoning/raw tool args trong answer', () => {
  expect(() =>
    openAiRequest('generate_image', {
      model: 'x',
      prompt: 'x'.repeat(16001),
      size: '1024x1024',
      quality: 'low',
    }),
  ).toThrow();
  const result = openAiResult('responses', {
    id: 'r',
    model: 'm',
    status: 'completed',
    output: [
      {
        type: 'reasoning',
        id: 'rs_1',
        encrypted_content: 'opaque-encrypted-state',
        summary: [{ text: 'PRIVATE_REASONING' }],
      },
      {
        type: 'message',
        content: [{ type: 'output_text', text: 'Câu trả lời' }],
      },
    ],
  });
  expect(result).toMatchObject({ text: 'Câu trả lời', calls: [], usage: null });
  expect(JSON.stringify(result)).not.toContain('PRIVATE_REASONING');
  expect(result).toMatchObject({
    continuation: [
      {
        type: 'reasoning',
        encrypted_content: 'opaque-encrypted-state',
        summary: [],
      },
    ],
  });
  expect(() =>
    openAiResult('responses', {
      id: 'r',
      model: 'm',
      status: 'incomplete',
      output: [],
    }),
  ).toThrow();
});
it('ảnh gần8MB không tràn stack; MP3 bounded và disclosure thật', () => {
  const bytes = Buffer.alloc(7_999_998, 1);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
  const result = openAiResult('generate_image', {
    data: [{ b64_json: bytes.toString('base64') }],
  });
  expect('bytes' in result && result.bytes?.equals(bytes)).toBe(true);
  expect(
    openAiResult('speak_response', Buffer.from('ID3mock-audio')),
  ).toMatchObject({ mime: 'audio/mpeg', label: 'Giọng đọc do AI tạo' });
  expect(() =>
    openAiResult('speak_response', Buffer.from('<html>error')),
  ).toThrow();
  expect(() =>
    openAiResult('speak_response', Buffer.alloc(8_000_001)),
  ).toThrow();
});

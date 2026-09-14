import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCommandKey } from './create-command-key';

afterEach(() => vi.unstubAllGlobals());

describe('createCommandKey', () => {
  it('uses crypto.randomUUID when the browser provides it', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '11111111-2222-4333-8444-555555555555',
    });

    expect(createCommandKey()).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('creates an RFC 4122 version 4 key with crypto.getRandomValues', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set([
          0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0xff, 0x77, 0xff, 0x99, 0xaa,
          0xbb, 0xcc, 0xdd, 0xee, 0xff,
        ]);
        return bytes;
      },
    });

    expect(createCommandKey()).toBe('00112233-4455-4f77-bf99-aabbccddeeff');
  });

  it('fails explicitly when secure browser randomness is unavailable', () => {
    vi.stubGlobal('crypto', undefined);

    expect(() => createCommandKey()).toThrow(
      'Secure command key generation is unavailable.',
    );
  });
});

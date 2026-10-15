import { BadRequestException } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';

export const maximumExpandedWorkbookBytes = 32 * 1024 * 1024;
const maximumWorkbookEntries = 2048;
const zipSignature = {
  central: 0x02014b50,
  end: 0x06054b50,
  local: 0x04034b50,
} as const;

export function boundedOfficeParts(
  bytes: Buffer,
  budget = { bytes: 0, entries: 0 },
) {
  if (bytes.length < 22)
    throw new BadRequestException('Invalid Excel workbook');
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65_557);
    offset--
  )
    if (
      bytes.readUInt32LE(offset) === zipSignature.end &&
      offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length
    ) {
      end = offset;
      break;
    }
  if (end < 0) throw new BadRequestException('Invalid Excel workbook');
  const entries = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  if (
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0 ||
    bytes.readUInt16LE(end + 8) !== entries ||
    !entries ||
    budget.entries + entries > maximumWorkbookEntries ||
    centralSize > 1024 * 1024 ||
    centralOffset + centralSize !== end
  )
    throw new BadRequestException('Invalid Excel workbook');
  let cursor = centralOffset;
  budget.entries += entries;
  const parts = new Map<string, Buffer>();
  for (let entry = 0; entry < entries; entry++) {
    if (
      cursor + 46 > end ||
      bytes.readUInt32LE(cursor) !== zipSignature.central
    )
      throw new BadRequestException('Invalid Excel workbook');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const declaredSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const disk = bytes.readUInt16LE(cursor + 34);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const entryLength = 46 + nameLength + extraLength + commentLength;
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString('utf8');
    if (
      cursor + entryLength > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      disk !== 0 ||
      compressedSize === 0xffffffff ||
      declaredSize === 0xffffffff ||
      declaredSize > maximumExpandedWorkbookBytes - budget.bytes ||
      localOffset + 30 > centralOffset ||
      bytes.readUInt32LE(localOffset) !== zipSignature.local
    )
      throw new BadRequestException(
        'Workbook expanded data is invalid or too large',
      );
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (
      !name ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.startsWith('/') ||
      name.split('/').some((part) => part === '..' || part === '.') ||
      bytes.readUInt16LE(localOffset + 6) !== flags ||
      bytes.readUInt16LE(localOffset + 8) !== method ||
      !bytes
        .subarray(localOffset + 30, localOffset + 30 + localNameLength)
        .equals(Buffer.from(name)) ||
      dataOffset + compressedSize > centralOffset
    )
      throw new BadRequestException('Invalid Excel workbook');
    try {
      const content =
        method === 0
          ? bytes.subarray(dataOffset, dataOffset + compressedSize)
          : inflateRawSync(
              bytes.subarray(dataOffset, dataOffset + compressedSize),
              {
                maxOutputLength: Math.max(
                  1,
                  maximumExpandedWorkbookBytes - budget.bytes,
                ),
              },
            );
      budget.bytes += content.length;
      if (
        content.length !== declaredSize ||
        budget.bytes > maximumExpandedWorkbookBytes
      )
        throw new Error('expanded workbook mismatch');
      if (parts.has(name))
        throw new BadRequestException('Duplicate Office part');
      parts.set(name, content);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Workbook expanded data is invalid or too large',
      );
    }
    cursor += entryLength;
  }
  if (cursor !== end) throw new BadRequestException('Invalid Excel workbook');
  return parts;
}

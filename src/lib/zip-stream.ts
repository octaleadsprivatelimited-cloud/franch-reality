export interface StoredZipEntry {
  name: string;
  data: () => Promise<Uint8Array>;
}

interface CentralEntry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

const encoder = new TextEncoder();
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[n] = value >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(value: Date): { date: number; time: number } {
  const year = Math.max(1980, value.getFullYear());
  return {
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | (value.getSeconds() >>> 1),
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
  };
}

function header(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function localHeader(entry: CentralEntry): Uint8Array {
  const { bytes, view } = header(30 + entry.name.length);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, entry.time, true);
  view.setUint16(12, entry.date, true);
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.size, true);
  view.setUint32(22, entry.size, true);
  view.setUint16(26, entry.name.length, true);
  bytes.set(entry.name, 30);
  return bytes;
}

function centralHeader(entry: CentralEntry): Uint8Array {
  const { bytes, view } = header(46 + entry.name.length);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, entry.time, true);
  view.setUint16(14, entry.date, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.size, true);
  view.setUint32(24, entry.size, true);
  view.setUint16(28, entry.name.length, true);
  view.setUint32(42, entry.offset, true);
  bytes.set(entry.name, 46);
  return bytes;
}

function endOfCentralDirectory(
  entries: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array {
  const { bytes, view } = header(22);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries, true);
  view.setUint16(10, entries, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return bytes;
}

/** Stream a standards-compatible, store-only ZIP. PDFs are already compressed, so
 * avoiding a second compression pass saves CPU and lets each generated PDF leave
 * server memory before the next property is rendered. */
export function createStoredZipStream(
  entries: readonly StoredZipEntry[],
  onComplete?: () => Promise<void>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const centralEntries: CentralEntry[] = [];
      let offset = 0;
      try {
        for (const source of entries) {
          const data = await source.data();
          if (data.byteLength > 0xffffffff) throw new Error("A ZIP entry is too large.");
          const name = encoder.encode(source.name.replace(/[\\/]+/g, "-"));
          const entry: CentralEntry = {
            name,
            crc: crc32(data),
            size: data.byteLength,
            offset,
            ...dosDateTime(new Date()),
          };
          const local = localHeader(entry);
          controller.enqueue(local);
          controller.enqueue(data);
          offset += local.byteLength + data.byteLength;
          centralEntries.push(entry);
        }

        const centralOffset = offset;
        for (const entry of centralEntries) {
          const central = centralHeader(entry);
          controller.enqueue(central);
          offset += central.byteLength;
        }
        controller.enqueue(
          endOfCentralDirectory(centralEntries.length, offset - centralOffset, centralOffset),
        );
        if (onComplete) await onComplete();
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

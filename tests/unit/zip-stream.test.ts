import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createStoredZipStream } from "../../src/lib/zip-stream";

async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

describe("stored ZIP stream", () => {
  test("writes multiple named files and a valid central directory", async () => {
    const completed: string[] = [];
    const zip = await collect(
      createStoredZipStream(
        [
          {
            name: "Property-Portfolio-A.pdf",
            data: async () => new TextEncoder().encode("%PDF-first"),
          },
          {
            name: "Property-Portfolio-B.pdf",
            data: async () => new TextEncoder().encode("%PDF-second"),
          },
        ],
        async () => {
          completed.push("yes");
        },
      ),
    );

    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.ok(zip.includes(Buffer.from("Property-Portfolio-A.pdf")));
    assert.ok(zip.includes(Buffer.from("Property-Portfolio-B.pdf")));
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
    assert.equal(zip.readUInt16LE(zip.length - 14), 2);
    assert.deepEqual(completed, ["yes"]);
  });
});

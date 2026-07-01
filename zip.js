// Minimal dependency-free ZIP writer (STORE / no compression).
// Exposes window.SCS_ZIP.create(files) -> Blob
// files: Array<{ name: string, content: string }>
(() => {
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // DOS time/date packed from a JS Date.
  function dosDateTime(date) {
    const time =
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (Math.floor(date.getSeconds() / 2));
    const day =
      ((date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate();
    return { time: time & 0xffff, date: day & 0xffff };
  }

  function writeUint16(view, offset, value) {
    view.setUint16(offset, value & 0xffff, true);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function create(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const { time, date } = dosDateTime(now);

    const entries = files.map((file) => {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = encoder.encode(file.content ?? '');
      return {
        nameBytes,
        dataBytes,
        crc: crc32(dataBytes),
        size: dataBytes.length
      };
    });

    const LOCAL_HEADER = 30;
    const CENTRAL_HEADER = 46;
    const END_RECORD = 22;

    let localSize = 0;
    let centralSize = 0;
    for (const entry of entries) {
      localSize += LOCAL_HEADER + entry.nameBytes.length + entry.size;
      centralSize += CENTRAL_HEADER + entry.nameBytes.length;
    }

    const total = localSize + centralSize + END_RECORD;
    const buffer = new ArrayBuffer(total);
    const view = new DataView(buffer);
    const out = new Uint8Array(buffer);

    let offset = 0;
    const centralOffsets = [];

    // General purpose flag: bit 11 = filename is UTF-8.
    const FLAG_UTF8 = 0x0800;

    for (const entry of entries) {
      centralOffsets.push(offset);

      // Local file header
      writeUint32(view, offset, 0x04034b50); // signature
      writeUint16(view, offset + 4, 20); // version needed
      writeUint16(view, offset + 6, FLAG_UTF8); // flags
      writeUint16(view, offset + 8, 0); // method = store
      writeUint16(view, offset + 10, time);
      writeUint16(view, offset + 12, date);
      writeUint32(view, offset + 14, entry.crc);
      writeUint32(view, offset + 18, entry.size); // compressed
      writeUint32(view, offset + 22, entry.size); // uncompressed
      writeUint16(view, offset + 26, entry.nameBytes.length);
      writeUint16(view, offset + 28, 0); // extra length
      offset += LOCAL_HEADER;

      out.set(entry.nameBytes, offset);
      offset += entry.nameBytes.length;

      out.set(entry.dataBytes, offset);
      offset += entry.size;
    }

    const centralStart = offset;

    entries.forEach((entry, index) => {
      writeUint32(view, offset, 0x02014b50); // central signature
      writeUint16(view, offset + 4, 20); // version made by
      writeUint16(view, offset + 6, 20); // version needed
      writeUint16(view, offset + 8, FLAG_UTF8); // flags
      writeUint16(view, offset + 10, 0); // method
      writeUint16(view, offset + 12, time);
      writeUint16(view, offset + 14, date);
      writeUint32(view, offset + 16, entry.crc);
      writeUint32(view, offset + 20, entry.size); // compressed
      writeUint32(view, offset + 24, entry.size); // uncompressed
      writeUint16(view, offset + 28, entry.nameBytes.length);
      writeUint16(view, offset + 30, 0); // extra length
      writeUint16(view, offset + 32, 0); // comment length
      writeUint16(view, offset + 34, 0); // disk number
      writeUint16(view, offset + 36, 0); // internal attrs
      writeUint32(view, offset + 38, 0); // external attrs
      writeUint32(view, offset + 42, centralOffsets[index]); // local header offset
      offset += CENTRAL_HEADER;

      out.set(entry.nameBytes, offset);
      offset += entry.nameBytes.length;
    });

    // End of central directory record
    writeUint32(view, offset, 0x06054b50);
    writeUint16(view, offset + 4, 0); // disk number
    writeUint16(view, offset + 6, 0); // central dir disk
    writeUint16(view, offset + 8, entries.length); // entries on disk
    writeUint16(view, offset + 10, entries.length); // total entries
    writeUint32(view, offset + 12, centralSize); // central dir size
    writeUint32(view, offset + 16, centralStart); // central dir offset
    writeUint16(view, offset + 20, 0); // comment length

    return new Blob([buffer], { type: 'application/zip' });
  }

  window.SCS_ZIP = { create };
})();

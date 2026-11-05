import { openLocalDatabase } from './storage';
import type { UploadRecord } from './uploads';
import { readBlobBytes } from './files';

export async function exportLocalBackup(owner: string): Promise<Blob> {
  const db = await openLocalDatabase();
  let state, migrationBackup, settings, truckSheet, uploads: UploadRecord[];
  try {
    const tx = db.transaction(['state', 'uploads', 'driveSettings'], 'readonly');
    [state, migrationBackup, settings, truckSheet, uploads] = await Promise.all([
      tx.objectStore('state').get(owner),
      tx.objectStore('state').get(['phase1-backup', owner]),
      tx.objectStore('driveSettings').get(owner),
      tx.objectStore('driveSettings').get(`truck-sheet:${owner}`),
      tx
        .objectStore('uploads')
        .getAll()
        .then((rows: UploadRecord[]) => rows.filter((row) => row.owner === owner)),
    ]);
    await tx.done;
  } finally {
    db.close();
  }
  const files = await Promise.all(
    uploads!.map(async ({ blob, ...record }) => {
      let base64: string | null = null;
      if (blob) {
        const bytes = new Uint8Array(await readBlobBytes(blob));
        const chunks: string[] = [];
        for (let i = 0; i < bytes.length; i += 8192)
          chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
        base64 = btoa(chunks.join(''));
      }
      return { ...record, blobBase64: base64 };
    }),
  );
  return new Blob(
    [
      JSON.stringify({
        format: 'construction-ops-backup',
        version: 1,
        owner,
        exportedAt: new Date().toISOString(),
        state: state ?? null,
        migrationBackup: migrationBackup ?? null,
        driveSettings: settings ?? null,
        truckSheet: truckSheet ?? null,
        uploads: files,
      }),
    ],
    { type: 'application/json' },
  );
}

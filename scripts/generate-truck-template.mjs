import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { createTruckWorkbook } = await server.ssrLoadModule('/src/truckExcel.ts');
  const blob = await createTruckWorkbook([], [], true);
  await mkdir('public/templates', { recursive: true });
  await writeFile(
    'public/templates/trucks-import-template.xlsx',
    Buffer.from(await blob.arrayBuffer()),
  );
  console.log('Generated public/templates/trucks-import-template.xlsx');
} finally {
  await server.close();
}

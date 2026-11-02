export async function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(Error('อ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์อีกครั้ง'));
    reader.readAsArrayBuffer(blob);
  });
}

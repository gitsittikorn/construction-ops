export function withDeadline<T>(
  operation: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(message)), milliseconds);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
export function connectionMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'permission-denied')
    return 'Firestore ไม่อนุญาต กรุณาตรวจ Rules ล่าสุดและ admins/{UID} ที่มี enabled: true';
  if (code === 'unavailable')
    return 'เชื่อมต่อ Firestore ไม่ได้ ไฟล์ยังอยู่ในเครื่อง กรุณาลองใหม่เมื่อออนไลน์';
  return error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

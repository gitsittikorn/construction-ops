import { useState } from 'react';
import SearchableSelect from './SearchableSelect';
import type { Master } from './models';

/**
 * Driver details inside the truck form, so one window edits both. Phone and nickname are shared:
 * they are saved to the truck and to its driver.
 */
export default function TruckDriverFields({
  masters,
  truck,
}: {
  masters: Master[];
  truck: Master | null;
}) {
  const find = (id: string) => masters.find((item) => item.kind === 'driver' && item.id === id);
  const current = find(truck?.driverId ?? '');
  const [values, setValues] = useState({
    driverId: truck?.driverId ?? '',
    name: current?.name ?? '',
    phone: truck?.phone || current?.phone || '',
    nickname: truck?.nickname || current?.nickname || '',
  });
  const set = (change: Partial<typeof values>) => setValues((all) => ({ ...all, ...change }));
  function choose(driverId: string) {
    const driver = find(driverId);
    // Another person brings their own details; the previous driver's phone must not move over.
    if (driver)
      set({
        driverId,
        name: driver.name,
        phone: driver.phone ?? '',
        nickname: driver.nickname ?? '',
      });
    else set({ driverId, name: '' });
  }
  return (
    <>
      <label className="field">
        <span>คนขับประจำรถ</span>
        <SearchableSelect
          name="driverId"
          aria-label="คนขับประจำรถ"
          value={values.driverId}
          onChange={(event) => choose(event.target.value)}
        >
          <option value="">ยังไม่ผูกคนขับ / เพิ่มคนขับใหม่ด้านล่าง</option>
          {masters
            .filter(
              (item) => item.kind === 'driver' && (item.active || truck?.driverId === item.id),
            )
            .map((driver) => {
              const assigned = masters.find(
                (item) =>
                  item.kind === 'truck' && item.id !== truck?.id && item.driverId === driver.id,
              );
              return (
                <option
                  key={driver.id}
                  value={driver.id}
                  disabled={Boolean(assigned)}
                  data-search={[driver.nickname, driver.phone, driver.detail].join(' ')}
                >
                  {driver.name}
                  {assigned ? ` (รถ ${assigned.name} · ต้องยกเลิกการผูกเดิมก่อน)` : ''}
                  {driver.active ? '' : ' (ปิดใช้งาน)'}
                </option>
              );
            })}
        </SearchableSelect>
      </label>
      {values.driverId ? (
        <label className="field">
          <span>ชื่อคนขับ</span>
          <input
            name="driverName"
            aria-label="ชื่อคนขับ"
            required
            maxLength={200}
            value={values.name}
            onChange={(event) => set({ name: event.target.value })}
          />
          <small>แก้ชื่อตรงนี้จะแก้ข้อมูลคนขับคนนี้ด้วย</small>
        </label>
      ) : (
        <label className="field">
          <span>ชื่อคนขับใหม่ (ถ้ายังไม่มีรายชื่อ)</span>
          <input
            name="newDriverName"
            aria-label="ชื่อคนขับใหม่ (ถ้ายังไม่มีรายชื่อ)"
            maxLength={200}
            value={values.name}
            onChange={(event) => set({ name: event.target.value })}
          />
          <small>บันทึกพร้อมรถในครั้งเดียว</small>
        </label>
      )}
      <label className="field">
        <span>เบอร์โทร</span>
        <input
          name="phone"
          type="tel"
          value={values.phone}
          onChange={(event) => set({ phone: event.target.value })}
        />
      </label>
      <label className="field">
        <span>ชื่อเล่น</span>
        <input
          name="nickname"
          value={values.nickname}
          onChange={(event) => set({ nickname: event.target.value })}
        />
      </label>
    </>
  );
}

import { useState } from 'react';
import { normalizeName } from './masterData';
import NicknameField, { followName } from './NicknameField';
import type { Master } from './models';

/**
 * One driver name inside the truck form. Existing drivers are offered while typing; an edited name
 * either renames the linked driver or, when chosen, creates another person so that old trips keep
 * showing who really drove. Phone and nickname are saved to the truck and its driver.
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
    driverId: current?.id ?? '',
    name: current?.name ?? '',
    phone: truck?.phone || current?.phone || '',
    nickname: truck?.nickname || current?.nickname || '',
    anotherPerson: false,
  });
  const set = (change: Partial<typeof values>) => setValues((all) => ({ ...all, ...change }));
  const base = find(values.driverId);
  const typed = normalizeName(values.name);
  const changed = Boolean(base) && typed !== normalizeName(base!.name);
  const assignedTo = (id: string) =>
    masters.find((item) => item.kind === 'truck' && item.id !== truck?.id && item.driverId === id);
  const matches =
    typed && (!base || changed)
      ? masters.filter(
          (item) =>
            item.kind === 'driver' &&
            item.active &&
            item.id !== values.driverId &&
            [item.name, item.nickname ?? '', item.phone ?? ''].some((text) =>
              normalizeName(text).includes(typed),
            ),
        )
      : [];
  const free = matches.filter((item) => !assignedTo(item.id)).slice(0, 5);
  const busy = matches.find((item) => assignedTo(item.id) && normalizeName(item.name) === typed);
  const linked = typed && base && !values.anotherPerson ? base.id : '';
  const describe = (driver: Master) => [driver.name, driver.phone].filter(Boolean).join(' · ');
  return (
    <>
      <div className="field">
        <label htmlFor="truck-driver-name">ชื่อคนขับ</label>
        <input
          id="truck-driver-name"
          name={linked ? 'driverName' : 'newDriverName'}
          maxLength={200}
          autoComplete="off"
          value={values.name}
          onChange={(event) =>
            set({
              name: event.target.value,
              nickname: followName(values.nickname, values.name, event.target.value),
            })
          }
        />
        <input type="hidden" name="driverId" value={linked} />
        <small>เว้นว่างเมื่อรถยังไม่มีคนขับ</small>
        {free.length > 0 && (
          <div className="chips" role="group" aria-label="คนขับเดิมที่ยังว่าง">
            {free.map((driver) => (
              <button
                type="button"
                key={driver.id}
                onClick={() =>
                  // The chosen person brings their own details.
                  set({
                    driverId: driver.id,
                    name: driver.name,
                    phone: driver.phone ?? '',
                    nickname: driver.nickname ?? '',
                    anotherPerson: false,
                  })
                }
              >
                ใช้คนขับเดิม: {describe(driver)}
              </button>
            ))}
          </div>
        )}
        {busy && (
          <small role="note">
            {describe(busy)} ประจำรถ {assignedTo(busy.id)!.name} อยู่แล้ว ต้องยกเลิกการผูกเดิมก่อน
          </small>
        )}
      </div>
      {changed && typed && (
        <fieldset className="driver-change">
          <legend>ชื่อต่างจากเดิม ({base!.name})</legend>
          {[
            [false, 'แก้ชื่อคนขับคนเดิม'],
            [true, 'เป็นคนละคน (เพิ่มคนขับใหม่)'],
          ].map(([another, title]) => (
            <label className="checkbox-label" key={String(title)}>
              <input
                type="radio"
                name="driverChange"
                checked={values.anotherPerson === another}
                onChange={() => set({ anotherPerson: Boolean(another) })}
              />
              {title}
            </label>
          ))}
        </fieldset>
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
      <NicknameField
        value={values.nickname}
        name={values.name}
        onChange={(nickname) => set({ nickname })}
      />
    </>
  );
}

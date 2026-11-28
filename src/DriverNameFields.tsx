import { useState } from 'react';
import NicknameField, { followName } from './NicknameField';
import type { Master } from './models';

/** Name, phone and nickname of a driver who has no truck row of their own. */
export default function DriverNameFields({ driver }: { driver: Master | null }) {
  const [values, setValues] = useState({
    name: driver?.name ?? '',
    nickname: driver?.nickname ?? '',
  });
  return (
    <>
      <label className="field">
        <span>ชื่อ</span>
        <input
          name="name"
          required
          value={values.name}
          onChange={(event) =>
            setValues({
              name: event.target.value,
              nickname: followName(values.nickname, values.name, event.target.value),
            })
          }
        />
      </label>
      <label className="field">
        <span>เบอร์โทร</span>
        <input name="phone" type="tel" defaultValue={driver?.phone ?? ''} />
      </label>
      <NicknameField
        value={values.nickname}
        name={values.name}
        onChange={(nickname) => setValues((all) => ({ ...all, nickname }))}
      />
    </>
  );
}

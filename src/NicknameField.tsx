import { useState } from 'react';

/** A nickname equal to the name follows it when the name is edited. */
export const followName = (nickname: string, before: string, after: string) =>
  nickname && nickname === before ? after : nickname;

/** Usually the same as the name, so it stays folded away until it differs or is asked for. */
export default function NicknameField({
  value,
  name,
  onChange,
}: {
  value: string;
  name: string;
  onChange: (value: string) => void;
}) {
  const [openedAtStart] = useState(Boolean(value) && value !== name);
  return (
    <details className="nickname-field" open={openedAtStart || undefined}>
      <summary>ชื่อเล่น (กรอกเมื่อต่างจากชื่อ)</summary>
      <label className="field">
        <span>ชื่อเล่น</span>
        <input name="nickname" value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
    </details>
  );
}

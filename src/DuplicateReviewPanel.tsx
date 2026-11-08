import { useEffect, useMemo, useRef, useState } from 'react';
import type { Data } from './models';
import { connectionMessage } from './async';
import {
  duplicateCandidates,
  loadDuplicateReviews,
  saveDuplicateReview,
  type DuplicateReview,
} from './duplicateReview';

export default function DuplicateReviewPanel({
  owner,
  data,
  onOpen,
}: {
  owner: string;
  data: Data;
  onOpen: (id: string) => void;
}) {
  const candidates = useMemo(() => duplicateCandidates(data), [data]);
  const [reviews, setReviews] = useState<DuplicateReview[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const mounted = useRef(false),
    locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const load = () =>
      void loadDuplicateReviews(owner)
        .then((value) => {
          if (mounted.current) setReviews(value);
        })
        .catch((error) => {
          if (mounted.current) setError(connectionMessage(error));
        });
    load();
    window.addEventListener('focus', load);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', load);
    };
  }, [owner]);
  return (
    <section className="panel padded" aria-label="ตรวจเที่ยวที่อาจซ้ำ">
      <h2>ตรวจเที่ยวที่อาจซ้ำ</h2>
      <p>
        ตรวจเฉพาะเที่ยวรถแบบเดิมที่รถ โครงการ วัน เวลา และรายละเอียดตรงกัน
        เวลาเดียวกันอาจเป็นงานคนละเที่ยวได้ ระบบไม่ลบหรือยกเลิกอัตโนมัติ
        และไม่นับเที่ยวที่เพิ่มเป็นชุดในงานรายวันเป็นรายการซ้ำ
      </p>
      <p>
        ผลตรวจเก็บเฉพาะบัญชีและเบราว์เซอร์นี้ · พบ {candidates.length} กลุ่ม · รอตรวจ{' '}
        {
          candidates.filter(
            (candidate) => !reviews.some((review) => review.fingerprint === candidate.fingerprint),
          ).length
        }{' '}
        กลุ่ม
      </p>
      <label className="field">
        ค้นหาเที่ยวที่อาจซ้ำ
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="โครงการ ทะเบียน วันที่"
        />
      </label>
      {candidates
        .filter(({ trips }) => {
          const trip = trips[0];
          return [
            data.projects.find((p) => p.id === trip.projectId)?.name,
            data.masters.find((m) => m.id === trip.truckId)?.name,
            trip.date,
            trip.time,
          ]
            .join(' ')
            .toLowerCase()
            .includes(query.trim().toLowerCase());
        })
        .map((candidate) => {
          const trip = candidate.trips[0];
          const review = reviews
            .filter((value) => value.fingerprint === candidate.fingerprint)
            .at(-1);
          return (
            <article key={candidate.fingerprint} className="panel padded">
              <h3>
                {data.projects.find((p) => p.id === trip.projectId)?.name ?? trip.projectId} ·{' '}
                {data.masters.find((m) => m.id === trip.truckId)?.name ?? trip.truckId} ·{' '}
                {trip.date} {trip.time}
              </h3>
              <p>{candidate.trips.length} เที่ยวที่ควรตรวจ</p>
              {candidate.trips.map((item) => (
                <button type="button" key={item.id} onClick={() => onOpen(item.id)}>
                  เปิดเที่ยว {item.id}
                </button>
              ))}
              {review && (
                <p role="status">
                  {review.decision === 'distinct' ? 'ยืนยันว่าเป็นคนละเที่ยว' : 'ต้องตรวจแก้ไข'} ·{' '}
                  {review.reason} · {review.at}
                </p>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (locked.current) return;
                  const values = new FormData(event.currentTarget);
                  locked.current = true;
                  setBusy(true);
                  setError('');
                  void saveDuplicateReview(
                    owner,
                    candidate,
                    values.get('decision') as DuplicateReview['decision'],
                    String(values.get('reason') ?? ''),
                  )
                    .then((next) => {
                      if (mounted.current) setReviews(next);
                    })
                    .catch((error) => {
                      if (mounted.current) setError(connectionMessage(error));
                    })
                    .finally(() => {
                      locked.current = false;
                      if (mounted.current) setBusy(false);
                    });
                }}
              >
                <label className="field">
                  ผลการตรวจ
                  <select name="decision" aria-label="ผลการตรวจ" required>
                    <option value="distinct">เป็นคนละเที่ยว</option>
                    <option value="needs-correction">ต้องตรวจแก้ไข</option>
                  </select>
                </label>
                <label className="field">
                  เหตุผลตรวจเที่ยวซ้ำ
                  <input name="reason" required maxLength={500} />
                </label>
                <button disabled={busy}>บันทึกผลตรวจเที่ยวซ้ำ</button>
              </form>
            </article>
          );
        })}
      {!candidates.length && <p>ไม่พบเที่ยวแบบเดิมที่เข้าเกณฑ์ควรตรวจซ้ำ</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

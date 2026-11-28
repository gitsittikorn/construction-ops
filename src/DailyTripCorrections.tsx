import SearchableSelect from './SearchableSelect';
import type { Master } from './models';
import type { DailySession } from './workspaceModels';
import type { DailyFormDraft } from './dailyDrafts';
import { activeDailyTrips } from './dailyTrips';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export default function DailyTripCorrections({
  session,
  masters,
  draft,
  onDraft,
  onSave,
  busy,
  canRemove = false,
  onRemove,
}: {
  session: DailySession;
  masters: Master[];
  draft?: DailyFormDraft;
  onDraft: (draft: DailyFormDraft) => void;
  onSave: () => void;
  busy: boolean;
  canRemove?: boolean;
  onRemove?: (rowId: string, tripId: string, version: number, reason: string) => Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);
  const values = draft?.values ?? {};
  const name = (id: string) => masters.find((m) => m.id === id)?.name ?? id;
  const field = (key: string, value: string) =>
    onDraft({ ...draft!, values: { ...values, [key]: value } });
  return (
    <details className="panel padded">
      <summary>แก้ไขเที่ยวรายรายการพร้อมเหตุผล</summary>
      <label>
        เที่ยวที่ต้องแก้ไข
        <SearchableSelect
          aria-label="เที่ยวที่ต้องแก้ไข"
          value={values.tripId ?? ''}
          disabled={busy || session.body.state === 'closed'}
          onChange={(e) => {
            for (const row of session.body.rows) {
              const trip = activeDailyTrips(row).find((t) => t.id === e.target.value);
              if (trip)
                onDraft({
                  id: crypto.randomUUID(),
                  version: session.body.version,
                  values: {
                    rowId: row.id,
                    tripId: trip.id,
                    capacity: String(trip.capacity),
                    driverId: trip.driverId,
                    sourceId: trip.sourceId,
                    soilType: trip.soilType,
                    reason: '',
                  },
                });
            }
          }}
        >
          <option value="">เลือกเที่ยว</option>
          {session.body.rows.flatMap((row) =>
            activeDailyTrips(row).map((trip, index) => (
              <option key={trip.id} value={trip.id}>
                {name(row.truckId)} · เที่ยว {index + 1} · {trip.capacity} m³ · {trip.id}
              </option>
            )),
          )}
        </SearchableSelect>
      </label>
      {values.tripId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <fieldset disabled={busy || session.body.state === 'closed'} className="form-grid">
            <label>
              ความจุเที่ยวที่แก้ไข
              <input
                aria-label="ความจุเที่ยวที่แก้ไข"
                type="number"
                min="0.001"
                step="any"
                required
                value={values.capacity}
                onChange={(e) => field('capacity', e.target.value)}
              />
            </label>
            {(
              [
                ['driverId', 'driver', 'คนขับเที่ยวที่แก้ไข'],
                ['sourceId', 'source', 'แหล่งดินเที่ยวที่แก้ไข'],
              ] as const
            ).map(([key, kind, label]) => (
              <label key={key}>
                {label}
                <SearchableSelect
                  aria-label={label}
                  value={values[key]}
                  onChange={(e) => field(key, e.target.value)}
                >
                  <option value="">ไม่ระบุ</option>
                  {masters
                    .filter((m) => m.kind === kind && (m.active || m.id === values[key]))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {!m.active ? ' (ปิดใช้งาน)' : ''}
                      </option>
                    ))}
                </SearchableSelect>
              </label>
            ))}
            <label>
              ชนิดดินเที่ยวที่แก้ไข
              <SearchableSelect
                aria-label="ชนิดดินเที่ยวที่แก้ไข"
                value={values.soilType}
                onChange={(e) => field('soilType', e.target.value)}
              >
                <option value="">ไม่ระบุ</option>
                {masters
                  .filter((m) => m.kind === 'soilType' && (m.active || m.name === values.soilType))
                  .map((m) => (
                    <option key={m.id}>{m.name}</option>
                  ))}
              </SearchableSelect>
            </label>
            <label>
              เหตุผลแก้ไขเที่ยว
              <input
                aria-label="เหตุผลแก้ไขเที่ยว"
                required
                value={values.reason}
                onChange={(e) => field('reason', e.target.value)}
              />
            </label>
            <button type="submit">บันทึกแก้ไขเที่ยว</button>
            {canRemove && onRemove && (
              <button type="button" className="danger-outline" onClick={() => setRemoving(true)}>
                <Trash2 size={15} aria-hidden="true" /> ลบเที่ยวนี้
              </button>
            )}
          </fieldset>
        </form>
      )}
      {removing && values.tripId && onRemove && (
        <ConfirmDialog
          title="ลบเที่ยวนี้"
          message={`เที่ยวความจุ ${values.capacity} m³ ของรถนี้จะไม่นับในยอด โดยเก็บไว้ในประวัติแก้ไข`}
          disabled={!values.reason?.trim()}
          onCancel={() => setRemoving(false)}
          onConfirm={async () => {
            await onRemove(values.rowId, values.tripId, draft!.version ?? -1, values.reason);
            setRemoving(false);
          }}
        >
          <label className="field">
            <span>เหตุผลที่ลบเที่ยว</span>
            <input
              value={values.reason ?? ''}
              onChange={(event) => field('reason', event.target.value)}
            />
          </label>
        </ConfirmDialog>
      )}
    </details>
  );
}

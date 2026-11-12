import SearchableSelect from './SearchableSelect';
import { useEffect, useRef, useState } from 'react';
import type { Data } from './models';
import type { FinanceRate, ProjectExpense, RateSide } from './financeModels';
import {
  addFinanceRate,
  addProjectExpense,
  reverseProjectExpense,
  financeRecords,
  financeVersion,
  financeSummary,
  parseBaht,
  baht,
} from './finance';
import { workDate, csv } from './domain';
import { downloadBlob } from './reports';
import { connectionMessage } from './async';
const sideLabels = { revenue: 'รายรับ', truck: 'ค่ารถ', driver: 'ค่าคนขับ' };
const categoryLabels = { fuel: 'น้ำมัน', repair: 'ซ่อมบำรุง', other: 'อื่น ๆ' };
export default function FinancePanel({
  owner,
  data,
  defaultProject = '',
  onChange,
}: {
  owner: string;
  data: Data;
  defaultProject?: string;
  onChange: (make: (previous: Data) => Data) => Promise<void>;
}) {
  const [project, setProject] = useState(
    defaultProject ||
      data.projects.find((p) => p.status === 'active')?.id ||
      data.projects[0]?.id ||
      '',
  );
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [side, setSide] = useState<RateSide>('revenue');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const active = useRef(false),
    locked = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const records = financeRecords(data, project),
    version = financeVersion(data, project),
    canEdit = data.projects.some((p) => p.id === project && p.status === 'active');
  const rates = records.flatMap((record) =>
      record.body.kind === 'rate' ? [record.body.entry] : [],
    ),
    expenses = records.flatMap((record) =>
      record.body.kind === 'expense' ? [record.body.entry] : [],
    );
  const reversed = new Set(expenses.map((entry) => entry.reversesId));
  const name = (id: string) => data.masters.find((m) => m.id === id)?.name || id || 'ไม่ระบุ';
  let result: ReturnType<typeof financeSummary> | undefined,
    problem = '';
  try {
    if (project) result = financeSummary(data, project, from, to);
  } catch (error) {
    problem = connectionMessage(error);
  }
  async function run(make: (previous: Data) => Data, form?: HTMLFormElement) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onChange(make);
      if (active.current) {
        form?.reset();
        setNotice('บันทึกการเงินในเครื่องแล้ว รอซิงก์ตามสถานะ Cloud');
      }
    } catch (error) {
      if (active.current) setError(connectionMessage(error));
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  function table() {
    return [
      [
        'วันที่',
        'รถ',
        'คนขับ',
        'ที่มา',
        'เที่ยว',
        'ปริมาตร m³',
        'รายรับประมาณการ บาท',
        'ค่ารถประมาณการ บาท',
        'ค่าคนขับประมาณการ บาท',
        'ยืนยันเที่ยว',
        'เรตรายรับ',
        'เรตค่ารถ',
        'เรตค่าคนขับ',
      ],
      ...(result?.rows ?? []).map((item) => [
        item.row.date,
        name(item.row.truck),
        name(item.row.driver),
        item.row.origin,
        item.row.trips,
        item.row.volume ?? 'ไม่ทราบ',
        ...(['revenue', 'truck', 'driver'] as const).map((key) =>
          item.amounts[key] === null ? 'ไม่ทราบ' : baht(item.amounts[key]),
        ),
        item.row.verified ? 'ยืนยัน' : 'รอตรวจ',
        item.rates.revenue?.id ?? '',
        item.rates.truck?.id ?? '',
        item.rates.driver?.id ?? '',
      ]),
    ];
  }
  return (
    <section className="finance-panel content-stack" aria-label="การเงินโครงการ">
      <h2>เรตราคา ต้นทุน และประมาณการ</h2>
      <p>
        คำนวณใหม่ตามเที่ยวและเรตที่มีผลในวันที่ทำงาน
        ยอดนี้เป็นประมาณการก่อนภาษีและค่าใช้จ่ายที่ยังไม่บันทึก ไม่ใช่บัญชีจ่ายเงินจริง
        เที่ยวแบบเดิมกับงานรายวันแสดงแยกที่มา กรุณาตรวจว่าไม่ได้บันทึกงานเดียวกันทั้งสองแบบ
      </p>
      <div className="operations-filters">
        <label>
          โครงการการเงิน
          <SearchableSelect
            aria-label="โครงการการเงิน"
            value={project}
            disabled={busy}
            onChange={(event) => {
              setProject(event.target.value);
              setError('');
              setNotice('');
            }}
          >
            <option value="">เลือกโครงการ</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.status === 'active' ? '' : ' (อ่านอย่างเดียว)'}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <label>
          การเงินตั้งแต่วันที่
          <input
            aria-label="การเงินตั้งแต่วันที่"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          การเงินถึงวันที่
          <input
            aria-label="การเงินถึงวันที่"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
      </div>
      {!project && <p>เพิ่มหรือเลือกโครงการก่อนใช้งานการเงิน</p>}
      {(error || problem) && <p role="alert">{error || problem}</p>}
      {notice && <p role="status">{notice}</p>}
      {result && (
        <section className="panel padded" aria-label="ยอดประมาณการโครงการ">
          <h3>
            {result.complete
              ? 'ประมาณการจากข้อมูลที่ระบุครบ'
              : 'ประมาณการบางส่วน ยังมีเที่ยวขาดเรตหรือความจุ'}
          </h3>
          {(['revenue', 'truck', 'driver'] as const).map((key) => (
            <p key={key}>
              {sideLabels[key]}ที่คำนวณได้ {baht(result!.totals[key])} บาท · จากเที่ยวที่ยืนยัน{' '}
              {baht(result!.verified[key])} บาท · ยังคิดเงินไม่ได้ {result!.unknown[key]} เที่ยว
            </p>
          ))}
          <p>ค่าใช้จ่ายสุทธิ {baht(result.expenseTotal)} บาท</p>
          <p>
            ส่วนต่างที่คำนวณได้ {baht(result.netKnown)} บาท{' '}
            {result.complete ? '(ยังเป็นประมาณการ)' : '(ข้อมูลไม่ครบ ยังสรุปกำไรทั้งหมดไม่ได้)'}
          </p>
          <p>
            เรตเฉพาะรถหรือคนขับมีลำดับเหนือเรตทั่วไปที่ใช้ได้ในวันนั้น เรต m³
            ใช้ความจุต่อเที่ยวที่บันทึกไว้ ปัดเป็นสตางค์ต่อเที่ยวก่อนรวม
            ไม่เดาความจุหรือแทนเรตที่ขาดด้วยศูนย์
          </p>
        </section>
      )}
      {project && (
        <div className="settings-grid" key={project}>
          <section className="panel padded">
            <h3>เพิ่มหรือแก้เรตราคา</h3>
            <p>
              เลือกประเภท คู่สัญญา และวันเริ่มใช้เดิมเพื่อสร้างฉบับแก้ไข
              เก็บทุกฉบับไว้และคำนวณประมาณการย้อนหลังใหม่ตามฉบับล่าสุด ต้องระบุเหตุผลทุกครั้ง
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget,
                  values = new FormData(form);
                try {
                  const input = {
                    side,
                    partyId: String(values.get('partyId') ?? ''),
                    effectiveFrom: String(values.get('effectiveFrom')),
                    unit: String(values.get('unit')) as FinanceRate['unit'],
                    satang: parseBaht(String(values.get('amount'))),
                    reason: String(values.get('reason')),
                  };
                  void run(
                    (previous) => addFinanceRate(previous, project, version, input, owner),
                    form,
                  );
                } catch (error) {
                  setError(connectionMessage(error));
                }
              }}
            >
              <fieldset disabled={busy || !canEdit}>
                <label className="field">
                  ประเภทเรต
                  <SearchableSelect
                    aria-label="ประเภทเรต"
                    value={side}
                    onChange={(event) => setSide(event.target.value as RateSide)}
                  >
                    {Object.entries(sideLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </SearchableSelect>
                </label>
                {side !== 'revenue' && (
                  <label className="field">
                    รถหรือคนขับสำหรับเรต
                    <SearchableSelect key={side} name="partyId" aria-label="รถหรือคนขับสำหรับเรต">
                      <option value="">เรตทั่วไป</option>
                      {data.masters
                        .filter((m) => m.kind === side)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </SearchableSelect>
                  </label>
                )}
                <label className="field">
                  วันที่เริ่มใช้เรต
                  <input
                    name="effectiveFrom"
                    aria-label="วันที่เริ่มใช้เรต"
                    type="date"
                    required
                    defaultValue={workDate()}
                  />
                </label>
                <label className="field">
                  หน่วยราคา
                  <SearchableSelect name="unit" aria-label="หน่วยราคา">
                    <option value="trip">บาทต่อเที่ยว</option>
                    <option value="m3">บาทต่อ m³</option>
                  </SearchableSelect>
                </label>
                <label className="field">
                  ราคา บาท
                  <input
                    name="amount"
                    aria-label="ราคา บาท"
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="0.00"
                  />
                </label>
                <label className="field">
                  เหตุผลเรตราคา
                  <input name="reason" aria-label="เหตุผลเรตราคา" required maxLength={500} />
                </label>
                <button className="primary">บันทึกเรตราคา</button>
              </fieldset>
            </form>
          </section>
          <section className="panel padded">
            <h3>เพิ่มค่าใช้จ่าย</h3>
            <p>
              บันทึกน้ำมัน ซ่อม และค่าใช้จ่ายอื่น
              การแก้ยอดใช้กลับรายการพร้อมเหตุผลแล้วเพิ่มฉบับถูกต้อง ประวัติต้นฉบับยังอยู่
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget,
                  values = new FormData(form);
                try {
                  const input = {
                    date: String(values.get('date')),
                    category: String(values.get('category')) as ProjectExpense['category'],
                    truckId: String(values.get('truckId')),
                    satang: parseBaht(String(values.get('amount'))),
                    reason: String(values.get('reason')),
                  };
                  void run(
                    (previous) => addProjectExpense(previous, project, version, input, owner),
                    form,
                  );
                } catch (error) {
                  setError(connectionMessage(error));
                }
              }}
            >
              <fieldset disabled={busy || !canEdit}>
                <label className="field">
                  วันที่ค่าใช้จ่าย
                  <input
                    name="date"
                    aria-label="วันที่ค่าใช้จ่าย"
                    type="date"
                    required
                    defaultValue={workDate()}
                  />
                </label>
                <label className="field">
                  หมวดค่าใช้จ่าย
                  <SearchableSelect name="category" aria-label="หมวดค่าใช้จ่าย">
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </SearchableSelect>
                </label>
                <label className="field">
                  รถของค่าใช้จ่าย
                  <SearchableSelect name="truckId" aria-label="รถของค่าใช้จ่าย">
                    <option value="">ค่าใช้จ่ายโครงการ</option>
                    {data.masters
                      .filter((m) => m.kind === 'truck')
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </SearchableSelect>
                </label>
                <label className="field">
                  จำนวนค่าใช้จ่าย บาท
                  <input
                    name="amount"
                    aria-label="จำนวนค่าใช้จ่าย บาท"
                    required
                    inputMode="decimal"
                    type="text"
                  />
                </label>
                <label className="field">
                  รายละเอียดค่าใช้จ่าย
                  <input name="reason" aria-label="รายละเอียดค่าใช้จ่าย" required maxLength={500} />
                </label>
                <button className="primary">บันทึกค่าใช้จ่าย</button>
              </fieldset>
            </form>
          </section>
        </div>
      )}
      {result &&
        (['truck', 'driver'] as const).map((key) => (
          <section key={key} className="panel padded" aria-label={`สรุป${sideLabels[key]}`}>
            <h3>สรุป{sideLabels[key]}โดยประมาณ</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>รายการ</th>
                    <th>ยอดที่คำนวณได้ บาท</th>
                    <th>เที่ยวที่ยังคิดเงินไม่ได้</th>
                  </tr>
                </thead>
                <tbody>
                  {[...result!.parties[key]].map(([id, total]) => (
                    <tr key={id}>
                      <td>{name(id)}</td>
                      <td>{baht(total.known)}</td>
                      <td>{total.unknownTrips}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      <details className="panel padded">
        <summary>ประวัติเรตราคา {rates.length} ฉบับ</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>รถ/คนขับ</th>
                <th>เริ่มใช้</th>
                <th>ราคา บาท</th>
                <th>หน่วย</th>
                <th>ฉบับ</th>
                <th>เหตุผล</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) => (
                <tr key={rate.id}>
                  <td>{sideLabels[rate.side]}</td>
                  <td>{rate.partyId ? name(rate.partyId) : 'ทั่วไป'}</td>
                  <td>{rate.effectiveFrom}</td>
                  <td>{baht(rate.satang)}</td>
                  <td>{rate.unit}</td>
                  <td>{rate.revision}</td>
                  <td>{rate.reason}</td>
                  <td>{rate.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <section className="panel padded" aria-label="ประวัติค่าใช้จ่าย">
        <h3>ประวัติค่าใช้จ่าย</h3>
        <p>แสดงตามช่วงวันที่ที่เลือก รวมรายการกลับที่อ้างวันที่เดิม</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>หมวด</th>
                <th>รถ</th>
                <th>บาท</th>
                <th>รายละเอียด</th>
                <th>สถานะ/กลับรายการ</th>
              </tr>
            </thead>
            <tbody>
              {(result?.expenses ?? []).map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.date}</td>
                  <td>{categoryLabels[entry.category]}</td>
                  <td>{name(entry.truckId)}</td>
                  <td>
                    {entry.reversesId ? '-' : ''}
                    {baht(entry.satang)}
                  </td>
                  <td>{entry.reason}</td>
                  <td>
                    {entry.reversesId ? (
                      'รายการกลับ'
                    ) : reversed.has(entry.id) ? (
                      'กลับรายการแล้ว'
                    ) : (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = event.currentTarget,
                            values = new FormData(form);
                          void run(
                            (previous) =>
                              reverseProjectExpense(
                                previous,
                                project,
                                version,
                                entry.id,
                                String(values.get('reason')),
                                owner,
                              ),
                            form,
                          );
                        }}
                      >
                        <input
                          aria-label={`เหตุผลกลับรายการ ${entry.id}`}
                          name="reason"
                          required
                          maxLength={500}
                          placeholder="เหตุผลกลับรายการ"
                          disabled={busy || !canEdit}
                        />
                        <button className="secondary" disabled={busy || !canEdit}>
                          กลับรายการค่าใช้จ่าย
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {result && (
        <details className="panel padded">
          <summary>รายละเอียดและเรตที่ใช้คำนวณ {result.rows.length} แถว</summary>
          <button
            onClick={() =>
              downloadBlob(
                new Blob([csv(table().map((row) => row.map(String)))], {
                  type: 'text/csv;charset=utf-8',
                }),
                'finance-estimate.csv',
              )
            }
          >
            ส่งออกประมาณการ CSV
          </button>
          <p>
            ตารางแสดง 100 แถวแรก ส่งออก CSV เพื่อดูทั้งหมด รวมค่ารถและค่าคนขับประมาณการ
            ค่าใช้จ่ายดูในประวัติข้างต้น
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {table()[0].map((cell) => (
                    <th key={cell}>{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table()
                  .slice(1, 101)
                  .map((row, index) => (
                    <tr key={result!.rows[index].row.id}>
                      {row.map((cell, index) => (
                        <td key={index}>{cell}</td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

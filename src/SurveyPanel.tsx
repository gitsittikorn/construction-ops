import SearchableSelect from './SearchableSelect';
import { managesBusiness } from './workspaceIdentity';
import { useMemo, useState, useRef } from 'react';
import { canonical } from './syncModel';
import { readSurveyImport, surveyCsv } from './surveyImport';
import { surveyContours } from './surveyContours';
import type { Data } from './models';
import type { SurveyBody, SurveyRecord, LevelObservation } from './workspaceModels';
import {
  calculateSurvey,
  gridPoints,
  designElevation,
  levelSurvey,
  saveSurvey,
  surveyTable,
} from './surveying';
import { downloadBlob, printableReport, printDocument } from './reports';

const initial: SurveyBody = {
  benchmark: 'BM1',
  elevation: 0,
  datum: 'ระดับอ้างอิงโครงการ',
  notes: '',
  observations: [],
  width: 20,
  length: 20,
  spacingX: 10,
  spacingY: 10,
  design: 'uniform',
  designLevel: 1,
  slopeX: 0,
  slopeY: 0,
  allowance: 30,
  cutSwell: 0,
  points: [],
};
export default function SurveyPanel({
  data,
  owner,
  defaultProject = '',
  onChange,
}: {
  data: Data;
  owner: string;
  defaultProject?: string;
  onChange: (change: (data: Data) => Data) => Promise<void>;
}) {
  const [body, setBody] = useState<SurveyBody>(structuredClone(initial)),
    [project, setProject] = useState(defaultProject || data.projects[0]?.id || ''),
    [name, setName] = useState('สำรวจระดับและกริด'),
    [saved, setSaved] = useState<SurveyRecord | null>(null),
    [id, setId] = useState<string>(() => crypto.randomUUID()),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [page, setPage] = useState(0),
    [reading, setReading] = useState<LevelObservation>({ type: 'BS', point: 'BM1', reading: 0 }),
    [pointId, setPointId] = useState('G0-0'),
    [pointLevel, setPointLevel] = useState(0),
    [pointDesign, setPointDesign] = useState(0);
  const result = useMemo(() => {
    try {
      return { value: calculateSurvey(body), error: '' };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [body]);
  const contours = useMemo(() => (result.value ? surveyContours(body) : []), [body, result.value]);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<{
    name: string;
    owner: string;
    baseline: string;
    points: SurveyBody['points'];
  } | null>(null);
  const current = useRef({ owner, body, project, id });
  current.current = { owner, body, project, id };
  async function importPoints(file: File) {
    setImporting(true);
    setPreview(null);
    setError('');
    const baseline = canonical({ owner, body, project, id });
    try {
      const points = await readSurveyImport(file, body);
      if (current.current.owner !== owner || canonical(current.current) !== baseline)
        throw Error('ข้อมูลสำรวจหรือบัญชีเปลี่ยนแล้ว กรุณาเลือกไฟล์ใหม่');
      setPreview({ name: file.name, owner, baseline, points });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setImporting(false);
    }
  }
  let observations: ReturnType<typeof levelSurvey> = [];
  try {
    observations = levelSurvey(body.benchmark, body.elevation, body.observations);
  } catch {}
  const setNumber = (key: keyof SurveyBody, label: string) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        step="any"
        value={Number.isFinite(body[key] as number) ? String(body[key]) : ''}
        onChange={(e) =>
          setBody((b) => ({ ...b, [key]: e.target.value === '' ? NaN : Number(e.target.value) }))
        }
      />
    </label>
  );
  function generate() {
    try {
      const old = new Map(body.points.map((p) => [`${p.x}:${p.y}`, p]));
      setBody({
        ...body,
        points: gridPoints(
          body.width,
          body.length,
          body.spacingX,
          body.spacingY,
          body.elevation,
        ).map((p) => ({
          ...p,
          existing: old.get(`${p.x}:${p.y}`)?.existing ?? p.existing,
          customDesign: old.get(`${p.x}:${p.y}`)?.customDesign ?? body.designLevel,
        })),
      });
      setError('');
      setPage(0);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function addPoint() {
    try {
      const target = gridPoints(
        body.width,
        body.length,
        body.spacingX,
        body.spacingY,
        body.elevation,
      ).find((p) => p.id === pointId);
      if (!target || ![pointLevel, pointDesign].every(Number.isFinite))
        throw Error('ระบุรหัสจุดกริดและระดับที่ถูกต้อง');
      setBody({
        ...body,
        points: [
          ...body.points.filter((p) => p.id !== pointId),
          { ...target, existing: pointLevel, customDesign: pointDesign },
        ],
      });
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const record = (): SurveyRecord => ({
    id,
    recordType: 'survey',
    projectId: project,
    name,
    createdAt: saved?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    body,
  });
  async function save() {
    try {
      const next = record();
      await onChange((data) => saveSurvey(data, next, owner, saved ?? undefined));
      setSaved(structuredClone(next));
      setNotice('บันทึกประวัติสำรวจในเครื่องแล้ว ตรวจสถานะได้ที่เมนูซิงก์และสำรองข้อมูล');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function excel() {
    try {
      const current = record();
      calculateSurvey(body);
      const { default: write } = await import('write-excel-file/universal');
      const tables = [
        { sheet: 'กริด', rows: surveyTable(current) },
        {
          sheet: 'ระดับ',
          rows: [
            ['จุด', 'ชนิด', 'อ่านไม้ m', 'HI m', 'RL m'],
            ...observations.map((o) => [o.point, o.type, o.reading, o.hi, o.rl]),
          ],
        },
        {
          sheet: 'สรุป',
          rows: [
            ['รายการ', 'ค่า'],
            ...Object.entries(calculateSurvey(body)).map(([k, v]) => [k, v]),
            ['BM', body.benchmark],
            ['Datum', body.datum],
            ['Fill allowance %', body.allowance],
            ['Cut swell %', body.cutSwell],
          ],
        },
      ];
      const blob = await write(
        tables.map((t) => ({
          sheet: t.sheet,
          data: t.rows.map((row) =>
            row.map((value) => ({
              value,
              type: typeof value === 'number' ? Number : String,
              format: typeof value === 'number' ? '0.000' : '@',
            })),
          ),
          columns: [
            { width: 30 },
            { width: 24 },
            { width: 24 },
            { width: 24 },
            { width: 24 },
            { width: 24 },
            { width: 24 },
          ],
        })),
      ).toBlob();
      downloadBlob(blob, 'survey-grid.xlsx');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel padded content-stack survey-panel" aria-label="บันทึกสำรวจและกริด">
      <h2>สำรวจ BM / Turning Point / กริดงานดิน</h2>
      <div className="operations-filters">
        <label>
          โครงการสำรวจ
          <SearchableSelect value={project} onChange={(e) => setProject(e.target.value)}>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <label>
          ประวัติงานสำรวจ
          <SearchableSelect
            aria-label="ประวัติงานสำรวจ"
            value={saved?.id ?? ''}
            onChange={(e) => {
              const r = data.workspaces?.find(
                (r) => r.id === e.target.value && r.recordType === 'survey',
              );
              if (r?.recordType === 'survey') {
                setBody(structuredClone(r.body));
                setProject(r.projectId);
                setName(r.name);
                setSaved(structuredClone(r));
                setId(r.id);
                setPage(0);
              }
            }}
          >
            <option value="">งานใหม่</option>
            {data.workspaces
              ?.filter((r) => r.recordType === 'survey')
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.updatedAt}
                </option>
              ))}
          </SearchableSelect>
        </label>
        <button
          onClick={() => {
            setSaved(null);
            setId(crypto.randomUUID());
            setBody(structuredClone(initial));
          }}
        >
          เริ่มงานสำรวจใหม่
        </button>
        <label>
          ชื่องานสำรวจ
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p aria-live="polite">{notice}</p>}
      <div className="form-grid">
        <label>
          ชื่อ BM
          <input
            value={body.benchmark}
            onChange={(e) => setBody({ ...body, benchmark: e.target.value })}
          />
        </label>
        {setNumber('elevation', 'ระดับ BM (m)')}
        <label>
          Datum / ที่มา
          <input value={body.datum} onChange={(e) => setBody({ ...body, datum: e.target.value })} />
        </label>
        <label>
          หมายเหตุสำรวจ
          <input value={body.notes} onChange={(e) => setBody({ ...body, notes: e.target.value })} />
        </label>
        {setNumber('width', 'กว้างแปลง (m)')}
        {setNumber('length', 'ยาวแปลง (m)')}
        {setNumber('spacingX', 'ระยะกริด X (m)')}
        {setNumber('spacingY', 'ระยะกริด Y (m)')}
        <label>
          ผิวออกแบบ
          <SearchableSelect
            aria-label="ผิวออกแบบ"
            value={body.design}
            onChange={(e) => setBody({ ...body, design: e.target.value as SurveyBody['design'] })}
          >
            <option value="uniform">ระดับสม่ำเสมอ</option>
            <option value="slope">ลาดเอียง</option>
            <option value="custom">กำหนดแต่ละจุด</option>
          </SearchableSelect>
        </label>
        {setNumber('designLevel', 'ระดับแบบที่จุดกำเนิด (m)')}
        {setNumber('slopeX', 'ความลาด X (%)')}
        {setNumber('slopeY', 'ความลาด Y (%)')}
        <label>
          ค่าเผื่อขนส่งถม
          <SearchableSelect
            aria-label="ค่าเผื่อขนส่งถม"
            value={[25, 30, 35, 50, 60].includes(body.allowance) ? body.allowance : 'custom'}
            onChange={(e) => {
              if (e.target.value !== 'custom')
                setBody({ ...body, allowance: Number(e.target.value) });
              else setBody({ ...body, allowance: 0 });
            }}
          >
            {[25, 30, 35, 50, 60].map((v) => (
              <option key={v} value={v}>
                {v}%
              </option>
            ))}
            <option value="custom">กำหนดเอง</option>
          </SearchableSelect>
        </label>
        {setNumber('allowance', 'เผื่อขนส่งจากปริมาตรถมแน่น (%)')}
        {setNumber('cutSwell', 'การพองตัวจากปริมาตรตัดเดิม (%)')}
      </div>
      <p>
        HI = RL + BS; RL = HI − IS/FS; เมื่ออ่าน FS ให้ BS ถัดไปอ้างจุด TP เดียวกัน
        ค่าเผื่อขนส่งใช้กับปริมาตรถมแน่น ส่วน swell ใช้กับดินตัด แยกจาก shrinkage และผลทดสอบการบดอัด
      </p>
      <div className="operations-filters">
        <label>
          ชนิดอ่านไม้
          <SearchableSelect
            value={reading.type}
            onChange={(e) =>
              setReading({ ...reading, type: e.target.value as LevelObservation['type'] })
            }
          >
            {['BS', 'IS', 'FS'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </SearchableSelect>
        </label>
        <label>
          ชื่อจุดอ่านไม้
          <input
            value={reading.point}
            onChange={(e) => setReading({ ...reading, point: e.target.value })}
          />
        </label>
        <label>
          อ่านไม้ระดับ (m)
          <input
            type="number"
            step="any"
            min={0}
            value={reading.reading}
            onChange={(e) => setReading({ ...reading, reading: Number(e.target.value) })}
          />
        </label>
        <button
          onClick={() => {
            try {
              const next = [...body.observations, { ...reading }];
              levelSurvey(body.benchmark, body.elevation, next);
              setBody({ ...body, observations: next });
              setError('');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          เพิ่ม BS / IS / FS
        </button>
        <button onClick={() => setBody({ ...body, observations: body.observations.slice(0, -1) })}>
          ย้อนการอ่านไม้ล่าสุด
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>จุด</th>
              <th>ชนิด</th>
              <th>อ่านไม้</th>
              <th>HI</th>
              <th>RL</th>
            </tr>
          </thead>
          <tbody>
            {observations.map((o, i) => (
              <tr key={i}>
                <td>{o.point}</td>
                <td>{o.type}</td>
                <td>{o.reading}</td>
                <td>{o.hi}</td>
                <td>{o.rl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={generate}>สร้าง / ปรับกริดตามขนาดแปลง</button>
      <p>
        นำเข้าพิกัดหน่วยเมตรตามขนาดและระยะกริดปัจจุบัน ใช้ CSV หรือชีต กริด จากไฟล์ที่ส่งออก
        ตรวจตัวอย่างก่อนแทนจุดในแบบร่าง ข้อมูลประวัติเดิมยังไม่เปลี่ยนจนกดบันทึก
      </p>
      <label>
        นำเข้าจุดสำรวจ CSV / Excel
        <input
          type="file"
          accept=".csv,.xlsx"
          disabled={importing}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importPoints(file);
          }}
        />
      </label>
      {preview?.owner === owner && (
        <div role="region" aria-label="ตัวอย่างนำเข้าจุดสำรวจ">
          <p>
            {preview.name} · {preview.points.length} จุด · ระดับเดิม{' '}
            {Math.min(...preview.points.map((point) => point.existing))} ถึง{' '}
            {Math.max(...preview.points.map((point) => point.existing))} m
          </p>
          <button
            onClick={() => {
              if (canonical({ owner, body, project, id }) !== preview.baseline) {
                setError('ข้อมูลสำรวจเปลี่ยนแล้ว กรุณาเลือกไฟล์ใหม่');
                return;
              }
              setBody({ ...body, points: preview.points });
              setPreview(null);
              setPage(0);
              setError('');
              setNotice('นำเข้าจุดในแบบร่างแล้ว กรุณาตรวจผลก่อนบันทึกประวัติ');
            }}
          >
            ยืนยันนำเข้าจุดสำรวจ
          </button>
          <button onClick={() => setPreview(null)}>ยกเลิกนำเข้า</button>
        </div>
      )}
      <button
        onClick={() => {
          try {
            downloadBlob(
              new Blob([surveyCsv(body)], { type: 'text/csv;charset=utf-8' }),
              'survey-grid.csv',
            );
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        ส่งออกสำรวจ CSV
      </button>
      <div className="operations-filters">
        <label>
          รหัสจุดกริด
          <input value={pointId} onChange={(e) => setPointId(e.target.value)} />
        </label>
        <label>
          ระดับเดิมจุด (m)
          <input
            type="number"
            step="any"
            value={pointLevel}
            onChange={(e) => setPointLevel(Number(e.target.value))}
          />
        </label>
        <label>
          ระดับแบบเฉพาะจุด (m)
          <input
            type="number"
            step="any"
            value={pointDesign}
            onChange={(e) => setPointDesign(Number(e.target.value))}
          />
        </label>
        <button onClick={addPoint}>เพิ่ม / แก้จุดกริด</button>
      </div>
      {result.value ? (
        <p aria-live="polite">
          พื้นที่ {result.value.area} m² · ถมแน่น {result.value.fill.toFixed(3)} m³ · ตัดเดิม{' '}
          {result.value.cut.toFixed(3)} m³ · ถมเผื่อขนส่ง {result.value.looseFill.toFixed(3)} m³ ·
          พื้นที่ถม {result.value.fillArea.toFixed(3)} / ตัด {result.value.cutArea.toFixed(3)} m²
        </p>
      ) : (
        <p>{result.error}</p>
      )}
      <p>
        ปริมาตรเดิมเหนือ BM {result.value?.groundVolumeAboveBM.toFixed(3) ?? '—'} m³ · แบบเหนือ BM{' '}
        {result.value?.designVolumeAboveBM.toFixed(3) ?? '—'} m³ · วิธีสามเหลี่ยม linear ตามแนว
        SW–NE ของแต่ละเซลล์ ไม่หักล้าง cut/fill
      </p>
      {!!body.points.length && result.value && (
        <svg
          className="survey-grid"
          viewBox={`-2 -2 ${body.width + 4} ${body.length + 4}`}
          role="img"
          aria-label="กริดระดับเดิม แบบ และตัดถม"
        >
          {contours.map((line, index) => (
            <line
              key={index}
              data-contour-level={line.level}
              x1={line.x1}
              y1={body.length - line.y1}
              x2={line.x2}
              y2={body.length - line.y2}
              stroke="#285b8a"
              strokeWidth={Math.min(body.width, body.length) / 350}
            >
              <title>ระดับเดิมประมาณ {line.level.toFixed(3)} m</title>
            </line>
          ))}
          {body.points.map((p) => (
            <g key={p.id}>
              <circle
                data-point-id={p.id}
                cx={p.x}
                cy={body.length - p.y}
                r={Math.min(body.width, body.length) / 90}
                fill={designElevation(body, p) >= p.existing ? '#168248' : '#bb432b'}
              />
              <title>
                {p.id}: X {p.x}, Y {p.y}, แบบ−เดิม{' '}
                {(designElevation(body, p) - p.existing).toFixed(3)} m
              </title>
              {body.points.length <= 100 && (
                <text
                  x={p.x}
                  y={body.length - p.y}
                  fontSize={Math.min(body.width, body.length) / 45}
                >
                  {p.id}: {p.existing.toFixed(2)}/{designElevation(body, p).toFixed(2)}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      <p>
        กริด 2D: จุดกำเนิดซ้ายล่าง · X บวกไปขวา · Y บวกขึ้นบน · สีเขียวถม/เท่าระดับ สีแดงตัด
        เส้นสีน้ำเงินเป็นชั้นความสูงประมาณจาก linear interpolation ตามสามเหลี่ยม SW–NE
        ไม่ใช่จุดที่สำรวจเพิ่ม กริดเกิน 400 จุดแสดงเฉพาะจุดเพื่อประสิทธิภาพ
      </p>
      {body.design === 'slope' && (
        <p>
          ทิศระดับลด: X {body.slopeX > 0 ? 'ลบ' : body.slopeX < 0 ? 'บวก' : 'คงที่'} / Y{' '}
          {body.slopeY > 0 ? 'ลบ' : body.slopeY < 0 ? 'บวก' : 'คงที่'}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>จุด</th>
              <th>X</th>
              <th>Y</th>
              <th>เดิม</th>
              <th>แบบเฉพาะจุด</th>
              <th>ผลต่างแบบ−เดิม</th>
            </tr>
          </thead>
          <tbody>
            {body.points.slice(page * 100, (page + 1) * 100).map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.x}</td>
                <td>{p.y}</td>
                <td>
                  <input
                    aria-label={`ระดับเดิม ${p.id}`}
                    type="number"
                    step="any"
                    value={p.existing}
                    onChange={(e) =>
                      setBody({
                        ...body,
                        points: body.points.map((v) =>
                          v.id === p.id ? { ...v, existing: Number(e.target.value) } : v,
                        ),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`ระดับแบบ ${p.id}`}
                    type="number"
                    step="any"
                    value={p.customDesign}
                    onChange={(e) =>
                      setBody({
                        ...body,
                        points: body.points.map((v) =>
                          v.id === p.id ? { ...v, customDesign: Number(e.target.value) } : v,
                        ),
                      })
                    }
                  />
                </td>
                <td>{(designElevation(body, p) - p.existing).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button disabled={page === 0} onClick={() => setPage(page - 1)}>
        กริดหน้าก่อน
      </button>
      <button disabled={(page + 1) * 100 >= body.points.length} onClick={() => setPage(page + 1)}>
        กริดหน้าถัดไป
      </button>
      <div className="operations-actions">
        <button
          disabled={!managesBusiness(owner) || !project || !result.value}
          onClick={() => void save()}
        >
          บันทึกประวัติสำรวจ
        </button>
        <button disabled={!result.value} onClick={() => void excel()}>
          ส่งออกสำรวจ Excel
        </button>
        <button
          disabled={!result.value}
          onClick={() => {
            try {
              const value = calculateSurvey(body);
              printDocument(
                printableReport(
                  name,
                  surveyTable(record()),
                  `${body.benchmark} / ${body.datum} · ถม ${value.fill.toFixed(3)} m³ · ตัด ${value.cut.toFixed(3)} m³ · allowance ${body.allowance}% · cut swell ${body.cutSwell}%`,
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          พิมพ์งานดิน PDF
        </button>
      </div>
    </section>
  );
}

import SearchableSelect from './SearchableSelect';
import type { Project } from './models';
const labels: Record<Project['status'], string> = {
  active: 'กำลังดำเนินการ',
  draft: 'ฉบับร่าง',
  completed: 'เสร็จสิ้น',
  archived: 'จัดเก็บแล้ว',
};
export default function ProjectPicker({
  projects,
  value,
  onChange,
  label = 'โครงการ *',
  onManage,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  onManage?: () => void;
}) {
  const available = projects.filter((project) => project.status === 'active');
  const selected = projects.find((project) => project.id === value);
  const needsAction =
    projects.length === 0 ||
    available.length === 0 ||
    Boolean(selected && selected.status !== 'active');
  return (
    <div className="field">
      <label className="field">
        <span>{label}</span>
        <SearchableSelect
          name="projectId"
          aria-label={label}
          required
          value={selected ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">เลือกโครงการ</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id} disabled={project.status !== 'active'}>
              {project.name}
              {project.status === 'active'
                ? ''
                : ` (${labels[project.status] ?? 'สถานะไม่รองรับ'} · เลือกไม่ได้)`}
            </option>
          ))}
        </SearchableSelect>
      </label>
      {needsAction && (
        <div className="project-help" role="status">
          {projects.length === 0
            ? 'ยังไม่มีโครงการในบัญชีและที่อยู่เว็บนี้ กรุณาเพิ่มโครงการก่อน'
            : selected && selected.status !== 'active'
              ? `โครงการที่เลือกมีสถานะ ${labels[selected.status] ?? selected.status} กรุณาเลือกโครงการที่กำลังดำเนินการ`
              : 'ยังไม่มีโครงการที่กำลังดำเนินการ โครงการฉบับร่างต้องเปลี่ยนสถานะก่อนบันทึกเที่ยวรถหรืออัปโหลดเอกสาร'}
          {onManage && (
            <button type="button" className="text-button" onClick={onManage}>
              {projects.length ? 'จัดการสถานะโครงการ' : 'เพิ่มโครงการ'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

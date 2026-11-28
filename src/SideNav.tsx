import { useState } from 'react';
import {
  BarChart3,
  Calculator,
  Database,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Truck,
} from 'lucide-react';
import { extraPages, mainMenu, pageTitles, subTitles } from './navigation';

const icons = {
  record: Truck,
  projects: FolderOpen,
  masters: Database,
  reports: BarChart3,
  settings: Settings,
  overview: LayoutDashboard,
  finance: BarChart3,
  survey: Calculator,
};

export default function SideNav({
  page,
  canManage,
  pending,
  attention,
  onNavigate,
}: {
  page: string;
  canManage: boolean;
  pending: number;
  attention: boolean;
  onNavigate: (page: string) => void;
}) {
  const [extraOpen, setExtraOpen] = useState(false);
  const inExtra = (extraPages as readonly string[]).includes(page);
  const warning = (
    <span
      id="sync-attention"
      className="nav-error-dot"
      role="status"
      aria-label="มีปัญหาการซิงก์หรือข้อมูลที่ต้องตรวจสอบ"
      title="มีปัญหาการซิงก์หรือข้อมูลที่ต้องตรวจสอบ"
    />
  );
  return (
    <nav aria-label="เมนูหลัก">
      {mainMenu.map(({ id, title, pages }) => {
        const Icon = icons[id];
        const open = (pages as readonly string[]).includes(page);
        return (
          <div className="nav-item" key={id}>
            <button
              aria-label={title}
              aria-current={page === id ? 'page' : undefined}
              aria-expanded={pages.length > 1 ? open : undefined}
              aria-describedby={
                id === 'settings' && attention && !open ? 'sync-attention' : undefined
              }
              className={open ? 'selected' : ''}
              onClick={() => onNavigate(id)}
            >
              <Icon size={19} aria-hidden="true" />
              <span className="nav-label">{title}</span>
              {id === 'record' && pending > 0 && <span className="nav-count">{pending}</span>}
              {id === 'settings' && attention && !open && warning}
            </button>
            {open && pages.length > 1 && (
              <div className="nav-sub">
                {pages.map((sub) => (
                  <button
                    key={sub}
                    // The first sub page shares its name with the main menu otherwise.
                    aria-label={subTitles[sub]}
                    aria-current={page === sub ? 'page' : undefined}
                    aria-describedby={sub === 'sync' && attention ? 'sync-attention' : undefined}
                    onClick={() => onNavigate(sub)}
                  >
                    <span className="nav-label">{subTitles[sub]}</span>
                    {sub === 'sync' && attention && warning}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="nav-item nav-extra">
        <button
          className="nav-more"
          aria-expanded={extraOpen || inExtra}
          onClick={() => setExtraOpen((value) => !value)}
        >
          <span className="nav-label">เครื่องมือเพิ่มเติม</span>
        </button>
        {(extraOpen || inExtra) && (
          <div className="nav-sub">
            {extraPages
              .filter((id) => canManage || id !== 'finance')
              .map((id) => {
                const Icon = icons[id];
                return (
                  <button
                    key={id}
                    aria-label={pageTitles[id]}
                    aria-current={page === id ? 'page' : undefined}
                    onClick={() => onNavigate(id)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span className="nav-label">{pageTitles[id]}</span>
                  </button>
                );
              })}
          </div>
        )}
      </div>
    </nav>
  );
}

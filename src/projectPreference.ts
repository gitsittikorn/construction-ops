import type { Project } from './models';
import { openLocalDatabase } from './storage';

export function preferredProject(projects: Project[], id: string) {
  return projects.find((project) => project.id === id && project.status === 'active')?.id ?? '';
}
export async function loadProjectPreference(owner: string): Promise<string> {
  const db = await openLocalDatabase();
  try {
    const value = await db.get('driveSettings', ['project-default', owner]);
    return typeof value === 'string' ? value : '';
  } finally {
    db.close();
  }
}
export async function saveProjectPreference(owner: string, id: string, projects: Project[]) {
  if (id && preferredProject(projects, id) !== id) throw Error('เลือกโครงการที่กำลังดำเนินการ');
  const db = await openLocalDatabase();
  try {
    await db.put('driveSettings', id, ['project-default', owner]);
  } finally {
    db.close();
  }
}

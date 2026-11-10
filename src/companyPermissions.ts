import type { Data } from './models';
import { canonical } from './syncModel';
import { companyRole } from './workspaceIdentity';
// UX guard before local enqueue; Firestore rules enforce this independently.
export function assertCompanyMutation(previous: Data, next: Data, owner: string) {
  if (companyRole(owner) === 'viewer') {
    if (canonical(previous) !== canonical(next))
      throw Error('สิทธิ์ดูข้อมูลเท่านั้น ไม่สามารถบันทึกหรือแก้ไขข้อมูลได้');
    return;
  }
  if (companyRole(owner) !== 'operator') return;
  const deny = () => {
    throw Error('สิทธิ์พนักงานบันทึกข้อมูลไม่อนุญาตรายการนี้ กรุณาให้ผู้จัดการดำเนินการ');
  };
  for (const key of [
    'projects',
    'masters',
    'deletedProjects',
    'deletedMasters',
    'deletedTrips',
    'deletedWorkspaces',
  ] as const)
    if (canonical(previous[key]) !== canonical(next[key])) deny();
  for (const trip of previous.trips) if (!next.trips.some((item) => item.id === trip.id)) deny();
  for (const old of previous.workspaces ?? [])
    if (!(next.workspaces ?? []).some((item) => item.id === old.id)) deny();
  for (const record of next.workspaces ?? []) {
    const old = previous.workspaces?.find((item) => item.id === record.id);
    if (old && canonical(old) === canonical(record)) continue;
    if (record.recordType === 'daily') {
      if (old) {
        if (
          old.recordType !== 'daily' ||
          old.body.state === 'closed' ||
          record.body.state !== old.body.state ||
          canonical(old.body.verifications) !== canonical(record.body.verifications) ||
          canonical(old.body.closures) !== canonical(record.body.closures)
        )
          deny();
      } else if (
        record.body.state !== 'open' ||
        Object.keys(record.body.verifications).length ||
        record.body.closures.length
      )
        deny();
    } else if (record.recordType === 'evidence') {
      const day = next.workspaces?.find((item) => item.id === record.body.sessionId);
      if (
        !day ||
        day.recordType !== 'daily' ||
        day.body.state === 'closed' ||
        day.projectId !== record.projectId
      )
        deny();
    } else deny();
  }
  if (canonical(previous.audit) !== canonical(next.audit.slice(0, previous.audit.length))) deny();
}

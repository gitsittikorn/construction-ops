import type { Data, Master, Project } from './models';
import { workDate, validateProject } from './domain';
import { companyRole, actorUid } from './workspaceIdentity';
import { saveMaster } from './masterData';
import { createDaily, dailySessions, saveDailyRow, commitWorkspace, validDate } from './daily';
import { addFinanceRate, addProjectExpense, financeVersion } from './finance';
import { gridPoints } from './surveying';
import { validateWorkspace } from './workspaceValidation';

import { demoProjectId, demoProjectName } from './demoProjectInfo';
export { demoProjectId, demoProjectName } from './demoProjectInfo';
export function addDemoProject(data: Data, actor: string, today = workDate()): Data {
  if (!actor || companyRole(actor) === 'operator')
    throw Error('ผู้จัดการหรือเจ้าของกิจการเท่านั้นที่สร้างโครงการตัวอย่างได้');
  if (!validDate(today)) throw Error('วันที่ข้อมูลตัวอย่างไม่ถูกต้อง');
  if (data.projects.some((p) => p.id === demoProjectId)) return data;
  // Never recreate deleted IDs or overwrite unrelated records sharing the reserved prefix.
  const allRecords = [
    ...data.projects,
    ...data.masters,
    ...data.trips,
    ...(data.workspaces ?? []),
    ...(data.deletedProjects ?? []),
    ...(data.deletedMasters ?? []),
    ...(data.deletedTrips ?? []),
    ...(data.deletedWorkspaces ?? []),
  ];
  if (
    allRecords.some(
      (r) => r.id.includes(demoProjectId) || ('projectId' in r && r.projectId === demoProjectId),
    )
  )
    throw Error(
      'พบข้อมูลตัวอย่างเดิมหรือประวัติที่เก็บไว้แล้ว กรุณาตรวจโครงการเดิมก่อน ข้อมูลจะไม่ถูกเขียนทับ',
    );
  const now = new Date().toISOString();
  const dateAt = (offset: number) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const project: Project = {
    id: demoProjectId,
    name: demoProjectName,
    customer: 'ลูกค้าตัวอย่าง DEMO',
    location: 'แปลงสาธิต · ข้อมูลสมมติ',
    status: 'active',
    startDate: dateAt(-4),
    endDate: '',
    description:
      'ข้อมูลตัวอย่างสำหรับดูหน้าจอและรายงาน ไม่ใช่งานจริง เปลี่ยนเป็นฉบับร่างได้โดยไม่ต้องลบข้อมูล',
    createdAt: now,
    updatedAt: now,
  };
  validateProject(project);
  let next: Data = {
    ...data,
    projects: [...data.projects, project],
    audit: [
      ...data.audit,
      {
        id: crypto.randomUUID(),
        entityId: project.id,
        action: 'demo-project-created',
        actor: actorUid(actor),
        at: now,
        before: null,
        after: project,
      },
    ],
  };
  const id = (name: string) => `${demoProjectId}-${name}`;
  const master = (name: string, kind: Master['kind'], suffix: string, capacity = 0): Master => ({
    id: id(suffix),
    kind,
    name,
    detail: 'ข้อมูลสมมติ DEMO',
    active: true,
    capacity,
    createdAt: now,
    updatedAt: now,
  });
  for (const record of [
    master('DEMO · ทีมตัวอย่าง', 'tag', 'team'),
    master('DEMO · รถ 12 คิว', 'truck', 'truck-a', 12),
    master('DEMO · รถ 20 คิว', 'truck', 'truck-b', 20),
    master('DEMO · คนขับหนึ่ง', 'driver', 'driver-a'),
    master('DEMO · คนขับสอง', 'driver', 'driver-b'),
    master('DEMO · บ่อดินตัวอย่าง', 'source', 'source'),
    master('DEMO · ดินถม', 'soilType', 'soil'),
  ])
    next = saveMaster(next, record, actor);
  const counts = [
    [8, 5],
    [10, 6],
    [12, 7],
    [9, 5],
    [11, 7],
  ];
  for (let day = 0; day < counts.length; day++) {
    const date = dateAt(day - 4);
    next = createDaily(next, project.id, date, actor);
    for (let truck = 0; truck < 2; truck++) {
      const session = dailySessions(next).find(
        (s) => s.projectId === project.id && s.body.date === date,
      )!;
      const suffix = truck ? 'b' : 'a';
      next = saveDailyRow(
        next,
        session.id,
        session.body.version,
        {
          id: id(`row-${suffix}`),
          truckId: id(`truck-${suffix}`),
          driverId: id(`driver-${suffix}`),
          teamId: id('team'),
          sourceId: id('source'),
          soilType: 'DEMO · ดินถม',
          tripCount: counts[day][truck],
          capacity: truck ? 20 : 12,
          reportedTrips:
            day === 4 && truck === 1
              ? null
              : counts[day][truck] + (day === 3 && truck === 0 ? 1 : 0),
          notes: 'ข้อมูลตัวอย่าง DEMO · ยังไม่มีหลักฐานยืนยันจริง',
        },
        actor,
      );
    }
  }
  for (const input of [
    { side: 'revenue' as const, unit: 'm3' as const, satang: 8000 },
    { side: 'truck' as const, unit: 'trip' as const, satang: 40000 },
    { side: 'driver' as const, unit: 'trip' as const, satang: 10000 },
  ])
    next = addFinanceRate(
      next,
      project.id,
      financeVersion(next, project.id),
      {
        ...input,
        partyId: '',
        effectiveFrom: dateAt(-4),
        reason: 'เรตราคาสมมติ DEMO สำหรับดูรายงาน',
      },
      actor,
    );
  for (const [category, amount] of [
    ['fuel', 4500],
    ['repair', 1500],
    ['other', 800],
  ] as const)
    next = addProjectExpense(
      next,
      project.id,
      financeVersion(next, project.id),
      {
        date: today,
        category,
        truckId: '',
        satang: amount * 100,
        reason: 'ค่าใช้จ่ายสมมติ DEMO ไม่ใช่การจ่ายเงินจริง',
      },
      actor,
    );
  const survey = {
    id: id('survey'),
    recordType: 'survey' as const,
    projectId: project.id,
    name: 'DEMO · แปลงตัวอย่าง 10 × 10 เมตร',
    createdAt: now,
    updatedAt: now,
    body: {
      benchmark: 'DEMO-BM',
      elevation: 0,
      datum: 'ระดับสมมติ',
      notes: 'ข้อมูลสมมติ ไม่ใช่ผลสำรวจหน้างาน',
      observations: [],
      width: 10,
      length: 10,
      spacingX: 5,
      spacingY: 5,
      design: 'uniform' as const,
      designLevel: 1,
      slopeX: 0,
      slopeY: 0,
      allowance: 0,
      cutSwell: 0,
      points: gridPoints(10, 10, 5, 5, 0),
    },
  };
  validateWorkspace(survey);
  return commitWorkspace(next, survey, actor, 'demo-survey-created');
}

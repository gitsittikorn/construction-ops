import { truckTeams } from './quickRecord';
import type { Data } from './models';

/** Who is in each team. Membership follows the tags kept on trucks and drivers. */
export default function TeamOverview({ data }: { data: Data }) {
  const teams = data.masters.filter((item) => item.kind === 'tag');
  if (!teams.length) return null;
  const trucks = data.masters.filter((item) => item.kind === 'truck');
  const drivers = data.masters.filter((item) => item.kind === 'driver');
  const name = (id?: string) => drivers.find((item) => item.id === id)?.name ?? '';
  return (
    <section className="panel padded" aria-label="รถและคนขับตามทีม">
      <h2>รถและคนขับตามทีม</h2>
      {teams.map((team) => {
        const members = trucks.filter((truck) => truckTeams(data.masters, truck).includes(team.id));
        const people = [
          ...new Set([
            ...members.map((truck) => name(truck.driverId)).filter(Boolean),
            ...drivers.filter((item) => item.tagIds?.includes(team.id)).map((item) => item.name),
          ]),
        ];
        return (
          <details key={team.id}>
            <summary>
              {team.name} · รถ {members.length} คัน · คนขับ {people.length} คน
            </summary>
            <p>
              รถ:{' '}
              {members
                .map((truck) => [truck.name, name(truck.driverId)].filter(Boolean).join(' — '))
                .join(', ') || 'ยังไม่มีรถ'}
            </p>
            <p>คนขับ: {people.join(', ') || 'ยังไม่มีคนขับ'}</p>
          </details>
        );
      })}
    </section>
  );
}

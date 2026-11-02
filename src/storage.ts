import { openDB } from 'idb';
import { emptyData, type Data } from './models';
const db = () =>
  openDB('construction-ops', 1, {
    upgrade(database) {
      database.createObjectStore('state');
    },
  });
export async function loadData(owner: string): Promise<Data> {
  return (await (await db()).get('state', owner)) ?? structuredClone(emptyData);
}
export async function persistData(owner: string, data: Data) {
  await (await db()).put('state', data, owner);
}

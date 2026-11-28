import { Truck } from 'lucide-react';
import type { Data, Master } from './models';
import { matchesMaster, tagNames, truckTypes } from './masterData';
import RowActions from './RowActions';
import SelectableList, { type RecordAccess } from './SelectableList';

// Trucks and drivers stay separate records; this only shows and searches them together.
export function fleetRows(data: Data, query: string, tagId: string, truckType: string) {
  const driverOf = (truck: Master) =>
    data.masters.find((item) => item.kind === 'driver' && item.id === truck.driverId);
  const matches = (item: Master) => matchesMaster(item, data.masters, query, tagId);
  const trucks = data.masters.filter((item) => {
    if (item.kind !== 'truck' || (truckType && item.truckType !== truckType)) return false;
    const driver = driverOf(item);
    return matches(item) || Boolean(driver && matches(driver));
  });
  const assigned = new Set(
    data.masters.flatMap((item) => (item.kind === 'truck' && item.driverId ? [item.driverId] : [])),
  );
  const spareDrivers = truckType
    ? []
    : data.masters.filter(
        (item) => item.kind === 'driver' && !assigned.has(item.id) && matches(item),
      );
  return { trucks, spareDrivers, driverOf };
}

export const truckTitle = (truck: Master, driver?: Master) =>
  `${[truck.name, truck.province].filter(Boolean).join(' ')} — ${
    driver ? driver.name + (driver.active ? '' : ' (ปิดใช้งาน)') : 'ยังไม่ระบุคนขับ'
  }`;

export default function FleetList({
  data,
  query,
  tagId,
  truckType,
  canManage,
  onEdit,
  onDelete,
  access,
}: {
  access?: RecordAccess;
  data: Data;
  query: string;
  tagId: string;
  truckType: string;
  canManage: boolean;
  onEdit: (record: Master) => void;
  onDelete: (record: Master) => void;
}) {
  const { trucks, spareDrivers, driverOf } = fleetRows(data, query, tagId, truckType);
  const any = data.masters.some((item) => item.kind === 'truck' || item.kind === 'driver');
  const summary = (record: Master, title: string, details: (string | undefined)[]) => (
    <>
      <span className="project-symbol">
        <Truck size={20} aria-hidden="true" />
      </span>
      <span className="data-row-text">
        <b>{title}</b>
        <small>{details.filter(Boolean).join(' · ')}</small>
        <span className="tag-badges">
          {tagNames(record, data.masters).map((name, index) => (
            <span className="badge" key={index}>
              {name}
            </span>
          ))}
        </span>
      </span>
      <span className={'badge ' + (!record.active ? 'archived' : '')}>
        {record.active ? 'ใช้งาน' : 'ปิดใช้งาน'}
      </span>
    </>
  );
  return (
    <SelectableList
      items={[...trucks, ...spareDrivers]}
      scope={[access?.owner, query, tagId, truckType].join('|')}
      type="master"
      label={(item) => (item.kind === 'truck' ? `รถ ${item.name}` : `คนขับ ${item.name}`)}
      access={canManage ? access : undefined}
    >
      {({ rows, box, selected }) => (
        <div className="panel list">
          {rows
            .filter((item) => item.kind === 'truck')
            .map((truck) => {
              const driver = driverOf(truck);
              return (
                <div className={'data-row' + (selected(truck) ? ' selected' : '')} key={truck.id}>
                  {box(truck)}
                  {summary(truck, truckTitle(truck, driver), [
                    `รหัส ${truck.id.slice(0, 8)}`,
                    truck.phone || driver?.phone,
                    truck.nickname || driver?.nickname,
                    truck.truckType ? truckTypes[truck.truckType] : '',
                    truck.capacity ? `${truck.capacity} m³` : '',
                    truck.detail,
                  ])}
                  {canManage && (
                    <span className="data-row-actions">
                      <RowActions
                        name={truck.name}
                        onEdit={() => onEdit(truck)}
                        onDelete={() => onDelete(truck)}
                      />
                      {driver && (
                        <RowActions
                          name={`คนขับ ${driver.name}`}
                          onEdit={() => onEdit(driver)}
                          onDelete={() => onDelete(driver)}
                        />
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          {rows
            .filter((item) => item.kind === 'driver')
            .map((driver) => (
              <div className={'data-row' + (selected(driver) ? ' selected' : '')} key={driver.id}>
                {box(driver)}
                {summary(driver, driver.name, [
                  'คนขับที่ยังไม่มีรถ',
                  driver.phone,
                  driver.nickname,
                  driver.detail,
                ])}
                {canManage && (
                  <span className="data-row-actions">
                    <RowActions
                      name={`คนขับ ${driver.name}`}
                      onEdit={() => onEdit(driver)}
                      onDelete={() => onDelete(driver)}
                    />
                  </span>
                )}
              </div>
            ))}
          {!trucks.length && !spareDrivers.length && (
            <p className="empty">
              {any ? 'ไม่พบข้อมูลตามตัวกรองที่เลือก' : 'ยังไม่มีข้อมูลรถและคนขับ'}
            </p>
          )}
        </div>
      )}
    </SelectableList>
  );
}

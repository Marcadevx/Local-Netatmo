// Standard HomeKit characteristic UUIDs, accepting both short and expanded forms.
const type = (uuid) => String(uuid).toUpperCase().split('-')[0].replace(/^0+/, '');
const metrics = {
  '11': ['temperature', '°C'],
  '10': ['humidity', '%'],
  '68': ['battery', '%'],
  '79': ['batteryLow', null],
  '8F': ['chargingState', null],
  '92': ['carbonDioxideDetected', null],
  '90': ['airQuality', null],
  '77': ['statusFault', null],
  '93': ['carbonDioxide', 'ppm'],
};
export function normalizeAccessories(database) {
  return database.accessories.map((accessory) => {
    const info = accessory.services.find((service) => type(service.type) === '3E');
    const name = info?.characteristics.find((c) => type(c.type) === '23')?.value;
    const readings = [];
    for (const service of accessory.services) {
      const serviceName = service.characteristics.find((c) => type(c.type) === '23')?.value;
      for (const characteristic of service.characteristics) {
        const metric = metrics[type(characteristic.type)];
        if (!metric || !characteristic.perms?.includes('pr')) continue;
        readings.push({
          characteristic: `${accessory.aid}.${characteristic.iid}`,
          serviceId: Number(service.iid),
          ...(serviceName ? { serviceName } : {}),
          metric: metric[0], unit: metric[1],
          value: characteristic.status || characteristic.value === undefined ? null : characteristic.value,
          status: characteristic.status ?? 0,
        });
      }
    }
    return { id: Number(accessory.aid), name: name || `Accessory ${accessory.aid}`, readings };
  }).filter((accessory) => accessory.readings.length);
}

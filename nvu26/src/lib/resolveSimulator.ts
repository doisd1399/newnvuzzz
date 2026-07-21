export function resolveSimulatorId(data:any, simulators:any[] = []): string {
  if (!data) return "";
  if (data.simulatorId) return data.simulatorId;
  const legacy = data.simulatorName || data.simulator || "";
  if (!legacy) return "";
  const found = simulators.find((s:any) =>
    s.id === legacy || s.name?.toLowerCase() === String(legacy).toLowerCase()
  );
  return found?.id || normalizeSimulatorId(String(legacy));
}

export function resolveSimulatorName(data:any, simulators:any[] = []): string {
  if (!data) return "";
  if (data.simulatorName) return data.simulatorName;
  if (data.simulatorId) {
    return simulators.find((s:any)=>s.id===data.simulatorId)?.name || data.simulatorId;
  }
  return data.simulator || "";
}

export function resolveSimulator(data:any, simulators:any[] = []): string {
  return resolveSimulatorId(data, simulators);
}

export function normalizeSimulatorId(value:string=""): string {
  return value.toLowerCase().trim().replace(/\s+/g, "-");
}

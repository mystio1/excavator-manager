const DEFAULT_DUE_SOON_THRESHOLD_HOURS = 50;

type ServiceStatusInput = {
  currentHourMeter: number;
  startingHourMeter: number;
  serviceIntervalHrs: number | null;
  businessDefaultIntervalHrs: number;
  lastServiceHourMeter?: number | null;
  lastServiceNextDueHour?: number | null;
  /** Business.maintenanceAlertThresholdHrs — configurable per §18, defaults to 50. */
  dueSoonThresholdHrs?: number;
};

/**
 * Never make the owner calculate this. If a real service has been logged we
 * trust its recorded nextServiceDueHour; otherwise we project forward from
 * the machine's starting hour meter using its own interval override (or the
 * business default). currentHourMeter must always be the machine's latest
 * *approved* reading (see DailyWorkLog.status) — never a pending one.
 */
export function computeServiceStatus(input: ServiceStatusInput) {
  const interval = input.serviceIntervalHrs ?? input.businessDefaultIntervalHrs;
  const lastServiceHour = input.lastServiceHourMeter ?? input.startingHourMeter;
  const nextDueHour = input.lastServiceNextDueHour ?? lastServiceHour + interval;
  const dueInHours = Math.round((nextDueHour - input.currentHourMeter) * 100) / 100;
  const threshold = input.dueSoonThresholdHrs ?? DEFAULT_DUE_SOON_THRESHOLD_HOURS;

  return {
    nextDueHour,
    dueInHours,
    overdue: dueInHours < 0,
    dueSoon: dueInHours >= 0 && dueInHours <= threshold,
  };
}

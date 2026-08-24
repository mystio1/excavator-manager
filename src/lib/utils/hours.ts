/**
 * The owner must never be asked to calculate hours by hand. A daily log is
 * filled in one of two ways, and this is the only place that turns either
 * into hoursWorked:
 *   - hour meter reading (endHourMeter - startHourMeter), or
 *   - clock time (stopTime - startTime - breakMinutes)
 */
export function calcHoursFromMeter(startHourMeter: number, endHourMeter: number) {
  const hours = endHourMeter - startHourMeter;
  return Math.round(hours * 100) / 100;
}

/** startTime/stopTime as "HH:MM" (24h). Handles a stop time past midnight. */
export function calcHoursFromClock(startTime: string, stopTime: string, breakMinutes = 0) {
  const [startH, startM] = startTime.split(":").map(Number);
  const [stopH, stopM] = stopTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  let stopMinutes = stopH * 60 + stopM;
  if (stopMinutes < startMinutes) stopMinutes += 24 * 60;

  const totalMinutes = stopMinutes - startMinutes - breakMinutes;
  return Math.round((totalMinutes / 60) * 100) / 100;
}

export function formatHours(hours: number) {
  return `${hours.toLocaleString("en-IN", { maximumFractionDigits: 2 })} hrs`;
}

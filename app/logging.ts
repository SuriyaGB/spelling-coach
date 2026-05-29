function pad(value: number, width = 2): string {
  return value.toString().padStart(width, "0");
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = pad(date.getMilliseconds(), 3);
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function buildPrefix(level: "INFO" | "ERROR" | "WARN"): string {
  return `[${formatTimestamp(new Date())}] [${level}]`;
}

export function logInfo(message: string, ...details: unknown[]): void {
  console.log(buildPrefix("INFO"), message, ...details);
}

export function logWarn(message: string, ...details: unknown[]): void {
  console.warn(buildPrefix("WARN"), message, ...details);
}

export function logError(message: string, ...details: unknown[]): void {
  console.error(buildPrefix("ERROR"), message, ...details);
}

import { getPool } from "@/lib/db"; // or your existing pool getter

type Service = "neon" | "vercel" | "sqlserver" | "autoexclusion";
type Level = "INFO" | "WARN" | "ERROR";

export async function logSysadminEvent(args: {
  service: Service;
  action: string;
  level: Level;
  message: string;
  latency_ms?: number | null;
  actor_email?: string | null;
  metadata?: any;
}) {
  const pool = getPool();
  await pool.query(
    `
    insert into sysadmin_service_logs
      (service, action, level, message, latency_ms, actor_email, metadata)
    values
      ($1,$2,$3,$4,$5,$6,$7)
    `,
    [
      args.service,
      args.action,
      args.level,
      args.message,
      args.latency_ms ?? null,
      args.actor_email ?? null,
      JSON.stringify(args.metadata ?? {}),
    ]
  );
}

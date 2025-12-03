import { query } from '@/lib/db';

export async function logAuditEvent({
  actorUserId,
  actorEmail,
  action,
  targetType,
  targetId,
  summary,
  metadata,
}: {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary?: string | null;
  metadata?: any;
}) {
  try {
    await query(
      `INSERT INTO audit_logs
         (actor_user_id, actor_email, action, target_type, target_id, summary, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        actorUserId ?? null,
        actorEmail ?? null,
        action,
        targetType,
        targetId ?? null,
        summary ?? null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    // Log but don't throw - we don't want audit logging failures to break the main operation
    console.error('Failed to log audit event:', err);
  }
}


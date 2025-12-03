// app/api/policy-rules/[id]/route.ts
// API for managing individual policy rules

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

// PUT /api/policy-rules/[id] - Update a rule
export async function PUT(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const ruleId = parseInt(id, 10);
  
  if (isNaN(ruleId)) {
    return NextResponse.json({ error: 'Invalid rule ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, description, priority, isActive, isAutoExecute, conditions, actions } = body;

  try {
    await query(`
      UPDATE policy_rules 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          priority = COALESCE($3, priority),
          is_active = COALESCE($4, is_active),
          is_auto_execute = COALESCE($5, is_auto_execute),
          updated_at = NOW()
      WHERE id = $6
    `, [name?.trim(), description?.trim(), priority, isActive, isAutoExecute, ruleId]);

    // Replace conditions if provided
    if (conditions !== undefined) {
      await query(`DELETE FROM policy_rule_conditions WHERE rule_id = $1`, [ruleId]);
      if (Array.isArray(conditions)) {
        for (const cond of conditions) {
          await query(`
            INSERT INTO policy_rule_conditions 
            (rule_id, condition_type, target_parish, target_post_id, operator, value, logic_operator)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [ruleId, cond.type, cond.targetParish || null, cond.targetPostId || null, 
              cond.operator, String(cond.value), cond.logic || 'AND']);
        }
      }
    }

    // Replace actions if provided
    if (actions !== undefined) {
      await query(`DELETE FROM policy_rule_actions WHERE rule_id = $1`, [ruleId]);
      if (Array.isArray(actions)) {
        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          await query(`
            INSERT INTO policy_rule_actions
            (rule_id, action_type, target_level, target_post_id, from_parish, to_parish, message, execution_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [ruleId, action.type, action.targetLevel || null, action.targetPostId || null,
              action.fromParish || null, action.toParish || null, action.message || null, i + 1]);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to update rule', details: err.message }, { status: 500 });
  }
}

// DELETE /api/policy-rules/[id] - Soft delete a rule
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const ruleId = parseInt(id, 10);
  
  if (isNaN(ruleId)) {
    return NextResponse.json({ error: 'Invalid rule ID' }, { status: 400 });
  }

  try {
    await query(`UPDATE policy_rules SET is_active = false WHERE id = $1`, [ruleId]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to delete rule', details: err.message }, { status: 500 });
  }
}


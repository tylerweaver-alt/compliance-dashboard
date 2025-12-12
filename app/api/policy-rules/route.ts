// app/api/policy-rules/route.ts
// API for managing coverage policy rules per region

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

// Condition types that can trigger a rule
export type ConditionType = 
  | 'UNITS_AVAILABLE_IN_PARISH'      // Units available in a specific parish
  | 'UNITS_AVAILABLE_IN_REGION'      // Total units available in region
  | 'ACTIVE_CALLS_IN_PARISH'         // Number of active calls in parish
  | 'ACTIVE_CALLS_IN_REGION'         // Number of active calls in region
  | 'CURRENT_COVERAGE_LEVEL'         // Current coverage level
  | 'TIME_OF_DAY'                    // Time-based (e.g., night shift)
  | 'DAY_OF_WEEK'                    // Day-based (e.g., weekends)
  | 'CALL_VOLUME_LAST_HOUR'          // Recent call volume
  | 'AVERAGE_RESPONSE_TIME'          // Response time threshold
  | 'UNIT_AT_POST';                  // Check if unit is at specific post

// Action types that a rule can trigger
export type ActionType =
  | 'CHANGE_COVERAGE_LEVEL'          // Switch to different level
  | 'MOVE_UNIT_TO_POST'              // Relocate a unit
  | 'REQUEST_MUTUAL_AID'             // Request help from neighboring region
  | 'ALERT_SUPERVISOR'               // Send notification
  | 'ACTIVATE_POST'                  // Activate a dormant post
  | 'DEACTIVATE_POST';               // Deactivate a post

async function initTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS policy_rules (
      id SERIAL PRIMARY KEY,
      region_id VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 100,
      is_active BOOLEAN DEFAULT true,
      is_auto_execute BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS policy_rule_conditions (
      id SERIAL PRIMARY KEY,
      rule_id INTEGER REFERENCES policy_rules(id) ON DELETE CASCADE,
      condition_type VARCHAR(50) NOT NULL,
      target_parish VARCHAR(100),
      target_post_id INTEGER,
      operator VARCHAR(10) NOT NULL,
      value VARCHAR(100) NOT NULL,
      logic_operator VARCHAR(10) DEFAULT 'AND'
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS policy_rule_actions (
      id SERIAL PRIMARY KEY,
      rule_id INTEGER REFERENCES policy_rules(id) ON DELETE CASCADE,
      action_type VARCHAR(50) NOT NULL,
      target_level INTEGER,
      target_post_id INTEGER,
      from_parish VARCHAR(100),
      to_parish VARCHAR(100),
      message TEXT,
      execution_order INTEGER DEFAULT 1
    )
  `);
}

// GET /api/policy-rules?region_id=CENLA
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const regionId = searchParams.get('region_id');

  if (!regionId) {
    return NextResponse.json({ error: 'region_id is required' }, { status: 400 });
  }

  try {
    await initTables();

    const rulesResult = await query(`
      SELECT pr.id, pr.region_id, pr.name, pr.description, pr.priority, 
             pr.is_active, pr.is_auto_execute,
             COALESCE(
               (SELECT json_agg(json_build_object(
                 'id', c.id, 'type', c.condition_type, 'targetParish', c.target_parish,
                 'targetPostId', c.target_post_id, 'operator', c.operator, 
                 'value', c.value, 'logic', c.logic_operator
               )) FROM policy_rule_conditions c WHERE c.rule_id = pr.id),
               '[]'
             ) as conditions,
             COALESCE(
               (SELECT json_agg(json_build_object(
                 'id', a.id, 'type', a.action_type, 'targetLevel', a.target_level,
                 'targetPostId', a.target_post_id, 'fromParish', a.from_parish,
                 'toParish', a.to_parish, 'message', a.message, 'order', a.execution_order
               ) ORDER BY a.execution_order) FROM policy_rule_actions a WHERE a.rule_id = pr.id),
               '[]'
             ) as actions
      FROM policy_rules pr
      WHERE pr.region_id = $1 AND pr.is_active = true
      ORDER BY pr.priority ASC, pr.name
    `, [regionId]);

    return NextResponse.json({
      ok: true,
      rules: rulesResult.rows.map((row: any) => ({
        id: row.id,
        regionId: row.region_id,
        name: row.name,
        description: row.description,
        priority: row.priority,
        isActive: row.is_active,
        isAutoExecute: row.is_auto_execute,
        conditions: row.conditions,
        actions: row.actions,
      })),
    });
  } catch (err: any) {
    console.error('GET /api/policy-rules error:', err);
    return NextResponse.json({ error: 'Failed to fetch rules', details: err.message }, { status: 500 });
  }
}

// POST /api/policy-rules - Create a new rule
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { regionId, name, description, priority, isAutoExecute, conditions, actions } = body;

  if (!regionId || !name) {
    return NextResponse.json({ error: 'regionId and name are required' }, { status: 400 });
  }

  try {
    await initTables();

    // Insert the rule
    const ruleResult = await query(`
      INSERT INTO policy_rules (region_id, name, description, priority, is_auto_execute)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [regionId, name.trim(), description?.trim() || null, priority || 100, isAutoExecute || false]);

    const ruleId = ruleResult.rows[0].id;

    // Insert conditions
    if (conditions && Array.isArray(conditions)) {
      for (const cond of conditions) {
        await query(`
          INSERT INTO policy_rule_conditions
          (rule_id, condition_type, target_parish, target_post_id, operator, value, logic_operator)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [ruleId, cond.type, cond.targetParish || null, cond.targetPostId || null,
            cond.operator, String(cond.value), cond.logic || 'AND']);
      }
    }

    // Insert actions
    if (actions && Array.isArray(actions)) {
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

    return NextResponse.json({ ok: true, ruleId });
  } catch (err: any) {
    console.error('POST /api/policy-rules error:', err);
    return NextResponse.json({ error: 'Failed to create rule', details: err.message }, { status: 500 });
  }
}


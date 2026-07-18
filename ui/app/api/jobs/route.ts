import { NextRequest, NextResponse } from 'next/server';
import { getPrisma, getSchema } from '@/lib/db';

function serializeBigInt(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (obj instanceof Date) return obj.toISOString();
  // Handle Prisma Decimal type (has toNumber method)
  if (typeof obj === 'object' && obj !== null && 'toNumber' in obj && typeof (obj as any).toNumber === 'function') {
    return (obj as any).toNumber();
  }
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const pid = searchParams.get('pid');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const prisma = getPrisma();
    const schema = getSchema();
    
    let query = `
      SELECT 
        w.job_id,
        w.pid,
        p.project_name,
        w.job_type,
        w.status,
        w.priority,
        w.batch_nbr,
        w.table_filter,
        w.target_server_id,
        w.assigned_server_id,
        s.server_name as assigned_server_name,
        w.created_at,
        w.scheduled_at,
        w.started_at,
        w.completed_at,
        w.created_by,
        w.job_config,
        w.result_summary,
        w.error_message,
        w.source,
        CASE 
          WHEN w.started_at IS NOT NULL AND w.completed_at IS NULL 
          THEN EXTRACT(EPOCH FROM (current_timestamp - w.started_at))
          WHEN w.started_at IS NOT NULL AND w.completed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (w.completed_at - w.started_at))
          ELSE NULL
        END as duration_seconds
      FROM ${schema}.dc_job w
      LEFT JOIN ${schema}.dc_project p ON w.pid = p.pid
      LEFT JOIN ${schema}.dc_server s ON w.assigned_server_id = s.server_id
    `;

    const conditions: string[] = [];
    
    if (pid) {
      conditions.push(`w.pid = ${parseInt(pid)}`);
    }
    
    if (status) {
      const statuses = status.split(',').map(s => `'${s}'`).join(',');
      conditions.push(`w.status IN (${statuses})`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY w.created_at DESC LIMIT ${limit}`;

    const jobs = await prisma.$queryRawUnsafe(query);
    
    return NextResponse.json(serializeBigInt(jobs));
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const schema = getSchema();
    const body = await request.json();
    const {
      pid,
      job_type = 'compare',
      priority = 5,
      batch_nbr = 0,
      table_filter = null,
      target_server_id = null,
      scheduled_at = null,
      created_by = 'ui',
      job_config = null
    } = body;

    if (!pid) {
      return NextResponse.json({ error: 'Project ID (pid) is required' }, { status: 400 });
    }

    const result = await prisma.$queryRawUnsafe(`
      INSERT INTO ${schema}.dc_job (
        pid, job_type, priority, batch_nbr, table_filter, 
        target_server_id, scheduled_at, created_by, job_config
      )
      VALUES (
        ${pid}::int, 
        '${job_type}', 
        ${priority}::int, 
        ${batch_nbr}::int, 
        ${table_filter ? `'${table_filter}'` : 'NULL'}, 
        ${target_server_id ? `'${target_server_id}'::uuid` : 'NULL'}, 
        ${scheduled_at ? `'${scheduled_at}'::timestamptz` : 'NULL'}, 
        '${created_by}', 
        ${job_config ? `'${JSON.stringify(job_config)}'::jsonb` : 'NULL'}
      )
      RETURNING job_id, status, created_at
    `);

    return NextResponse.json(serializeBigInt(result));
  } catch (error) {
    console.error('Failed to create job:', error);
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const pid = searchParams.get('pid');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const prisma = getPrisma();
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
        CASE 
          WHEN w.started_at IS NOT NULL AND w.completed_at IS NULL 
          THEN EXTRACT(EPOCH FROM (current_timestamp - w.started_at))
          WHEN w.started_at IS NOT NULL AND w.completed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (w.completed_at - w.started_at))
          ELSE NULL
        END as duration_seconds
      FROM dc_job w
      LEFT JOIN dc_project p ON w.pid = p.pid
      LEFT JOIN dc_server s ON w.assigned_server_id = s.server_id
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
    
    return NextResponse.json(jobs);
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const prisma = getPrisma();
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

    const result = await prisma.$queryRaw`
      INSERT INTO dc_job (
        pid, job_type, priority, batch_nbr, table_filter, 
        target_server_id, scheduled_at, created_by, job_config
      )
      VALUES (
        ${pid}::int, 
        ${job_type}, 
        ${priority}::int, 
        ${batch_nbr}::int, 
        ${table_filter}, 
        ${target_server_id}::uuid, 
        ${scheduled_at}::timestamptz, 
        ${created_by}, 
        ${job_config ? JSON.stringify(job_config) : null}::jsonb
      )
      RETURNING job_id, status, created_at
    `;

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to create job:', error);
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }
}

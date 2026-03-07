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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  try {
    const prisma = getPrisma();
    const schema = getSchema();
    
    const job = await prisma.$queryRawUnsafe(`
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
          WHEN w.started_at IS NOT NULL AND w.completed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (w.completed_at - w.started_at))
          WHEN w.started_at IS NOT NULL AND w.completed_at IS NULL
          THEN EXTRACT(EPOCH FROM (current_timestamp - w.started_at))
          ELSE NULL
        END as duration_seconds
      FROM ${schema}.dc_job w
      LEFT JOIN ${schema}.dc_project p ON w.pid = p.pid
      LEFT JOIN ${schema}.dc_server s ON w.assigned_server_id = s.server_id
      WHERE w.job_id = '${jobId}'::uuid
    `);

    if (!job || (Array.isArray(job) && job.length === 0)) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(serializeBigInt(Array.isArray(job) ? job[0] : job));
  } catch (error) {
    console.error('Failed to fetch job:', error);
    return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  try {
    const prisma = getPrisma();
    const schema = getSchema();
    
    // Get cid values from job progress to clean up related data
    const progressRecords = await prisma.$queryRawUnsafe(`
      SELECT cid, tid FROM ${schema}.dc_job_progress 
      WHERE job_id = '${jobId}'::uuid AND cid IS NOT NULL
    `) as { cid: number; tid: number }[];
    
    if (progressRecords && progressRecords.length > 0) {
      const cids = progressRecords.map(r => r.cid).filter(c => c != null);
      const tids = [...new Set(progressRecords.map(r => r.tid))];
      
      if (cids.length > 0) {
        // Delete dc_result records for this job's compares
        await prisma.$executeRawUnsafe(`
          DELETE FROM ${schema}.dc_result WHERE cid = ANY(ARRAY[${cids.join(',')}])
        `);
      }
      
      if (tids.length > 0) {
        // Delete dc_source records for these tables
        await prisma.$executeRawUnsafe(`
          DELETE FROM ${schema}.dc_source WHERE tid = ANY(ARRAY[${tids.join(',')}])
        `);
        
        // Delete dc_target records for these tables
        await prisma.$executeRawUnsafe(`
          DELETE FROM ${schema}.dc_target WHERE tid = ANY(ARRAY[${tids.join(',')}])
        `);
        
        // Delete dc_table_history records for these tables
        await prisma.$executeRawUnsafe(`
          DELETE FROM ${schema}.dc_table_history WHERE tid = ANY(ARRAY[${tids.join(',')}])
        `);
      }
    }
    
    // Delete the job (cascades to dc_job_progress and dc_job_control via FK)
    await prisma.$executeRawUnsafe(`
      DELETE FROM ${schema}.dc_job 
      WHERE job_id = '${jobId}'::uuid 
        AND status IN ('pending', 'completed', 'failed', 'cancelled')
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete job:', error);
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
  }
}

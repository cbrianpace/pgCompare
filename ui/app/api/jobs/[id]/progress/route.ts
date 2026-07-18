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
    
    // Get job progress with status and cid, then join to dc_result for counts
    const progress = await prisma.$queryRawUnsafe(`
      SELECT 
        jp.job_id,
        jp.tid,
        jp.table_name,
        jp.status,
        jp.started_at,
        jp.completed_at,
        jp.error_message,
        jp.cid,
        COALESCE(r.source_cnt, 0) as source_cnt,
        COALESCE(r.target_cnt, 0) as target_cnt,
        COALESCE(r.equal_cnt, 0) as equal_cnt,
        COALESCE(r.not_equal_cnt, 0) as not_equal_cnt,
        COALESCE(r.missing_source_cnt, 0) as missing_source_cnt,
        COALESCE(r.missing_target_cnt, 0) as missing_target_cnt,
        CASE 
          WHEN jp.started_at IS NOT NULL AND jp.completed_at IS NULL 
          THEN EXTRACT(EPOCH FROM (current_timestamp - jp.started_at))
          WHEN jp.started_at IS NOT NULL AND jp.completed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (jp.completed_at - jp.started_at))
          ELSE NULL
        END as duration_seconds
      FROM ${schema}.dc_job_progress jp
      LEFT JOIN ${schema}.dc_result r ON jp.cid = r.cid
      WHERE jp.job_id = '${jobId}'::uuid
      ORDER BY 
        CASE jp.status 
          WHEN 'running' THEN 1 
          WHEN 'pending' THEN 2 
          WHEN 'completed' THEN 3
          WHEN 'failed' THEN 4
          WHEN 'skipped' THEN 5
        END,
        jp.table_name
    `);

    // Get summary by aggregating from dc_result via cid
    const summary = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*) as total_tables,
        COUNT(*) FILTER (WHERE jp.status = 'completed') as completed_tables,
        COUNT(*) FILTER (WHERE jp.status = 'running') as running_tables,
        COUNT(*) FILTER (WHERE jp.status = 'pending') as pending_tables,
        COUNT(*) FILTER (WHERE jp.status = 'failed') as failed_tables,
        SUM(COALESCE(r.source_cnt, 0)) as total_source,
        SUM(COALESCE(r.target_cnt, 0)) as total_target,
        SUM(COALESCE(r.equal_cnt, 0)) as total_equal,
        SUM(COALESCE(r.not_equal_cnt, 0)) as total_not_equal,
        SUM(COALESCE(r.missing_source_cnt, 0)) as total_missing_source,
        SUM(COALESCE(r.missing_target_cnt, 0)) as total_missing_target
      FROM ${schema}.dc_job_progress jp
      LEFT JOIN ${schema}.dc_result r ON jp.cid = r.cid
      WHERE jp.job_id = '${jobId}'::uuid
    `);

    return NextResponse.json(serializeBigInt({
      tables: progress,
      summary: Array.isArray(summary) ? summary[0] : summary
    }));
  } catch (error) {
    console.error('Failed to fetch job progress:', error);
    return NextResponse.json({ error: 'Failed to fetch job progress' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  try {
    const prisma = getPrisma();
    const progress = await prisma.$queryRaw`
      SELECT 
        job_id,
        tid,
        table_name,
        status,
        started_at,
        completed_at,
        source_cnt,
        target_cnt,
        equal_cnt,
        not_equal_cnt,
        missing_source_cnt,
        missing_target_cnt,
        error_message,
        CASE 
          WHEN started_at IS NOT NULL AND completed_at IS NULL 
          THEN EXTRACT(EPOCH FROM (current_timestamp - started_at))
          WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - started_at))
          ELSE NULL
        END as duration_seconds
      FROM dc_job_progress
      WHERE job_id = ${jobId}::uuid
      ORDER BY 
        CASE status 
          WHEN 'running' THEN 1 
          WHEN 'pending' THEN 2 
          WHEN 'completed' THEN 3
          WHEN 'failed' THEN 4
          WHEN 'skipped' THEN 5
        END,
        table_name
    `;

    const summary = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_tables,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tables,
        COUNT(*) FILTER (WHERE status = 'running') as running_tables,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_tables,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_tables,
        SUM(COALESCE(source_cnt, 0)) as total_source,
        SUM(COALESCE(target_cnt, 0)) as total_target,
        SUM(COALESCE(equal_cnt, 0)) as total_equal,
        SUM(COALESCE(not_equal_cnt, 0)) as total_not_equal,
        SUM(COALESCE(missing_source_cnt, 0)) as total_missing_source,
        SUM(COALESCE(missing_target_cnt, 0)) as total_missing_target
      FROM dc_job_progress
      WHERE job_id = ${jobId}::uuid
    `;

    return NextResponse.json({
      tables: progress,
      summary: Array.isArray(summary) ? summary[0] : summary
    });
  } catch (error) {
    console.error('Failed to fetch job progress:', error);
    return NextResponse.json({ error: 'Failed to fetch job progress' }, { status: 500 });
  }
}

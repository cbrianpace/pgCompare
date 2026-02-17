import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  try {
    const prisma = getPrisma();
    const job = await prisma.$queryRaw`
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
        w.error_message
      FROM dc_job w
      LEFT JOIN dc_project p ON w.pid = p.pid
      LEFT JOIN dc_server s ON w.assigned_server_id = s.server_id
      WHERE w.job_id = ${jobId}::uuid
    `;

    if (!job || (Array.isArray(job) && job.length === 0)) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(Array.isArray(job) ? job[0] : job);
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
    await prisma.$executeRaw`
      DELETE FROM dc_job 
      WHERE job_id = ${jobId}::uuid 
        AND status IN ('pending', 'completed', 'failed', 'cancelled')
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete job:', error);
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
  }
}

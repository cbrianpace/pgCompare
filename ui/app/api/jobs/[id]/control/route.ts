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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  try {
    const prisma = getPrisma();
    const schema = getSchema();
    const body = await request.json();
    const { signal, requested_by = 'ui' } = body;

    const validSignals = ['pause', 'resume', 'stop', 'terminate'];
    if (!signal || !validSignals.includes(signal)) {
      return NextResponse.json(
        { error: `Invalid signal. Must be one of: ${validSignals.join(', ')}` },
        { status: 400 }
      );
    }

    const job = await prisma.$queryRawUnsafe(`
      SELECT status FROM ${schema}.dc_job WHERE job_id = '${jobId}'::uuid
    `);

    if (!job || (Array.isArray(job) && job.length === 0)) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const jobStatus = Array.isArray(job) ? job[0].status : (job as any).status;
    
    if (jobStatus !== 'running' && jobStatus !== 'paused') {
      return NextResponse.json(
        { error: `Cannot send signal to job with status: ${jobStatus}` },
        { status: 400 }
      );
    }

    const result = await prisma.$queryRawUnsafe(`
      INSERT INTO ${schema}.dc_job_control (job_id, signal, requested_by)
      VALUES ('${jobId}'::uuid, '${signal}', '${requested_by}')
      RETURNING control_id, requested_at
    `);

    if (signal === 'pause') {
      await prisma.$executeRawUnsafe(`
        UPDATE ${schema}.dc_job SET status = 'paused' WHERE job_id = '${jobId}'::uuid
      `);
    } else if (signal === 'resume') {
      await prisma.$executeRawUnsafe(`
        UPDATE ${schema}.dc_job SET status = 'running' WHERE job_id = '${jobId}'::uuid
      `);
    }

    return NextResponse.json(serializeBigInt({ 
      success: true, 
      signal,
      control: Array.isArray(result) ? result[0] : result 
    }));
  } catch (error) {
    console.error('Failed to send control signal:', error);
    return NextResponse.json({ error: 'Failed to send control signal' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  try {
    const prisma = getPrisma();
    const schema = getSchema();
    
    const signals = await prisma.$queryRawUnsafe(`
      SELECT control_id, signal, requested_at, processed_at, requested_by
      FROM ${schema}.dc_job_control
      WHERE job_id = '${jobId}'::uuid
      ORDER BY requested_at DESC
      LIMIT 20
    `);

    return NextResponse.json(serializeBigInt(signals));
  } catch (error) {
    console.error('Failed to fetch control signals:', error);
    return NextResponse.json({ error: 'Failed to fetch control signals' }, { status: 500 });
  }
}

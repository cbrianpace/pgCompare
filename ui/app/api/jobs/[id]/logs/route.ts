import { NextRequest, NextResponse } from 'next/server';
import { getPrisma, getSchema } from '@/lib/db';

interface LogEntry {
  log_id: number;
  job_id: string;
  log_ts: Date;
  log_level: string;
  thread_name: string | null;
  message: string;
  context: unknown;
}

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
  const { searchParams } = new URL(request.url);
  
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '100'), 500);
  const level = searchParams.get('level');
  const sinceLogId = searchParams.get('sinceLogId');
  const offset = (page - 1) * pageSize;

  try {
    const prisma = getPrisma();
    const schema = getSchema();
    
    // Build WHERE clause
    const conditions: string[] = [`job_id = '${jobId}'::uuid`];
    
    if (level && level !== 'all') {
      conditions.push(`log_level = '${level.toUpperCase()}'`);
    }
    
    // Support incremental fetching for streaming
    if (sinceLogId) {
      conditions.push(`log_id > ${parseInt(sinceLogId)}`);
    }
    
    const whereClause = conditions.join(' AND ');

    // Get total count (always count all logs, not just since sinceLogId)
    const countWhereClause = level && level !== 'all' 
      ? `job_id = '${jobId}'::uuid AND log_level = '${level.toUpperCase()}'`
      : `job_id = '${jobId}'::uuid`;
      
    const countResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM ${schema}.dc_job_log WHERE ${countWhereClause}
    `) as { count: bigint }[];
    
    const totalCount = Number(countResult[0]?.count || 0);

    // Get logs - when using sinceLogId, don't paginate, just get all new logs
    let query: string;
    if (sinceLogId) {
      query = `
        SELECT log_id, job_id, log_ts, log_level, thread_name, message, context
        FROM ${schema}.dc_job_log
        WHERE ${whereClause}
        ORDER BY log_ts, log_id
        LIMIT 100
      `;
    } else {
      query = `
        SELECT log_id, job_id, log_ts, log_level, thread_name, message, context
        FROM ${schema}.dc_job_log
        WHERE ${whereClause}
        ORDER BY log_ts, log_id
        LIMIT ${pageSize} OFFSET ${offset}
      `;
    }
    
    const logs = await prisma.$queryRawUnsafe(query) as LogEntry[];

    return NextResponse.json({
      logs: serializeBigInt(logs),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    console.error('Failed to fetch job logs:', error);
    return NextResponse.json({ error: 'Failed to fetch job logs' }, { status: 500 });
  }
}

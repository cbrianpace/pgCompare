import { NextRequest, NextResponse } from 'next/server';
import { getPrisma, getSchema } from '@/lib/db';

interface ConnectionTestResult {
  success: boolean;
  connectionType: string;
  databaseType: string;
  host: string;
  port: number;
  database: string;
  schema: string;
  user: string;
  databaseProductName?: string;
  databaseProductVersion?: string;
  errorMessage?: string;
  errorDetail?: string;
  responseTimeMs: number;
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pid = parseInt(id);
    
    const prisma = getPrisma();
    const schema = getSchema();
    
    // Check for available servers
    const servers = await prisma.$queryRawUnsafe(`
      SELECT server_id, server_name
      FROM ${schema}.dc_server
      WHERE status IN ('idle', 'active', 'busy')
        AND last_heartbeat > current_timestamp - interval '2 minutes'
      LIMIT 1
    `) as any[];
    
    if (!servers || servers.length === 0) {
      return NextResponse.json({ 
        error: 'No available pgCompare servers found. Please start a server with: pgcompare server',
        success: false,
      }, { status: 503 });
    }
    
    // Submit the job
    const jobResult = await prisma.$queryRawUnsafe(`
      INSERT INTO ${schema}.dc_job (pid, job_type, priority, batch_nbr, created_by)
      VALUES ($1, 'test-connection', 10, 0, 'ui')
      RETURNING job_id
    `, pid) as any[];
    
    if (!jobResult || jobResult.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to submit test-connection job',
        success: false,
      }, { status: 500 });
    }
    
    const jobId = jobResult[0].job_id;
    const pollIntervalMs = 500;
    
    // Poll until job completes, fails, or no servers available
    while (true) {
      // Check job status
      const jobStatus = await prisma.$queryRawUnsafe(`
        SELECT status, result_summary, error_message, assigned_server_id
        FROM ${schema}.dc_job
        WHERE job_id = $1::uuid
      `, jobId) as any[];
      
      if (jobStatus && jobStatus.length > 0) {
        const job = jobStatus[0];
        
        // Job completed successfully
        if (job.status === 'completed') {
          let serverName = 'unknown';
          if (job.assigned_server_id) {
            const serverInfo = await prisma.$queryRawUnsafe(`
              SELECT server_name FROM ${schema}.dc_server WHERE server_id = $1::uuid
            `, job.assigned_server_id) as any[];
            if (serverInfo && serverInfo.length > 0) {
              serverName = serverInfo[0].server_name;
            }
          }
          
          const results = job.result_summary || {};
          const allSuccess = Object.values(results).every((r: any) => r?.success);
          
          return NextResponse.json(serializeBigInt({
            success: allSuccess,
            results,
            serverUsed: { name: serverName },
            jobId,
          }));
        }
        
        // Job failed
        if (job.status === 'failed') {
          return NextResponse.json({ 
            error: job.error_message || 'Job failed',
            success: false,
            jobId,
          }, { status: 500 });
        }
        
        // Job cancelled
        if (job.status === 'cancelled') {
          return NextResponse.json({ 
            error: 'Job was cancelled',
            success: false,
            jobId,
          }, { status: 500 });
        }
      }
      
      // Check if servers are still available (only if job is still pending)
      const jobPending = jobStatus?.[0]?.status === 'pending';
      if (jobPending) {
        const activeServers = await prisma.$queryRawUnsafe(`
          SELECT COUNT(*) as cnt
          FROM ${schema}.dc_server
          WHERE status IN ('idle', 'active', 'busy')
            AND last_heartbeat > current_timestamp - interval '2 minutes'
        `) as any[];
        
        if (!activeServers || activeServers.length === 0 || Number(activeServers[0].cnt) === 0) {
          // Cancel the pending job since no servers are available
          await prisma.$queryRawUnsafe(`
            UPDATE ${schema}.dc_job 
            SET status = 'cancelled', error_message = 'No servers available to process job'
            WHERE job_id = $1::uuid AND status = 'pending'
          `, jobId);
          
          return NextResponse.json({ 
            error: 'No pgCompare servers available to process the job. All servers have gone offline.',
            success: false,
            jobId,
          }, { status: 503 });
        }
      }
      
      // If job is running, check if the assigned server is still alive
      if (jobStatus?.[0]?.status === 'running' && jobStatus?.[0]?.assigned_server_id) {
        const assignedServer = await prisma.$queryRawUnsafe(`
          SELECT server_id, status, last_heartbeat
          FROM ${schema}.dc_server
          WHERE server_id = $1::uuid
        `, jobStatus[0].assigned_server_id) as any[];
        
        if (assignedServer && assignedServer.length > 0) {
          const server = assignedServer[0];
          const lastHeartbeat = new Date(server.last_heartbeat);
          const now = new Date();
          const secondsSinceHeartbeat = (now.getTime() - lastHeartbeat.getTime()) / 1000;
          
          // If server hasn't sent heartbeat in 2+ minutes, it's probably dead
          if (secondsSinceHeartbeat > 120 || server.status === 'terminated' || server.status === 'offline') {
            // Mark job as failed
            await prisma.$queryRawUnsafe(`
              UPDATE ${schema}.dc_job 
              SET status = 'failed', error_message = 'Assigned server went offline during job execution'
              WHERE job_id = $1::uuid AND status = 'running'
            `, jobId);
            
            return NextResponse.json({ 
              error: 'The server processing this job went offline.',
              success: false,
              jobId,
            }, { status: 503 });
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    
  } catch (error: any) {
    console.error('Error testing connections:', error);
    return NextResponse.json({ 
      error: error.message,
      success: false,
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const servers = await prisma.$queryRaw`
      SELECT 
        server_id,
        server_name,
        server_host,
        server_pid::int as server_pid,
        status,
        registered_at,
        last_heartbeat,
        current_job_id,
        server_config,
        EXTRACT(EPOCH FROM (current_timestamp - last_heartbeat))::float as seconds_since_heartbeat
      FROM dc_server
      WHERE status != 'terminated'
      ORDER BY 
        CASE status 
          WHEN 'busy' THEN 1 
          WHEN 'idle' THEN 2 
          WHEN 'active' THEN 3
          WHEN 'offline' THEN 4
        END,
        last_heartbeat DESC
    `;
    
    return NextResponse.json(servers);
  } catch (error) {
    console.error('Failed to fetch servers:', error);
    return NextResponse.json({ error: 'Failed to fetch servers' }, { status: 500 });
  }
}

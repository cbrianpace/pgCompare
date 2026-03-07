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
  try {
    const { id: tid } = await params;
    const { searchParams } = new URL(request.url);
    const cid = searchParams.get('cid');
    
    const prisma = getPrisma();
    const schema = getSchema();
    
    let sourceRows: any[] = [];
    let targetRows: any[] = [];
    let tableName = `Table ${tid}`;
    const tidNum = parseInt(tid);
    
    if (cid) {
      const cidNum = parseInt(cid);
      
      // Verify this cid matches the tid and get table name
      const resultInfo = await prisma.$queryRawUnsafe(`
        SELECT table_name, tid FROM ${schema}.dc_result WHERE cid = $1
      `, cidNum) as any[];
      
      // Convert BigInt to Number for comparison
      if (resultInfo && resultInfo.length > 0 && Number(resultInfo[0].tid) === tidNum) {
        tableName = resultInfo[0].table_name || tableName;
        
        // Get out-of-sync rows from dc_source/dc_target
        sourceRows = await prisma.$queryRawUnsafe(`
          SELECT 
            pk, 
            pk_hash, 
            column_hash, 
            compare_result, 
            thread_nbr,
            table_name,
            batch_nbr
          FROM ${schema}.dc_source
          WHERE tid = $1
            AND compare_result IN ('n', 'm')
          ORDER BY pk_hash
          LIMIT 1000
        `, tidNum) as any[];
        
        targetRows = await prisma.$queryRawUnsafe(`
          SELECT 
            pk, 
            pk_hash, 
            column_hash, 
            compare_result, 
            thread_nbr,
            table_name,
            batch_nbr
          FROM ${schema}.dc_target
          WHERE tid = $1
            AND compare_result IN ('n', 'm')
          ORDER BY pk_hash
          LIMIT 1000
        `, tidNum) as any[];
      }
    } else {
      // No cid - get latest data (backward compatible)
      sourceRows = await prisma.$queryRawUnsafe(`
        SELECT 
          pk, 
          pk_hash, 
          column_hash, 
          compare_result, 
          thread_nbr,
          table_name,
          batch_nbr
        FROM ${schema}.dc_source
        WHERE tid = $1
          AND compare_result IN ('n', 'm')
        ORDER BY pk_hash
        LIMIT 1000
      `, tidNum) as any[];
      
      targetRows = await prisma.$queryRawUnsafe(`
        SELECT 
          pk, 
          pk_hash, 
          column_hash, 
          compare_result, 
          thread_nbr,
          table_name,
          batch_nbr
        FROM ${schema}.dc_target
        WHERE tid = $1
          AND compare_result IN ('n', 'm')
        ORDER BY pk_hash
        LIMIT 1000
      `, tidNum) as any[];

      const tableInfo = await prisma.$queryRawUnsafe(`
        SELECT table_alias FROM ${schema}.dc_table WHERE tid = $1
      `, tidNum) as any[];
      
      tableName = tableInfo?.[0]?.table_alias || tableName;
    }
    
    return NextResponse.json(serializeBigInt({
      source: sourceRows,
      target: targetRows,
      tableName,
    }));
  } catch (error: any) {
    console.error('Error fetching out-of-sync data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

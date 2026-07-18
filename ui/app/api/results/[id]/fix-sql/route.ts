import { NextRequest, NextResponse } from 'next/server';
import { getPrisma, getSchema } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cid = parseInt(id);
    
    if (isNaN(cid)) {
      return NextResponse.json({ error: 'Invalid result ID' }, { status: 400 });
    }
    
    const prisma = getPrisma();
    const schema = getSchema();
    
    const result = await prisma.$queryRawUnsafe(`
      SELECT tid FROM ${schema}.dc_result WHERE cid = $1
    `, cid) as any[];
    
    if (result.length === 0) {
      return NextResponse.json([]);
    }
    
    const tid = Number(result[0].tid);
    
    const sourceFixSql = await prisma.$queryRawUnsafe(`
      SELECT tid, pk, pk_hash, compare_result, fix_sql, 'insert' as fix_type
      FROM ${schema}.dc_source
      WHERE tid = $1 AND fix_sql IS NOT NULL
    `, tid) as any[];
    
    const targetFixSql = await prisma.$queryRawUnsafe(`
      SELECT tid, pk, pk_hash, compare_result, fix_sql, 'delete' as fix_type
      FROM ${schema}.dc_target
      WHERE tid = $1 AND fix_sql IS NOT NULL
    `, tid) as any[];
    
    const allFixSql = [...sourceFixSql, ...targetFixSql];
    
    const converted = allFixSql.map((stmt: any) => ({
      tid: stmt.tid ? Number(stmt.tid) : null,
      cid: cid,
      pk: stmt.pk,
      pk_hash: stmt.pk_hash,
      compare_result: stmt.compare_result,
      fix_type: stmt.fix_type,
      fix_sql: stmt.fix_sql,
    }));
    
    return NextResponse.json(converted);
  } catch (error: any) {
    console.error('Error fetching fix SQL:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

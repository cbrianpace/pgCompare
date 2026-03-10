import { NextRequest, NextResponse } from 'next/server';
import { getPrisma, getSchema } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tid = parseInt(id);
    
    if (isNaN(tid)) {
      return NextResponse.json({ error: 'Invalid table ID' }, { status: 400 });
    }
    
    const prisma = getPrisma();
    const schema = getSchema();
    
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tid = parseInt(id);
    
    if (isNaN(tid)) {
      return NextResponse.json({ error: 'Invalid table ID' }, { status: 400 });
    }
    
    const prisma = getPrisma();
    const schema = getSchema();
    
    await prisma.$executeRawUnsafe(`
      UPDATE ${schema}.dc_source SET fix_sql = NULL WHERE tid = $1
    `, tid);
    await prisma.$executeRawUnsafe(`
      UPDATE ${schema}.dc_target SET fix_sql = NULL WHERE tid = $1
    `, tid);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error clearing fix SQL:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getPrisma, getSchema } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prisma = getPrisma();
    
    const tables = await prisma.dc_table.findMany({
      where: {
        pid: BigInt(id),
      },
      orderBy: {
        table_alias: 'asc',
      },
    });
    
    // Convert BigInt to number for JSON serialization
    const converted = tables.map(table => ({
      ...table,
      tid: Number(table.tid),
      pid: Number(table.pid),
    }));
    
    return NextResponse.json(converted);
  } catch (error: any) {
    console.error('Error fetching tables:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const prisma = getPrisma();
    const schema = getSchema();
    const body = await request.json();

    const {
      table_alias,
      enabled = true,
      batch_nbr = 0,
      parallel_degree = 4,
      source_schema,
      source_table,
      target_schema,
      target_table,
      source_schema_preserve_case = false,
      source_table_preserve_case = false,
      target_schema_preserve_case = false,
      target_table_preserve_case = false,
    } = body;

    if (!table_alias) {
      return NextResponse.json({ error: 'table_alias is required' }, { status: 400 });
    }

    // Create the table entry and get the generated tid
    const tableResult = await prisma.$queryRawUnsafe(`
      INSERT INTO ${schema}.dc_table (pid, table_alias, enabled, batch_nbr, parallel_degree)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING tid
    `, BigInt(projectId), table_alias, enabled, batch_nbr, parallel_degree) as { tid: bigint }[];

    if (!tableResult || tableResult.length === 0) {
      throw new Error('Failed to create table');
    }

    const tid = tableResult[0].tid;

    // Create source table map if provided
    if (source_schema && source_table) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO ${schema}.dc_table_map (tid, dest_type, schema_name, table_name, schema_preserve_case, table_preserve_case)
        VALUES ($1, 'source', $2, $3, $4, $5)
      `, tid, source_schema, source_table, source_schema_preserve_case, source_table_preserve_case);
    }

    // Create target table map if provided
    if (target_schema && target_table) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO ${schema}.dc_table_map (tid, dest_type, schema_name, table_name, schema_preserve_case, table_preserve_case)
        VALUES ($1, 'target', $2, $3, $4, $5)
      `, tid, target_schema, target_table, target_schema_preserve_case, target_table_preserve_case);
    }

    return NextResponse.json({
      tid: Number(tid),
      pid: Number(projectId),
      table_alias,
      enabled,
      batch_nbr,
      parallel_degree,
    });
  } catch (error: any) {
    console.error('Error creating table:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/*
 * Copyright 2012-2025 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.crunchydata.service;

import com.crunchydata.core.database.SQLExecutionHelper;
import com.crunchydata.model.yaml.*;
import com.crunchydata.util.LoggingUtils;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.TypeDescription;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.Constructor;

import java.io.FileInputStream;
import java.io.IOException;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

public class MappingImportService {

    private static final String THREAD_NAME = "mapping-import";

    private static final String SQL_CHECK_TABLE_EXISTS = """
            SELECT tid FROM dc_table WHERE pid = ? AND table_alias = ?
            """;

    private static final String SQL_DELETE_TABLE = """
            DELETE FROM dc_table WHERE tid = ?
            """;

    private static final String SQL_INSERT_TABLE = """
            INSERT INTO dc_table (pid, table_alias, enabled, batch_nbr, parallel_degree)
            VALUES (?, ?, ?, ?, ?)
            RETURNING tid
            """;

    private static final String SQL_INSERT_TABLE_MAP = """
            INSERT INTO dc_table_map (tid, dest_type, schema_name, table_name,
                                      schema_preserve_case, table_preserve_case)
            VALUES (?, ?, ?, ?, ?, ?)
            """;

    private static final String SQL_INSERT_COLUMN = """
            INSERT INTO dc_table_column (tid, column_alias, enabled)
            VALUES (?, ?, ?)
            RETURNING column_id
            """;

    private static final String SQL_INSERT_COLUMN_MAP = """
            INSERT INTO dc_table_column_map (tid, column_id, column_origin, column_name, 
                                             data_type, data_class, data_length, number_precision,
                                             number_scale, column_nullable, column_primarykey,
                                             map_expression, supported, preserve_case)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;

    public static ImportResult importFromYaml(Connection conn, Integer pid, String inputFile, 
                                               boolean overwrite, String tableFilter) throws IOException, SQLException {
        LoggingUtils.write("info", THREAD_NAME, String.format("Importing mappings from %s to project %d (overwrite=%s)", 
                inputFile, pid, overwrite));

        LoaderOptions loaderOptions = new LoaderOptions();
        loaderOptions.setTagInspector(tag -> tag.getClassName().startsWith("com.crunchydata.model.yaml."));
        Constructor constructor = new Constructor(MappingExport.class, loaderOptions);
        constructor.addTypeDescription(new TypeDescription(MappingExport.class, "tag:yaml.org,2002:com.crunchydata.model.yaml.MappingExport"));
        Yaml yaml = new Yaml(constructor);

        MappingExport mappingExport;
        try (FileInputStream fis = new FileInputStream(inputFile)) {
            mappingExport = yaml.load(fis);
        }

        if (mappingExport == null || mappingExport.getTables() == null) {
            throw new IllegalArgumentException("Invalid or empty YAML file: " + inputFile);
        }

        int tablesAdded = 0;
        int tablesUpdated = 0;
        int tablesSkipped = 0;
        int columnsProcessed = 0;

        for (TableDefinition tableDef : mappingExport.getTables()) {
            if (tableFilter != null && !tableFilter.isEmpty()) {
                String pattern = tableFilter.replace("*", ".*");
                if (!tableDef.getAlias().matches(pattern)) {
                    tablesSkipped++;
                    continue;
                }
            }

            Integer existingTid = getExistingTableId(conn, pid, tableDef.getAlias());

            if (existingTid != null) {
                if (overwrite) {
                    deleteTable(conn, existingTid);
                    Integer newTid = insertTable(conn, pid, tableDef);
                    insertTableMaps(conn, newTid, tableDef);
                    columnsProcessed += insertColumns(conn, newTid, tableDef.getColumns());
                    tablesUpdated++;
                    LoggingUtils.write("info", THREAD_NAME, String.format("Updated table: %s", tableDef.getAlias()));
                } else {
                    LoggingUtils.write("warning", THREAD_NAME, 
                            String.format("Skipping existing table '%s' (use --overwrite to replace)", tableDef.getAlias()));
                    tablesSkipped++;
                }
            } else {
                Integer newTid = insertTable(conn, pid, tableDef);
                insertTableMaps(conn, newTid, tableDef);
                columnsProcessed += insertColumns(conn, newTid, tableDef.getColumns());
                tablesAdded++;
                LoggingUtils.write("info", THREAD_NAME, String.format("Added table: %s", tableDef.getAlias()));
            }
        }

        conn.commit();

        ImportResult result = new ImportResult(tablesAdded, tablesUpdated, tablesSkipped, columnsProcessed);
        LoggingUtils.write("info", THREAD_NAME, String.format("Import complete: %d added, %d updated, %d skipped, %d columns", 
                tablesAdded, tablesUpdated, tablesSkipped, columnsProcessed));

        return result;
    }

    private static Integer getExistingTableId(Connection conn, Integer pid, String tableAlias) {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(pid);
        binds.add(tableAlias.toLowerCase());
        return SQLExecutionHelper.simpleSelectReturnInteger(conn, SQL_CHECK_TABLE_EXISTS, binds);
    }

    private static void deleteTable(Connection conn, Integer tid) {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(tid);
        SQLExecutionHelper.simpleUpdate(conn, SQL_DELETE_TABLE, binds, true);
    }

    private static Integer insertTable(Connection conn, Integer pid, TableDefinition tableDef) {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(pid);
        binds.add(tableDef.getAlias().toLowerCase());
        binds.add(tableDef.getEnabled() != null ? tableDef.getEnabled() : true);
        binds.add(tableDef.getBatchNumber() != null ? tableDef.getBatchNumber() : 1);
        binds.add(tableDef.getParallelDegree() != null ? tableDef.getParallelDegree() : 1);

        return SQLExecutionHelper.simpleUpdateReturningInteger(conn, SQL_INSERT_TABLE, binds);
    }

    private static void insertTableMaps(Connection conn, Integer tid, TableDefinition tableDef) {
        if (tableDef.getSource() != null) {
            insertTableMap(conn, tid, "source", tableDef.getSource());
        }
        if (tableDef.getTarget() != null) {
            insertTableMap(conn, tid, "target", tableDef.getTarget());
        }
    }

    private static void insertTableMap(Connection conn, Integer tid, String destType, TableLocation loc) {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(tid);
        binds.add(destType);
        binds.add(loc.getSchema());
        binds.add(loc.getTable());
        binds.add(loc.getSchemaPreserveCase() != null ? loc.getSchemaPreserveCase() : false);
        binds.add(loc.getTablePreserveCase() != null ? loc.getTablePreserveCase() : false);

        SQLExecutionHelper.simpleUpdate(conn, SQL_INSERT_TABLE_MAP, binds, true);
    }

    private static int insertColumns(Connection conn, Integer tid, List<ColumnDefinition> columns) {
        if (columns == null) return 0;

        int count = 0;
        for (ColumnDefinition colDef : columns) {
            Integer columnId = insertColumn(conn, tid, colDef);
            if (colDef.getSource() != null) {
                insertColumnMap(conn, tid, columnId, "source", colDef.getSource());
            }
            if (colDef.getTarget() != null) {
                insertColumnMap(conn, tid, columnId, "target", colDef.getTarget());
            }
            count++;
        }
        return count;
    }

    private static Integer insertColumn(Connection conn, Integer tid, ColumnDefinition colDef) {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(tid);
        binds.add(colDef.getAlias().toLowerCase());
        binds.add(colDef.getEnabled() != null ? colDef.getEnabled() : true);

        return SQLExecutionHelper.simpleUpdateReturningInteger(conn, SQL_INSERT_COLUMN, binds);
    }

    private static void insertColumnMap(Connection conn, Integer tid, Integer columnId, 
                                         String origin, ColumnMapping mapping) {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(tid);
        binds.add(columnId);
        binds.add(origin);
        binds.add(mapping.getColumnName());
        binds.add(mapping.getDataType());
        binds.add(mapping.getDataClass() != null ? mapping.getDataClass() : "string");
        binds.add(mapping.getDataLength());
        binds.add(mapping.getNumberPrecision());
        binds.add(mapping.getNumberScale());
        binds.add(mapping.getNullable() != null ? mapping.getNullable() : true);
        binds.add(mapping.getPrimaryKey() != null ? mapping.getPrimaryKey() : false);
        binds.add(mapping.getMapExpression());
        binds.add(mapping.getSupported() != null ? mapping.getSupported() : true);
        binds.add(mapping.getPreserveCase() != null ? mapping.getPreserveCase() : false);

        SQLExecutionHelper.simpleUpdate(conn, SQL_INSERT_COLUMN_MAP, binds, true);
    }

    public record ImportResult(int tablesAdded, int tablesUpdated, int tablesSkipped, int columnsProcessed) {}
}

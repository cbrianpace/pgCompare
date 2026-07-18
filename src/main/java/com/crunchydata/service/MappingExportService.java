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
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.introspector.Property;
import org.yaml.snakeyaml.nodes.NodeTuple;
import org.yaml.snakeyaml.nodes.Tag;
import org.yaml.snakeyaml.representer.Representer;

import javax.sql.rowset.CachedRowSet;
import java.io.FileWriter;
import java.io.IOException;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

public class MappingExportService {

    private static final String THREAD_NAME = "mapping-export";
    private static final String VERSION = "1.0";

    private static final String SQL_SELECT_TABLES = """
            SELECT t.tid, t.table_alias, t.enabled, t.batch_nbr, t.parallel_degree
            FROM dc_table t
            WHERE t.pid = ?
            ORDER BY t.table_alias
            """;

    private static final String SQL_SELECT_TABLES_FILTERED = """
            SELECT t.tid, t.table_alias, t.enabled, t.batch_nbr, t.parallel_degree
            FROM dc_table t
            WHERE t.pid = ?
              AND t.table_alias LIKE ?
            ORDER BY t.table_alias
            """;

    private static final String SQL_SELECT_TABLE_MAP = """
            SELECT dest_type, schema_name, table_name, schema_preserve_case, table_preserve_case
            FROM dc_table_map
            WHERE tid = ?
            """;

    private static final String SQL_SELECT_COLUMNS = """
            SELECT tc.column_id, tc.column_alias, tc.enabled
            FROM dc_table_column tc
            WHERE tc.tid = ?
            ORDER BY tc.column_alias
            """;

    private static final String SQL_SELECT_COLUMN_MAP = """
            SELECT column_origin, column_name, data_type, data_class, data_length,
                   number_precision, number_scale, column_nullable, column_primarykey,
                   map_expression, supported, preserve_case
            FROM dc_table_column_map
            WHERE tid = ? AND column_id = ?
            """;

    private static final String SQL_SELECT_PROJECT = """
            SELECT project_name FROM dc_project WHERE pid = ?
            """;

    public static void exportToYaml(Connection conn, Integer pid, String tableFilter, String outputFile) throws IOException, SQLException {
        LoggingUtils.write("info", THREAD_NAME, String.format("Exporting mappings for project %d to %s", pid, outputFile));

        MappingExport export = new MappingExport();
        export.setVersion(VERSION);
        export.setExportDate(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        export.setProjectId(pid);
        export.setProjectName(getProjectName(conn, pid));
        export.setTables(getTables(conn, pid, tableFilter));

        DumperOptions options = new DumperOptions();
        options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        options.setPrettyFlow(true);
        options.setIndent(2);
        options.setIndicatorIndent(2);
        options.setIndentWithIndicator(true);

        Representer representer = new Representer(options) {
            @Override
            protected NodeTuple representJavaBeanProperty(Object javaBean, Property property, Object propertyValue, Tag customTag) {
                if (propertyValue == null) {
                    return null;
                }
                return super.representJavaBeanProperty(javaBean, property, propertyValue, customTag);
            }
        };
        representer.getPropertyUtils().setSkipMissingProperties(true);
        representer.addClassTag(MappingExport.class, Tag.MAP);

        Yaml yaml = new Yaml(representer, options);

        try (FileWriter writer = new FileWriter(outputFile)) {
            writer.write("# pgCompare Table and Column Mapping Export\n");
            writer.write("# Generated: " + export.getExportDate() + "\n");
            writer.write("# Project: " + export.getProjectName() + " (ID: " + export.getProjectId() + ")\n");
            writer.write("#\n");
            writer.write("# This file can be edited and re-imported using:\n");
            writer.write("#   java -jar pgcompare.jar import-mapping --file <this-file> [--overwrite]\n");
            writer.write("#\n");
            writer.write("# NOTES:\n");
            writer.write("# - 'alias' is the unique identifier that links source and target tables/columns\n");
            writer.write("# - Set 'enabled: false' to exclude a table or column from comparison\n");
            writer.write("# - 'mapExpression' allows custom SQL expressions for column value transformation\n");
            writer.write("# - 'primaryKey: true' marks columns used for row identification\n");
            writer.write("#\n\n");
            yaml.dump(export, writer);
        }

        LoggingUtils.write("info", THREAD_NAME, String.format("Exported %d table(s) to %s", export.getTables().size(), outputFile));
    }

    private static String getProjectName(Connection conn, Integer pid) {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(pid);
        return SQLExecutionHelper.simpleSelectReturnString(conn, SQL_SELECT_PROJECT, binds);
    }

    private static List<TableDefinition> getTables(Connection conn, Integer pid, String tableFilter) throws SQLException {
        List<TableDefinition> tables = new ArrayList<>();

        ArrayList<Object> binds = new ArrayList<>();
        binds.add(pid);

        String sql = SQL_SELECT_TABLES;
        if (tableFilter != null && !tableFilter.isEmpty()) {
            binds.add(tableFilter.replace("*", "%"));
            sql = SQL_SELECT_TABLES_FILTERED;
        }

        CachedRowSet crs = SQLExecutionHelper.simpleSelect(conn, sql, binds);

        while (crs.next()) {
            TableDefinition tableDef = new TableDefinition();
            Integer tid = crs.getInt("tid");
            tableDef.setAlias(crs.getString("table_alias"));
            tableDef.setEnabled(crs.getBoolean("enabled"));
            tableDef.setBatchNumber(crs.getInt("batch_nbr"));
            tableDef.setParallelDegree(crs.getInt("parallel_degree"));

            loadTableLocations(conn, tid, tableDef);
            tableDef.setColumns(getColumns(conn, tid));

            tables.add(tableDef);
        }
        crs.close();

        return tables;
    }

    private static void loadTableLocations(Connection conn, Integer tid, TableDefinition tableDef) throws SQLException {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(tid);

        CachedRowSet crs = SQLExecutionHelper.simpleSelect(conn, SQL_SELECT_TABLE_MAP, binds);

        while (crs.next()) {
            TableLocation loc = new TableLocation();
            loc.setSchema(crs.getString("schema_name"));
            loc.setTable(crs.getString("table_name"));
            loc.setSchemaPreserveCase(crs.getBoolean("schema_preserve_case"));
            loc.setTablePreserveCase(crs.getBoolean("table_preserve_case"));

            String destType = crs.getString("dest_type");
            if ("source".equals(destType)) {
                tableDef.setSource(loc);
            } else {
                tableDef.setTarget(loc);
            }
        }
        crs.close();
    }

    private static List<ColumnDefinition> getColumns(Connection conn, Integer tid) throws SQLException {
        List<ColumnDefinition> columns = new ArrayList<>();

        ArrayList<Object> binds = new ArrayList<>();
        binds.add(tid);

        CachedRowSet crs = SQLExecutionHelper.simpleSelect(conn, SQL_SELECT_COLUMNS, binds);

        while (crs.next()) {
            ColumnDefinition colDef = new ColumnDefinition();
            Integer columnId = crs.getInt("column_id");
            colDef.setAlias(crs.getString("column_alias"));
            colDef.setEnabled(crs.getBoolean("enabled"));

            loadColumnMappings(conn, tid, columnId, colDef);
            columns.add(colDef);
        }
        crs.close();

        return columns;
    }

    private static void loadColumnMappings(Connection conn, Integer tid, Integer columnId, ColumnDefinition colDef) throws SQLException {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(tid);
        binds.add(columnId);

        CachedRowSet crs = SQLExecutionHelper.simpleSelect(conn, SQL_SELECT_COLUMN_MAP, binds);

        while (crs.next()) {
            ColumnMapping mapping = new ColumnMapping();
            mapping.setColumnName(crs.getString("column_name"));
            mapping.setDataType(crs.getString("data_type"));
            mapping.setDataClass(crs.getString("data_class"));
            mapping.setDataLength(crs.getObject("data_length") != null ? crs.getInt("data_length") : null);
            mapping.setNumberPrecision(crs.getObject("number_precision") != null ? crs.getInt("number_precision") : null);
            mapping.setNumberScale(crs.getObject("number_scale") != null ? crs.getInt("number_scale") : null);
            mapping.setNullable(crs.getBoolean("column_nullable"));
            mapping.setPrimaryKey(crs.getBoolean("column_primarykey"));
            mapping.setMapExpression(crs.getString("map_expression"));
            mapping.setSupported(crs.getBoolean("supported"));
            mapping.setPreserveCase(crs.getBoolean("preserve_case"));

            String origin = crs.getString("column_origin");
            if ("source".equals(origin)) {
                colDef.setSource(mapping);
            } else {
                colDef.setTarget(mapping);
            }
        }
        crs.close();
    }
}

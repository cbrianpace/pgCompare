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
import com.crunchydata.model.DataComparisonResult;
import com.crunchydata.model.DataComparisonTableMap;
import com.crunchydata.util.LoggingUtils;
import org.json.JSONArray;
import org.json.JSONObject;

import javax.sql.rowset.CachedRowSet;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Objects;

import static com.crunchydata.service.DatabaseMetadataService.getQuoteChar;
import static com.crunchydata.util.DataProcessingUtils.ShouldQuoteString;
import static com.crunchydata.config.Settings.Props;

/**
 * Service class for generating SQL statements to fix data synchronization issues.
 * This service generates INSERT, UPDATE, and DELETE statements to make the target
 * database match the source database.
 * 
 * @author Brian Pace
 */
public class SQLFixGenerationService {
    
    private static final String THREAD_NAME = "sql-generation";
    
    // Constants for comparison results
    private static final int MISSING_TARGET_FLAG = 1;
    private static final int MISSING_SOURCE_FLAG = 1;
    
    /**
     * Generates SQL fix statement based on the row comparison result.
     * 
     * @param sourceConn Source database connection
     * @param targetConn Target database connection
     * @param dctmSource Source table mapping
     * @param dctmTarget Target table mapping
     * @param binds Bind parameters for the primary key WHERE clause
     * @param dcRow Data comparison result row
     * @param rowResult Result object from reCheck containing comparison details
     * @return SQL statement to fix the discrepancy, or null if no fix needed
     */
    public static String generateFixSQL(Connection sourceConn, Connection targetConn, 
                                       DataComparisonTableMap dctmSource, DataComparisonTableMap dctmTarget,
                                       ArrayList<Object> binds, DataComparisonResult dcRow, 
                                       JSONObject rowResult, CachedRowSet sourceRow, CachedRowSet targetRow, JSONObject columnMapping) {
        // Validate inputs
        Objects.requireNonNull(dctmTarget, "Target table map cannot be null");
        Objects.requireNonNull(dcRow, "Data comparison row cannot be null");
        Objects.requireNonNull(rowResult, "Row result cannot be null");
        
        try {
            // Extract primary key JSON
            JSONObject pk = new JSONObject(dcRow.getPk());
            
            // Determine the type of fix needed based on rowResult
            if (isMissingSource(rowResult)) {
                // Row exists on target but not on source -> DELETE from target
                return generateDeleteSQL(dctmTarget, pk);
                
            } else if (isMissingTarget(rowResult)) {
                // Row exists on source but not on target -> INSERT into target
                return generateInsertSQL(sourceConn, dctmSource, dctmTarget, binds, pk, sourceRow, columnMapping);
                
            } else if (isNotEqual(rowResult)) {
                // Row exists on both but columns don't match -> UPDATE target
                return generateUpdateSQL(sourceConn, targetConn, dctmSource, dctmTarget, 
                                       binds, pk, rowResult, columnMapping);
            }
            
        } catch (Exception e) {
            LoggingUtils.write("severe", THREAD_NAME, 
                String.format("Error generating fix SQL for pk %s: %s", dcRow.getPk(), e.getMessage()));
        }
        
        return null;
    }
    
    /**
     * Checks if the row is missing from the source database.
     * 
     * @param rowResult Row result from reCheck
     * @return true if row is missing from source
     */
    private static boolean isMissingSource(JSONObject rowResult) {
        return rowResult.has("missingSource") && 
               rowResult.getInt("missingSource") == MISSING_SOURCE_FLAG;
    }
    
    /**
     * Checks if the row is missing from the target database.
     * 
     * @param rowResult Row result from reCheck
     * @return true if row is missing from target
     */
    private static boolean isMissingTarget(JSONObject rowResult) {
        return rowResult.has("missingTarget") && 
               rowResult.getInt("missingTarget") == MISSING_TARGET_FLAG;
    }
    
    /**
     * Checks if the row exists in both databases but with different values.
     * 
     * @param rowResult Row result from reCheck
     * @return true if row exists in both but values don't match
     */
    private static boolean isNotEqual(JSONObject rowResult) {
        return rowResult.has("notEqual") && rowResult.getInt("notEqual") == 1;
    }
    
    /**
     * Generates a DELETE statement for the target database.
     * 
     * @param dctmTarget Target table mapping
     * @param pk Primary key JSONObject
     * @return DELETE SQL statement
     */
    private static String generateDeleteSQL(DataComparisonTableMap dctmTarget, JSONObject pk) {
        String quoteChar = getQuoteChar(Props.getProperty("target-type"));
        
        // Build table name
        String schemaName = ShouldQuoteString(dctmTarget.isSchemaPreserveCase(), 
                                             dctmTarget.getSchemaName(), quoteChar);
        String tableName = ShouldQuoteString(dctmTarget.isTablePreserveCase(), 
                                            dctmTarget.getTableName(), quoteChar);
        
        StringBuilder sql = new StringBuilder("DELETE FROM ");
        sql.append(schemaName).append(".").append(tableName);
        sql.append(" WHERE ");
        sql.append(buildWhereClause(pk, quoteChar));
        sql.append(";");

        return sql.toString();
    }
    
    /**
     * Generates an INSERT statement for the target database.
     * 
     * @param sourceConn Source database connection
     * @param dctmSource Source table mapping
     * @param dctmTarget Target table mapping
     * @param binds Bind parameters for the WHERE clause
     * @param pk Primary key JSONObject
     * @return INSERT SQL statement
     */
    private static String generateInsertSQL(Connection sourceConn, DataComparisonTableMap dctmSource,
                                           DataComparisonTableMap dctmTarget, ArrayList<Object> binds, 
                                           JSONObject pk, CachedRowSet sourceRow, JSONObject columnMapping) {
        try {
            String targetQuoteChar = getQuoteChar(Props.getProperty("target-type"));

            if (sourceRow == null || sourceRow.size() == 0) {
                LoggingUtils.write("warning", THREAD_NAME, 
                    String.format("No source row found for INSERT, pk: %s", pk.toString()));
                return null;
            }
            
            sourceRow.next();
            
            // Parse column mapping to get source and target column information
            JSONArray columns = columnMapping.getJSONArray("columns");
            
            // Build column list and values using the mapping
            List<String> columnNames = new ArrayList<>();
            List<String> columnValues = new ArrayList<>();
            
            // Build INSERT statement
            String schemaName = ShouldQuoteString(dctmTarget.isSchemaPreserveCase(),
                    dctmTarget.getSchemaName(), targetQuoteChar);
            String tableName = ShouldQuoteString(dctmTarget.isTablePreserveCase(),
                    dctmTarget.getTableName(), targetQuoteChar);

            // First, add primary key columns from the pk JSONObject
            Iterator<String> pkKeys = pk.keys();
            while (pkKeys.hasNext()) {
                String sourcePKColumnName = pkKeys.next();
                
                // Find this source column in the mapping to get the target column name
                String targetPKColumnName = null;
                boolean targetPreserveCase = false;
                
                for (int i = 0; i < columns.length(); i++) {
                    JSONObject columnDef = columns.getJSONObject(i);
                    JSONObject sourceCol = columnDef.getJSONObject("source");
                    
                    if (sourceCol.getString("columnName").equalsIgnoreCase(sourcePKColumnName)) {
                        JSONObject targetCol = columnDef.getJSONObject("target");
                        targetPKColumnName = targetCol.getString("columnName");
                        targetPreserveCase = targetCol.getBoolean("preserveCase");
                        break;
                    }
                }
                
                if (targetPKColumnName != null) {
                    // Quote target column name for INSERT statement
                    String quotedTargetColumnName = ShouldQuoteString(targetPreserveCase, 
                                                                       targetPKColumnName, 
                                                                       targetQuoteChar);
                    columnNames.add(quotedTargetColumnName);
                    
                    // Get value from pk JSONObject
                    Object pkValue = pk.get(sourcePKColumnName);
                    columnValues.add(formatValue(pkValue));
                } else {
                    LoggingUtils.write("warning", THREAD_NAME, 
                        String.format("Could not find PK column '%s' in column mapping for pk %s", 
                                     sourcePKColumnName, pk));
                }
            }

            // Then, add non-primary key columns from column mapping
            for (int i = 0; i < columns.length(); i++) {
                JSONObject columnDef = columns.getJSONObject(i);
                
                // Skip disabled columns
                if (!columnDef.getBoolean("enabled")) {
                    continue;
                }
                
                // Get source and target column information
                JSONObject sourceCol = columnDef.getJSONObject("source");
                JSONObject targetCol = columnDef.getJSONObject("target");
                
                // Skip primary key columns - they were already added above
                if (sourceCol.getBoolean("primaryKey")) {
                    continue;
                }
                
                String sourceColumnName = sourceCol.getString("columnName");
                String targetColumnName = targetCol.getString("columnName");
                boolean targetPreserveCase = targetCol.getBoolean("preserveCase");
                
                // Quote target column name for INSERT statement based on target's preserveCase
                String quotedTargetColumnName = ShouldQuoteString(targetPreserveCase, 
                                                                   targetColumnName, 
                                                                   targetQuoteChar);
                columnNames.add(quotedTargetColumnName);
                
                // Get value from source row using source column name
                try {
                    Object value = sourceRow.getObject(sourceColumnName);
                    columnValues.add(formatValue(value));
                } catch (SQLException e) {
                    // Try with different case if the column name doesn't match exactly
                    try {
                        Object value = sourceRow.getObject(sourceColumnName.toLowerCase());
                        columnValues.add(formatValue(value));
                    } catch (SQLException e2) {
                        LoggingUtils.write("warning", THREAD_NAME, 
                            String.format("Could not find column '%s' in source result set for pk %s", 
                                         sourceColumnName, pk));
                        columnValues.add("NULL");
                    }
                }
            }
            
            // Build final INSERT statement
            StringBuilder sql = new StringBuilder("INSERT INTO ");
            sql.append(schemaName).append(".").append(tableName);
            sql.append(" (").append(String.join(", ", columnNames)).append(")");
            sql.append(" VALUES (").append(String.join(", ", columnValues)).append(")");
            sql.append(";");

            return sql.toString();
            
        } catch (SQLException e) {
            LoggingUtils.write("severe", THREAD_NAME, 
                String.format("SQL error generating INSERT for pk %s: %s", pk.toString(), e.getMessage()));
            return null;
        } catch (Exception e) {
            LoggingUtils.write("severe", THREAD_NAME, 
                String.format("Error generating INSERT for pk %s: %s", pk.toString(), e.getMessage()));
            return null;
        }
    }
    
    /**
     * Generates an UPDATE statement for the target database.
     * Uses column mapping to correctly map source column names to target column names.
     * 
     * @param sourceConn Source database connection
     * @param targetConn Target database connection
     * @param dctmSource Source table mapping
     * @param dctmTarget Target table mapping
     * @param binds Bind parameters for the WHERE clause
     * @param pk Primary key JSONObject
     * @param rowResult Row result from reCheck containing differences
     * @param columnMapping Column mapping JSON containing source-to-target column mappings
     * @return UPDATE SQL statement
     */
    private static String generateUpdateSQL(Connection sourceConn, Connection targetConn,
                                           DataComparisonTableMap dctmSource, DataComparisonTableMap dctmTarget,
                                           ArrayList<Object> binds, JSONObject pk, JSONObject rowResult,
                                           JSONObject columnMapping) {
        try {
            String targetQuoteChar = getQuoteChar(Props.getProperty("target-type"));
            
            // Fetch the complete row from source
            String selectSQL = dctmSource.getCompareSQL() + dctmSource.getTableFilter();
            CachedRowSet sourceRow = SQLExecutionHelper.simpleSelect(sourceConn, selectSQL, binds);
            
            if (sourceRow == null || sourceRow.size() == 0) {
                LoggingUtils.write("warning", THREAD_NAME, 
                    String.format("No source row found for UPDATE, pk: %s", pk.toString()));
                return null;
            }
            
            sourceRow.next();
            
            // Parse column mapping to get source and target column information
            JSONArray columns = columnMapping.getJSONArray("columns");
            
            // Build SET clause using column mapping for proper name translation
            List<String> setItems = new ArrayList<>();
            
            for (int i = 0; i < columns.length(); i++) {
                JSONObject columnDef = columns.getJSONObject(i);
                
                // Skip disabled columns
                if (!columnDef.getBoolean("enabled")) {
                    continue;
                }
                
                // Get source and target column information
                JSONObject sourceCol = columnDef.getJSONObject("source");
                JSONObject targetCol = columnDef.getJSONObject("target");
                
                // Skip primary key columns - don't update PKs
                if (sourceCol.getBoolean("primaryKey")) {
                    continue;
                }
                
                String sourceColumnName = sourceCol.getString("columnName");
                String targetColumnName = targetCol.getString("columnName");
                boolean targetPreserveCase = targetCol.getBoolean("preserveCase");
                
                // Quote target column name based on target's preserveCase setting
                String quotedTargetColumnName = ShouldQuoteString(targetPreserveCase, 
                                                                   targetColumnName, 
                                                                   targetQuoteChar);
                
                // Get value from source row using source column name
                try {
                    Object value = sourceRow.getObject(sourceColumnName);
                    setItems.add(quotedTargetColumnName + " = " + formatValue(value));
                } catch (SQLException e) {
                    // Try with different case if the column name doesn't match exactly
                    try {
                        Object value = sourceRow.getObject(sourceColumnName.toLowerCase());
                        setItems.add(quotedTargetColumnName + " = " + formatValue(value));
                    } catch (SQLException e2) {
                        LoggingUtils.write("warning", THREAD_NAME, 
                            String.format("Could not find column '%s' in source result set for UPDATE pk %s", 
                                         sourceColumnName, pk));
                    }
                }
            }
            
            if (setItems.isEmpty()) {
                LoggingUtils.write("warning", THREAD_NAME, 
                    String.format("No columns to update for pk: %s", pk.toString()));
                return null;
            }
            
            // Build UPDATE statement
            String schemaName = ShouldQuoteString(dctmTarget.isSchemaPreserveCase(), 
                                                 dctmTarget.getSchemaName(), targetQuoteChar);
            String tableName = ShouldQuoteString(dctmTarget.isTablePreserveCase(), 
                                                dctmTarget.getTableName(), targetQuoteChar);
            
            StringBuilder sql = new StringBuilder("UPDATE ");
            sql.append(schemaName).append(".").append(tableName);
            sql.append(" SET ");
            sql.append(String.join(", ", setItems));
            sql.append(" WHERE ");
            sql.append(buildWhereClause(pk, targetQuoteChar));
            sql.append(";");

            
            return sql.toString();
            
        } catch (SQLException e) {
            LoggingUtils.write("severe", THREAD_NAME, 
                String.format("SQL error generating UPDATE for pk %s: %s", pk.toString(), e.getMessage()));
            return null;
        } catch (Exception e) {
            LoggingUtils.write("severe", THREAD_NAME, 
                String.format("Error generating UPDATE for pk %s: %s", pk.toString(), e.getMessage()));
            return null;
        }
    }
    
    /**
     * Builds a WHERE clause from a primary key JSONObject.
     * Handles NULL values correctly using IS NULL syntax.
     * 
     * @param pk Primary key JSONObject
     * @param quoteChar Quote character for identifiers
     * @return WHERE clause string (without the WHERE keyword)
     */
    private static String buildWhereClause(JSONObject pk, String quoteChar) {
        List<String> whereItems = new ArrayList<>();
        
        Iterator<String> keys = pk.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String cleanKey = key.replace("`", "").replace("\"", "");
            String quotedKey = ShouldQuoteString(false, cleanKey, quoteChar);
            
            Object value = pk.opt(key);
            if (value == null || value == JSONObject.NULL) {
                whereItems.add(quotedKey + " IS NULL");
            } else {
                whereItems.add(quotedKey + " = " + formatValue(value));
            }
        }
        
        return String.join(" AND ", whereItems);
    }
    
    /**
     * Formats a value for SQL statement based on target database type.
     * Handles various data types with proper escaping and database-specific syntax.
     * 
     * @param value Value to format
     * @return Formatted value string suitable for target database
     */
    private static String formatValue(Object value) {
        return formatValueForTarget(value, Props.getProperty("target-type"));
    }
    
    /**
     * Formats a value for SQL statement with explicit target database type.
     * 
     * @param value Value to format
     * @param targetType Target database type (postgres, oracle, mysql, etc.)
     * @return Formatted value string suitable for target database
     */
    private static String formatValueForTarget(Object value, String targetType) {
        if (value == null) {
            return "NULL";
        }
        
        return switch (value) {
            case String s -> formatString(s);
            case Boolean b -> formatBoolean(b, targetType);
            case Integer i -> i.toString();
            case Long l -> l.toString();
            case Double d -> {
                if (d.isNaN()) yield "NULL";
                if (d.isInfinite()) yield "NULL";
                yield d.toString();
            }
            case Float f -> {
                if (f.isNaN()) yield "NULL";
                if (f.isInfinite()) yield "NULL";
                yield f.toString();
            }
            case BigDecimal bd -> bd.toPlainString();
            case Number n -> n.toString();
            case Timestamp ts -> formatTimestamp(ts, targetType);
            case java.sql.Date d -> formatDate(d, targetType);
            case java.sql.Time t -> formatTime(t, targetType);
            case Date d -> formatJavaDate(d, targetType);
            case LocalDateTime ldt -> formatLocalDateTime(ldt, targetType);
            case LocalDate ld -> formatLocalDate(ld, targetType);
            case LocalTime lt -> formatLocalTime(lt, targetType);
            case OffsetDateTime odt -> formatOffsetDateTime(odt, targetType);
            case byte[] bytes -> formatBinary(bytes, targetType);
            default -> {
                String stringValue = value.toString();
                if (stringValue == null || stringValue.isEmpty()) {
                    yield "NULL";
                }
                yield formatString(stringValue);
            }
        };
    }
    
    /**
     * Formats a string value with proper escaping.
     */
    private static String formatString(String value) {
        if (value == null) {
            return "NULL";
        }
        String escaped = value.replace("'", "''");
        escaped = escaped.replace("\\", "\\\\");
        return "'" + escaped + "'";
    }
    
    /**
     * Formats a boolean value for the target database.
     */
    private static String formatBoolean(Boolean value, String targetType) {
        return switch (targetType) {
            case "postgres" -> value ? "TRUE" : "FALSE";
            case "oracle", "db2" -> value ? "1" : "0";
            case "mysql", "mariadb" -> value ? "1" : "0";
            case "mssql" -> value ? "1" : "0";
            case "snowflake" -> value ? "TRUE" : "FALSE";
            default -> value.toString();
        };
    }
    
    /**
     * Formats a Timestamp for the target database.
     */
    private static String formatTimestamp(Timestamp ts, String targetType) {
        String formatted = ts.toString();
        if (formatted.endsWith(".0")) {
            formatted = formatted.substring(0, formatted.length() - 2);
        }
        return switch (targetType) {
            case "oracle" -> String.format("TO_TIMESTAMP('%s', 'YYYY-MM-DD HH24:MI:SS.FF')", formatted);
            case "mssql" -> String.format("CAST('%s' AS DATETIME2)", formatted);
            case "mysql", "mariadb" -> String.format("'%s'", formatted);
            case "snowflake" -> String.format("TO_TIMESTAMP('%s')", formatted);
            default -> String.format("'%s'::timestamp", formatted);
        };
    }
    
    /**
     * Formats a SQL Date for the target database.
     */
    private static String formatDate(java.sql.Date d, String targetType) {
        String formatted = d.toString();
        return switch (targetType) {
            case "oracle" -> String.format("TO_DATE('%s', 'YYYY-MM-DD')", formatted);
            case "mssql" -> String.format("CAST('%s' AS DATE)", formatted);
            case "snowflake" -> String.format("TO_DATE('%s')", formatted);
            default -> String.format("'%s'::date", formatted);
        };
    }
    
    /**
     * Formats a SQL Time for the target database.
     */
    private static String formatTime(java.sql.Time t, String targetType) {
        String formatted = t.toString();
        return switch (targetType) {
            case "oracle" -> String.format("TO_TIMESTAMP('%s', 'HH24:MI:SS')", formatted);
            case "mssql" -> String.format("CAST('%s' AS TIME)", formatted);
            case "snowflake" -> String.format("TO_TIME('%s')", formatted);
            default -> String.format("'%s'::time", formatted);
        };
    }
    
    /**
     * Formats a Java Date for the target database.
     */
    private static String formatJavaDate(Date d, String targetType) {
        java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        String formatted = sdf.format(d);
        return switch (targetType) {
            case "oracle" -> String.format("TO_TIMESTAMP('%s', 'YYYY-MM-DD HH24:MI:SS')", formatted);
            case "mssql" -> String.format("CAST('%s' AS DATETIME2)", formatted);
            case "snowflake" -> String.format("TO_TIMESTAMP('%s')", formatted);
            default -> String.format("'%s'::timestamp", formatted);
        };
    }
    
    /**
     * Formats a LocalDateTime for the target database.
     */
    private static String formatLocalDateTime(LocalDateTime ldt, String targetType) {
        String formatted = ldt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        return switch (targetType) {
            case "oracle" -> String.format("TO_TIMESTAMP('%s', 'YYYY-MM-DD HH24:MI:SS')", formatted);
            case "mssql" -> String.format("CAST('%s' AS DATETIME2)", formatted);
            case "snowflake" -> String.format("TO_TIMESTAMP('%s')", formatted);
            default -> String.format("'%s'::timestamp", formatted);
        };
    }
    
    /**
     * Formats a LocalDate for the target database.
     */
    private static String formatLocalDate(LocalDate ld, String targetType) {
        String formatted = ld.format(DateTimeFormatter.ISO_LOCAL_DATE);
        return switch (targetType) {
            case "oracle" -> String.format("TO_DATE('%s', 'YYYY-MM-DD')", formatted);
            case "mssql" -> String.format("CAST('%s' AS DATE)", formatted);
            case "snowflake" -> String.format("TO_DATE('%s')", formatted);
            default -> String.format("'%s'::date", formatted);
        };
    }
    
    /**
     * Formats a LocalTime for the target database.
     */
    private static String formatLocalTime(LocalTime lt, String targetType) {
        String formatted = lt.format(DateTimeFormatter.ISO_LOCAL_TIME);
        return switch (targetType) {
            case "oracle" -> String.format("TO_TIMESTAMP('%s', 'HH24:MI:SS')", formatted);
            case "mssql" -> String.format("CAST('%s' AS TIME)", formatted);
            case "snowflake" -> String.format("TO_TIME('%s')", formatted);
            default -> String.format("'%s'::time", formatted);
        };
    }
    
    /**
     * Formats an OffsetDateTime for the target database.
     */
    private static String formatOffsetDateTime(OffsetDateTime odt, String targetType) {
        String formatted = odt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        return switch (targetType) {
            case "oracle" -> String.format("TO_TIMESTAMP_TZ('%s', 'YYYY-MM-DD HH24:MI:SS TZH:TZM')", 
                odt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss xxx")));
            case "mssql" -> String.format("CAST('%s' AS DATETIMEOFFSET)", 
                odt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
            case "snowflake" -> String.format("TO_TIMESTAMP_TZ('%s')", 
                odt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
            case "postgres" -> String.format("'%s'::timestamptz", 
                odt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
            default -> String.format("'%s'", formatted);
        };
    }
    
    /**
     * Formats binary data for the target database.
     */
    private static String formatBinary(byte[] bytes, String targetType) {
        if (bytes == null || bytes.length == 0) {
            return "NULL";
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : bytes) {
            hex.append(String.format("%02x", b));
        }
        return switch (targetType) {
            case "postgres" -> String.format("'\\x%s'::bytea", hex);
            case "oracle" -> String.format("HEXTORAW('%s')", hex);
            case "mssql" -> String.format("0x%s", hex);
            case "mysql", "mariadb" -> String.format("X'%s'", hex);
            case "snowflake" -> String.format("TO_BINARY('%s', 'HEX')", hex);
            default -> String.format("'%s'", hex);
        };
    }
    
}


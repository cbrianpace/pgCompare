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

import com.crunchydata.config.ApplicationState;
import com.crunchydata.controller.ColumnController;
import com.crunchydata.controller.RepoController;
import com.crunchydata.controller.TableController;
import com.crunchydata.core.comparison.ResultProcessor;
import com.crunchydata.core.database.SQLExecutionHelper;
import com.crunchydata.core.threading.DataValidationThread;
import com.crunchydata.core.threading.ThreadManager;
import com.crunchydata.model.ColumnMetadata;
import com.crunchydata.model.DataComparisonTable;
import com.crunchydata.model.DataComparisonTableMap;
import com.crunchydata.util.LoggingUtils;

import javax.sql.rowset.CachedRowSet;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.UUID;

import static com.crunchydata.config.Settings.Props;
import static com.crunchydata.config.sql.RepoSQLConstants.SQL_REPO_DCTABLECOLUMNMAP_FULLBYTID;
import static com.crunchydata.controller.ColumnController.getColumnInfo;
import static com.crunchydata.controller.RepoController.createCompareId;
import static com.crunchydata.service.SQLSyntaxService.buildGetTablesSQL;
import static com.crunchydata.service.SQLSyntaxService.generateCompareSQL;

import org.json.JSONObject;

/**
 * Job-aware compare controller that integrates with ServerModeService
 * for progress tracking and control signal handling.
 *
 * @author Brian Pace
 */
public class JobAwareCompareController {

    private static final String THREAD_NAME = "job-compare";

    /**
     * Perform comparison with job progress tracking.
     *
     * @param jobId Job ID for progress tracking
     * @param connRepo Repository connection
     * @param connSource Source database connection
     * @param connTarget Target database connection
     * @param pid Project ID
     * @param batchNbr Batch number
     * @param serverService Server service for progress updates
     */
    public static void performCompare(UUID jobId, Connection connRepo, Connection connSource, 
                                      Connection connTarget, int pid, int batchNbr,
                                      ServerModeService serverService) throws Exception {
        
        boolean isCheck = Props.getProperty("isCheck", "false").equals("true");
        String tableFilter = Props.getProperty("table", "");

        LoggingUtils.write("info", THREAD_NAME, 
            String.format("Starting job %s: pid=%d, batch=%d, check=%s", jobId, pid, batchNbr, isCheck));

        // Get tables to process
        CachedRowSet tablesResultSet = getTables(pid, connRepo, batchNbr, tableFilter, isCheck);
        
        if (tablesResultSet == null) {
            throw new RuntimeException("Failed to retrieve tables for comparison");
        }

        try {
            // Pre-populate progress for all tables before processing
            LoggingUtils.write("info", THREAD_NAME, "Pre-populating job progress for all tables");
            while (tablesResultSet.next()) {
                long tid = tablesResultSet.getLong("tid");
                String tableAlias = tablesResultSet.getString("table_alias");
                serverService.initializeJobProgress(jobId, tid, tableAlias);
            }
            // Reset cursor to beginning
            tablesResultSet.beforeFirst();
            
            RepoController repoController = new RepoController();
            long rid = System.currentTimeMillis();
            int tablesProcessed = 0;
            boolean isPaused = false;

            while (tablesResultSet.next()) {
                // Check for control signals
                String signal = serverService.checkJobControlSignal(jobId);
                if (signal != null) {
                    switch (signal) {
                        case "terminate":
                            LoggingUtils.write("info", THREAD_NAME, "Terminate signal received");
                            ApplicationState.getInstance().requestImmediateTermination();
                            throw new RuntimeException("Job terminated by user request");
                        case "stop":
                            LoggingUtils.write("info", THREAD_NAME, "Stop signal received - completing gracefully");
                            ApplicationState.getInstance().requestGracefulShutdown();
                            return;
                        case "pause":
                            LoggingUtils.write("info", THREAD_NAME, "Pause signal received");
                            isPaused = true;
                            break;
                        case "resume":
                            LoggingUtils.write("info", THREAD_NAME, "Resume signal received");
                            isPaused = false;
                            break;
                    }
                }

                // Wait while paused
                while (isPaused && !ApplicationState.getInstance().isGracefulShutdownRequested()) {
                    Thread.sleep(5000);
                    String resumeSignal = serverService.checkJobControlSignal(jobId);
                    if ("resume".equals(resumeSignal)) {
                        isPaused = false;
                        LoggingUtils.write("info", THREAD_NAME, "Resuming job");
                    } else if ("terminate".equals(resumeSignal) || "stop".equals(resumeSignal)) {
                        throw new RuntimeException("Job stopped while paused");
                    }
                }

                // Check for graceful shutdown
                if (ApplicationState.getInstance().isGracefulShutdownRequested()) {
                    LoggingUtils.write("info", THREAD_NAME, "Graceful shutdown requested - stopping");
                    return;
                }

                // Get table information
                DataComparisonTable dct = new DataComparisonTable(
                    tablesResultSet.getInt("pid"),
                    tablesResultSet.getInt("tid"),
                    tablesResultSet.getString("table_alias"),
                    tablesResultSet.getInt("batch_nbr"),
                    tablesResultSet.getInt("parallel_degree"),
                    tablesResultSet.getBoolean("enabled")
                );

                // Mark this table as running
                serverService.updateJobProgress(jobId, dct.getTid(), "running", null, null);

                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Processing table: %s (tid=%d)", dct.getTableAlias(), dct.getTid()));

                try {
                    // Get table mappings
                    DataComparisonTableMap dctmSource = TableController.getTableMap(connRepo, dct.getTid(), "source");
                    DataComparisonTableMap dctmTarget = TableController.getTableMap(connRepo, dct.getTid(), "target");

                    // Set additional properties (consistent with standalone mode)
                    dctmSource.setBatchNbr(dct.getBatchNbr());
                    dctmSource.setPid(dct.getPid());
                    dctmSource.setTableAlias(dct.getTableAlias());
                    
                    dctmTarget.setBatchNbr(dct.getBatchNbr());
                    dctmTarget.setPid(dct.getPid());
                    dctmTarget.setTableAlias(dct.getTableAlias());

                    // Perform reconciliation
                    JSONObject result = reconcileDataWithProgress(
                        jobId, connRepo, connSource, connTarget, rid, isCheck, 
                        dct, dctmSource, dctmTarget, serverService);

                    // Update progress with status and cid (counts come from dc_result)
                    serverService.updateJobProgress(jobId, dct.getTid(),
                        "completed".equals(result.optString("status")) ? "completed" : "failed",
                        result.optString("error", null),
                        result.has("cid") ? result.getInt("cid") : null);

                    tablesProcessed++;

                } catch (Exception e) {
                    LoggingUtils.write("severe", THREAD_NAME, 
                        String.format("Error processing table %s: %s", dct.getTableAlias(), e.getMessage()));
                    
                    serverService.updateJobProgress(jobId, dct.getTid(),
                        "failed", e.getMessage(), null);
                }
            }

            LoggingUtils.write("info", THREAD_NAME, 
                String.format("Job %s completed: %d tables processed", jobId, tablesProcessed));

        } finally {
            if (tablesResultSet != null) {
                tablesResultSet.close();
            }
        }
    }

    /**
     * Reconcile data with progress tracking.
     */
    private static JSONObject reconcileDataWithProgress(UUID jobId, Connection connRepo, 
            Connection connSource, Connection connTarget, long rid, boolean check,
            DataComparisonTable dct, DataComparisonTableMap dctmSource, 
            DataComparisonTableMap dctmTarget, ServerModeService serverService) {

        long startTime = System.currentTimeMillis();
        JSONObject result = new JSONObject();
        result.put("tableName", dct.getTableAlias());
        result.put("status", "processing");
        result.put("compareStatus", "processing");
        result.put("missingSource", 0);
        result.put("missingTarget", 0);
        result.put("notEqual", 0);
        result.put("equal", 0);

        RepoController repoController = new RepoController();
        
        try {
            // Start table history tracking
            repoController.startTableHistory(connRepo, (int) dct.getTid(), dct.getBatchNbr());
            
            // Clear previous compare results for this table (unless it's a recheck)
            if (!check) {
                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Clearing previous compare data for table %s (tid=%d, batch=%d)", 
                        dct.getTableAlias(), dct.getTid(), dct.getBatchNbr()));
                repoController.deleteDataCompare(connRepo, (int) dct.getTid(), dct.getBatchNbr());
            }
            
            // Get column mapping
            ArrayList<Object> binds = new ArrayList<>();
            binds.add(dct.getTid());
            String columnMapping = SQLExecutionHelper.simpleSelectReturnString(
                connRepo, SQL_REPO_DCTABLECOLUMNMAP_FULLBYTID, binds);

            if (columnMapping == null) {
                result.put("status", "failed");
                result.put("error", "No column mapping found");
                return result;
            }

            // Get column metadata
            JSONObject columnMap = new JSONObject(columnMapping);
            ColumnMetadata ciSource = getColumnInfo(columnMap, "source", 
                Props.getProperty("source-type"),
                dctmSource.getSchemaName(), dctmSource.getTableName(),
                "database".equals(Props.getProperty("column-hash-method")));

            ColumnMetadata ciTarget = getColumnInfo(columnMap, "target", 
                Props.getProperty("target-type"),
                dctmTarget.getSchemaName(), dctmTarget.getTableName(),
                "database".equals(Props.getProperty("column-hash-method")));

            // Create compare ID
            Integer cid = createCompareId(connRepo, dctmTarget, rid);

            // Generate compare SQL
            generateCompareSQL(dctmSource, dctmTarget, ciSource, ciTarget);

            // Execute reconciliation
            if (check) {
                JSONObject checkResult = DataValidationThread.checkRows(
                    connRepo, connSource, connTarget, dct, dctmSource, dctmTarget, 
                    ciSource, ciTarget, cid);
                result.put("checkResult", checkResult);
            } else {
                if (ciTarget.pkList.isBlank() || ciSource.pkList.isBlank()) {
                    result.put("status", "skipped");
                    result.put("error", "No primary key defined");
                    return result;
                }

                ThreadManager.executeReconciliation(dct, cid, dctmSource, dctmTarget, 
                    ciSource, ciTarget, connRepo);
            }

            // Process results
            ResultProcessor.summarizeResults(connRepo, dct.getTid(), result, cid);

            long elapsedTime = (System.currentTimeMillis() - startTime) / 1000;
            result.put("elapsedTime", elapsedTime);
            result.put("status", "completed");
            result.put("cid", cid);

            // Complete table history (consistent with standalone mode)
            RepoController.completeTableHistory(connRepo, (int) dct.getTid(), dct.getBatchNbr(), 0, result.toString());

        } catch (Exception e) {
            LoggingUtils.write("severe", THREAD_NAME, 
                String.format("Error reconciling table %s: %s", dct.getTableAlias(), e.getMessage()));
            result.put("status", "failed");
            result.put("error", e.getMessage());
        }

        return result;
    }

    /**
     * Retrieve tables from repository.
     */
    private static CachedRowSet getTables(int pid, Connection conn, int batchNbr, 
                                          String table, boolean check) {
        String sql = buildGetTablesSQL(batchNbr, table, check);
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(pid);

        if (batchNbr > 0) {
            binds.add(batchNbr);
        }

        if (table != null && !table.isEmpty()) {
            binds.add(table);
        }

        return SQLExecutionHelper.simpleSelect(conn, sql, binds);
    }
}

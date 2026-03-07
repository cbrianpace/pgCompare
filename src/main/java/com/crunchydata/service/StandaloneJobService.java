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
import com.crunchydata.util.LoggingUtils;

import javax.sql.rowset.CachedRowSet;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.UUID;

import static com.crunchydata.config.Settings.Props;

/**
 * Service for tracking standalone (non-server mode) jobs in the dc_job table.
 * This enables unified job history viewing from the UI regardless of how
 * pgcompare was invoked.
 *
 * @author Brian Pace
 */
public class StandaloneJobService {

    private static final String THREAD_NAME = "standalone-job";

    private static final String SQL_JOB_CREATE = """
            INSERT INTO dc_job (pid, job_type, status, batch_nbr, table_filter, started_at, source, rid)
            VALUES (?, ?, 'running', ?, ?, current_timestamp, 'standalone', ?)
            RETURNING job_id
            """;

    private static final String SQL_JOB_UPDATE_STATUS = """
            UPDATE dc_job 
            SET status = ?, completed_at = CASE WHEN ? IN ('completed', 'error', 'failed', 'cancelled') THEN current_timestamp ELSE completed_at END,
                result_summary = COALESCE(?::jsonb, result_summary),
                error_message = COALESCE(?, error_message)
            WHERE job_id = ?::uuid
            """;

    private final Connection connRepo;
    private UUID currentJobId;

    public StandaloneJobService(Connection connRepo) {
        this.connRepo = connRepo;
    }

    /**
     * Creates a new standalone job record and sets up logging context.
     *
     * @param pid Project ID
     * @param jobType Type of job (compare, check, discover)
     * @param batchNbr Batch number
     * @param tableFilter Table filter if any
     * @param rid Run ID (typically System.currentTimeMillis())
     * @return The created job ID
     */
    public UUID startJob(int pid, String jobType, int batchNbr, String tableFilter, long rid) {
        try {
            ArrayList<Object> binds = new ArrayList<>();
            binds.add(pid);
            binds.add(jobType);
            binds.add(batchNbr);
            binds.add(tableFilter != null && !tableFilter.isEmpty() ? tableFilter : null);
            binds.add(rid);

            CachedRowSet rs = SQLExecutionHelper.simpleUpdateReturning(connRepo, SQL_JOB_CREATE, binds);
            if (rs != null && rs.next()) {
                currentJobId = UUID.fromString(rs.getString(1));
                rs.close();

                // Set up logging context
                LoggingUtils.setJobContext(currentJobId, connRepo);

                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Started standalone job %s: type=%s, pid=%d, batch=%d", 
                        currentJobId, jobType, pid, batchNbr));

                return currentJobId;
            }
        } catch (Exception e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Failed to create standalone job record: %s", e.getMessage()));
        }
        return null;
    }

    /**
     * Marks the current job as completed.
     * Uses 'error' status if SEVERE errors occurred during the job.
     *
     * @param resultSummary Optional JSON result summary
     */
    public void completeJob(String resultSummary) {
        String status = LoggingUtils.hasJobSevereError() ? "error" : "completed";
        updateJobStatus(status, resultSummary, null);
        LoggingUtils.clearJobContext();
    }

    /**
     * Marks the current job as failed.
     *
     * @param errorMessage Error message describing the failure
     */
    public void failJob(String errorMessage) {
        updateJobStatus("failed", null, errorMessage);
        LoggingUtils.clearJobContext();
    }

    /**
     * Updates the job status.
     */
    private void updateJobStatus(String status, String resultSummary, String errorMessage) {
        if (currentJobId == null) {
            return;
        }

        try {
            ArrayList<Object> binds = new ArrayList<>();
            binds.add(status);
            binds.add(status);
            binds.add(resultSummary);
            binds.add(errorMessage);
            binds.add(currentJobId.toString());

            SQLExecutionHelper.simpleUpdate(connRepo, SQL_JOB_UPDATE_STATUS, binds, true);

            LoggingUtils.write("info", THREAD_NAME, 
                String.format("Job %s completed with status: %s", currentJobId, status));
        } catch (Exception e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Failed to update job status: %s", e.getMessage()));
        }
    }

    /**
     * Gets the current job ID.
     */
    public UUID getCurrentJobId() {
        return currentJobId;
    }

    /**
     * Checks if standalone job tracking is enabled.
     * Job tracking requires the dc_job table to exist.
     */
    public static boolean isJobTrackingAvailable(Connection conn) {
        try {
            ArrayList<Object> binds = new ArrayList<>();
            CachedRowSet rs = SQLExecutionHelper.simpleSelect(conn, 
                "SELECT 1 FROM information_schema.tables WHERE table_name = 'dc_job' LIMIT 1", binds);
            boolean exists = rs != null && rs.next();
            if (rs != null) rs.close();
            return exists;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Checks if a project exists in the repository.
     * @param conn Repository connection
     * @param pid Project ID to check
     * @return true if project exists, false otherwise
     */
    public static boolean projectExists(Connection conn, int pid) {
        try {
            ArrayList<Object> binds = new ArrayList<>();
            binds.add(pid);
            CachedRowSet rs = SQLExecutionHelper.simpleSelect(conn, 
                "SELECT 1 FROM dc_project WHERE pid = ? LIMIT 1", binds);
            boolean exists = rs != null && rs.next();
            if (rs != null) rs.close();
            return exists;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Ensures a project exists, creating it if necessary.
     * Uses OVERRIDING SYSTEM VALUE to set a specific pid for auto-generated identity column.
     * @param conn Repository connection
     * @param pid Project ID to ensure exists
     * @return true if project exists or was created, false on error
     */
    public static boolean ensureProjectExists(Connection conn, int pid) {
        if (projectExists(conn, pid)) {
            return true;
        }
        
        try {
            ArrayList<Object> binds = new ArrayList<>();
            binds.add(pid);
            binds.add("Project " + pid);
            
            SQLExecutionHelper.simpleUpdate(conn, 
                "INSERT INTO dc_project (pid, project_name) OVERRIDING SYSTEM VALUE VALUES (?, ?)", 
                binds, true);
            
            LoggingUtils.write("info", THREAD_NAME, 
                String.format("Created project %d for standalone job tracking", pid));
            return true;
        } catch (Exception e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Failed to create project %d: %s", pid, e.getMessage()));
            return false;
        }
    }
}

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
import com.crunchydata.config.Settings;
import com.crunchydata.core.database.SQLExecutionHelper;
import com.crunchydata.util.LoggingUtils;

import java.net.InetAddress;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import static com.crunchydata.config.sql.ServerModeSQLConstants.*;
import static com.crunchydata.service.DatabaseConnectionService.getConnection;
import static com.crunchydata.service.DatabaseConnectionService.isConnectionValid;

/**
 * Service for running pgCompare in server mode.
 * In server mode, pgCompare registers as a worker that polls a work queue
 * for jobs and executes them. Multiple servers can run concurrently.
 *
 * @author Brian Pace
 */
public class ServerModeService {

    private static final String THREAD_NAME = "server-mode";
    private static final int HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
    private static final int POLL_INTERVAL_MS = 5000; // 5 seconds
    private static final int STALE_SERVER_CHECK_INTERVAL_MS = 60000; // 1 minute
    private static final int MAX_RECONNECT_ATTEMPTS = 5;
    private static final int RECONNECT_DELAY_MS = 5000; // 5 seconds between retries
    private static final String CONN_TYPE_POSTGRES = "postgres";
    private static final String CONN_TYPE_REPO = "repo";

    private Connection connRepo;
    private final String serverName;
    private UUID serverId;
    private final AtomicBoolean running = new AtomicBoolean(true);
    private UUID currentJobId;
    
    private Thread heartbeatThread;
    private Thread staleServerCleanupThread;

    public ServerModeService(Connection connRepo, String serverName) {
        this.connRepo = connRepo;
        this.serverName = serverName;
    }

    /**
     * Check if the repository connection is valid and attempt to reconnect if not.
     * @return true if connection is valid or successfully reconnected, false if all retries failed
     */
    private boolean ensureRepoConnection() {
        if (isConnectionValid(connRepo)) {
            return true;
        }
        
        LoggingUtils.write("warning", THREAD_NAME, 
            "Repository connection lost. Attempting to reconnect...");
        
        for (int attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
            try {
                // Close old connection if possible
                if (connRepo != null) {
                    try { connRepo.close(); } catch (Exception e) { /* ignore */ }
                }
                
                // Attempt to reconnect
                Connection newConn = getConnection(CONN_TYPE_POSTGRES, CONN_TYPE_REPO);
                if (newConn != null && isConnectionValid(newConn)) {
                    connRepo = newConn;
                    LoggingUtils.write("info", THREAD_NAME, 
                        String.format("Successfully reconnected to repository on attempt %d", attempt));
                    return true;
                }
            } catch (Exception e) {
                LoggingUtils.write("warning", THREAD_NAME, 
                    String.format("Reconnection attempt %d/%d failed: %s", 
                        attempt, MAX_RECONNECT_ATTEMPTS, e.getMessage()));
            }
            
            if (attempt < MAX_RECONNECT_ATTEMPTS) {
                try {
                    Thread.sleep(RECONNECT_DELAY_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return false;
                }
            }
        }
        
        LoggingUtils.write("severe", THREAD_NAME, 
            String.format("Failed to reconnect to repository after %d attempts. Server will exit.", 
                MAX_RECONNECT_ATTEMPTS));
        return false;
    }

    /**
     * Start the server in daemon mode.
     */
    public void start() {
        try {
            // Register this server
            registerServer();
            
            // Start heartbeat thread
            startHeartbeatThread();
            
            // Start stale server cleanup thread
            startStaleServerCleanupThread();
            
            LoggingUtils.write("info", THREAD_NAME, 
                String.format("Server '%s' started with ID: %s", serverName, serverId));
            
            // Main work loop
            while (running.get() && !ApplicationState.getInstance().isGracefulShutdownRequested()) {
                try {
                    // Ensure repository connection is valid
                    if (!ensureRepoConnection()) {
                        LoggingUtils.write("severe", THREAD_NAME, 
                            "Cannot maintain repository connection. Server shutting down.");
                        break;
                    }
                    
                    // Check for and process next job
                    processNextJob();
                    
                    // Wait before polling again
                    Thread.sleep(POLL_INTERVAL_MS);
                    
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                } catch (Exception e) {
                    // Check if this is a connection-related error
                    if (isConnectionError(e)) {
                        LoggingUtils.write("warning", THREAD_NAME, 
                            String.format("Connection error detected: %s", e.getMessage()));
                        // Will attempt reconnection on next loop iteration
                    } else {
                        LoggingUtils.write("warning", THREAD_NAME, 
                            String.format("Error processing job: %s", e.getMessage()));
                    }
                }
            }
            
        } catch (Exception e) {
            LoggingUtils.write("severe", THREAD_NAME, 
                String.format("Server startup failed: %s", e.getMessage()));
        } finally {
            shutdown();
        }
    }

    /**
     * Register this server in the dc_server table.
     * First removes any existing record with the same server name.
     */
    private void registerServer() throws SQLException {
        String hostname = getHostname();
        long pid = ProcessHandle.current().pid();
        String config = String.format("{\"version\":\"%s\"}", Settings.VERSION);
        
        // First, delete any existing record with the same server name
        ArrayList<Object> deleteBinds = new ArrayList<>();
        deleteBinds.add(serverName);
        ResultSet rsDelete = SQLExecutionHelper.simpleUpdateReturning(connRepo, SQL_SERVER_DELETE_BY_NAME, deleteBinds);
        if (rsDelete != null) {
            while (rsDelete.next()) {
                String oldStatus = rsDelete.getString("status");
                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Removed previous server record for '%s' (was %s)", serverName, oldStatus));
            }
            rsDelete.close();
        }
        
        // Now register the new server
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(serverName);
        binds.add(hostname);
        binds.add(pid);
        binds.add(config);
        
        ResultSet rs = SQLExecutionHelper.simpleUpdateReturning(connRepo, SQL_SERVER_REGISTER, binds);
        if (rs != null && rs.next()) {
            serverId = UUID.fromString(rs.getString("server_id"));
            rs.close();
        } else {
            throw new SQLException("Failed to register server");
        }
        
        LoggingUtils.write("info", THREAD_NAME, 
            String.format("Registered server: %s (%s) with PID %d", serverName, hostname, pid));
    }

    /**
     * Start the heartbeat thread to keep the server registration alive.
     */
    private void startHeartbeatThread() {
        heartbeatThread = new Thread(() -> {
            while (running.get()) {
                try {
                    if (isConnectionValid(connRepo)) {
                        updateHeartbeat();
                    }
                    Thread.sleep(HEARTBEAT_INTERVAL_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                } catch (Exception e) {
                    LoggingUtils.write("warning", THREAD_NAME, 
                        String.format("Heartbeat failed: %s", e.getMessage()));
                }
            }
        }, "server-heartbeat");
        heartbeatThread.setDaemon(true);
        heartbeatThread.start();
    }

    /**
     * Start the stale server cleanup thread.
     */
    private void startStaleServerCleanupThread() {
        staleServerCleanupThread = new Thread(() -> {
            while (running.get()) {
                try {
                    if (isConnectionValid(connRepo)) {
                        markStaleServers();
                    }
                    Thread.sleep(STALE_SERVER_CHECK_INTERVAL_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                } catch (Exception e) {
                    LoggingUtils.write("debug", THREAD_NAME, 
                        String.format("Stale server cleanup failed: %s", e.getMessage()));
                }
            }
        }, "stale-server-cleanup");
        staleServerCleanupThread.setDaemon(true);
        staleServerCleanupThread.start();
    }

    /**
     * Update the heartbeat timestamp.
     */
    private void updateHeartbeat() throws SQLException {
        String status = currentJobId != null ? "busy" : "idle";
        
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(status);
        binds.add(serverId.toString());
        
        SQLExecutionHelper.simpleUpdate(connRepo, SQL_SERVER_HEARTBEAT, binds, false);
    }

    /**
     * Mark stale servers as offline, delete very stale servers, and fail orphaned jobs.
     */
    private void markStaleServers() throws SQLException {
        ArrayList<Object> binds = new ArrayList<>();
        
        // First, get the names of servers that will be marked stale
        ResultSet rsStale = SQLExecutionHelper.simpleSelect(connRepo, SQL_SERVER_SELECT_STALE_TO_MARK, binds);
        List<String> staleServers = new ArrayList<>();
        if (rsStale != null) {
            while (rsStale.next()) {
                staleServers.add(rsStale.getString("server_name") + " (" + rsStale.getString("server_host") + ")");
            }
            rsStale.close();
        }
        
        // Mark them as offline
        int updated = SQLExecutionHelper.simpleUpdate(connRepo, SQL_SERVER_MARK_STALE, binds, false);
        if (updated > 0) {
            for (String serverName : staleServers) {
                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Marked server as offline (no heartbeat for 2+ minutes): %s", serverName));
            }
        }
        
        // Handle orphaned jobs - jobs running on servers that are offline/terminated/missing
        markOrphanedJobsAsFailed();
        
        // Get servers that will be deleted
        ResultSet rsDelete = SQLExecutionHelper.simpleSelect(connRepo, SQL_SERVER_SELECT_STALE_TO_DELETE, binds);
        List<String> deleteServers = new ArrayList<>();
        if (rsDelete != null) {
            while (rsDelete.next()) {
                deleteServers.add(rsDelete.getString("server_name") + " (" + rsDelete.getString("server_host") + ")");
            }
            rsDelete.close();
        }
        
        // Delete them
        int deleted = SQLExecutionHelper.simpleUpdate(connRepo, SQL_SERVER_DELETE_STALE, binds, true);
        if (deleted > 0) {
            for (String serverName : deleteServers) {
                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Deleted stale server (no heartbeat for 5+ minutes): %s", serverName));
            }
        }
    }

    /**
     * Mark orphaned jobs as failed. An orphaned job is one that is marked as 'running'
     * but its assigned server is offline, terminated, or hasn't sent a heartbeat recently.
     */
    private void markOrphanedJobsAsFailed() {
        try {
            ArrayList<Object> binds = new ArrayList<>();
            ResultSet rs = SQLExecutionHelper.simpleSelect(connRepo, SQL_JOB_SELECT_ORPHANED, binds);
            
            if (rs != null) {
                while (rs.next()) {
                    UUID jobId = UUID.fromString(rs.getString("job_id"));
                    String jobType = rs.getString("job_type");
                    String serverName = rs.getString("server_name");
                    String serverStatus = rs.getString("server_status");
                    
                    // Mark job as failed
                    ArrayList<Object> updateBinds = new ArrayList<>();
                    updateBinds.add(jobId.toString());
                    int updated = SQLExecutionHelper.simpleUpdate(connRepo, SQL_JOB_MARK_ORPHANED_FAILED, updateBinds, true);
                    
                    if (updated > 0) {
                        String reason = serverName == null ? "server no longer exists" : 
                            String.format("server '%s' is %s", serverName, serverStatus != null ? serverStatus : "unresponsive");
                        LoggingUtils.write("warning", THREAD_NAME, 
                            String.format("Marked orphaned job %s (%s) as failed: %s", jobId, jobType, reason));
                    }
                }
                rs.close();
            }
        } catch (Exception e) {
            LoggingUtils.write("debug", THREAD_NAME, 
                String.format("Failed to check for orphaned jobs: %s", e.getMessage()));
        }
    }

    /**
     * Process the next available job from the queue.
     */
    private void processNextJob() {
        try {
            // Try to claim a job
            ArrayList<Object> binds = new ArrayList<>();
            binds.add(serverId.toString());
            binds.add(serverId.toString());
            
            ResultSet rs = SQLExecutionHelper.simpleSelect(connRepo, SQL_JOB_CLAIM_NEXT, binds);
            
            if (rs != null && rs.next()) {
                currentJobId = UUID.fromString(rs.getString("job_id"));
                int pid = rs.getInt("pid");
                String jobType = rs.getString("job_type");
                int batchNbr = rs.getInt("batch_nbr");
                String tableFilter = rs.getString("table_filter");
                String jobConfig = rs.getString("job_config");
                rs.close();
                
                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Claimed job %s: type=%s, pid=%d, batch=%d", 
                        currentJobId, jobType, pid, batchNbr));
                
                // Execute the job
                executeJob(currentJobId, pid, jobType, batchNbr, tableFilter, jobConfig);
                
            } else if (rs != null) {
                rs.close();
            }
        } catch (Exception e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Error claiming job: %s", e.getMessage()));
            
            // Mark job as failed if we had claimed it
            if (currentJobId != null) {
                try {
                    updateJobStatus(currentJobId, "failed", null, e.getMessage());
                } catch (SQLException ex) {
                    LoggingUtils.write("severe", THREAD_NAME, 
                        String.format("Failed to mark job as failed: %s", ex.getMessage()));
                }
            }
        } finally {
            currentJobId = null;
        }
    }

    /**
     * Execute a job.
     */
    private void executeJob(UUID jobId, int pid, String jobType, int batchNbr, 
                           String tableFilter, String jobConfig) {
        try {
            // Load project configuration FIRST (before setting job context)
            Settings.setProjectConfig(connRepo, pid);
            
            // Set job context for logging AFTER project config is loaded
            // so job-logging-enabled from project config is respected
            LoggingUtils.setJobContext(jobId, connRepo);
            
            // Set batch number
            Settings.Props.setProperty("batch", String.valueOf(batchNbr));
            Settings.Props.setProperty("pid", String.valueOf(pid));
            
            // Set table filter if provided
            if (tableFilter != null && !tableFilter.isEmpty()) {
                Settings.Props.setProperty("table", tableFilter);
            }
            
            LoggingUtils.write("info", THREAD_NAME, 
                String.format("Starting job %s: type=%s, pid=%d, batch=%d", jobId, jobType, pid, batchNbr));
            
            // Execute based on job type
            switch (jobType) {
                case "compare":
                    executeCompareJob(jobId, pid, batchNbr);
                    break;
                case "check":
                    Settings.Props.setProperty("isCheck", "true");
                    executeCompareJob(jobId, pid, batchNbr);
                    break;
                case "discover":
                    executeDiscoverJob(jobId, pid, tableFilter);
                    break;
                case "test-connection":
                    executeTestConnectionJob(jobId, pid);
                    break;
                default:
                    throw new IllegalArgumentException("Unknown job type: " + jobType);
            }
            
            // Mark job as completed (test-connection handles its own status)
            if (!"test-connection".equals(jobType)) {
                // Use 'error' status if SEVERE errors occurred, otherwise 'completed'
                String status = LoggingUtils.hasJobSevereError() ? "error" : "completed";
                updateJobStatus(jobId, status, buildResultSummary(jobId), null);
            }
            
            LoggingUtils.write("info", THREAD_NAME, 
                String.format("Job %s completed successfully", jobId));
            
        } catch (Exception e) {
            LoggingUtils.write("severe", THREAD_NAME, 
                String.format("Job %s failed: %s", jobId, e.getMessage()));
            
            try {
                updateJobStatus(jobId, "failed", null, e.getMessage());
            } catch (SQLException ex) {
                LoggingUtils.write("severe", THREAD_NAME, 
                    String.format("Failed to update job status: %s", ex.getMessage()));
            }
        } finally {
            // Clear job context when job completes
            LoggingUtils.clearJobContext();
        }
    }

    /**
     * Execute a compare/check job with progress tracking.
     */
    private void executeCompareJob(UUID jobId, int pid, int batchNbr) throws Exception {
        // Get source and target connections
        Connection connSource = DatabaseConnectionService.getConnection(
            Settings.Props.getProperty("source-type"), "source");
        Connection connTarget = DatabaseConnectionService.getConnection(
            Settings.Props.getProperty("target-type"), "target");
        
        if (connSource == null || connTarget == null) {
            throw new RuntimeException("Failed to connect to source or target database");
        }
        
        try {
            // Create a job-aware compare controller that reports progress
            JobAwareCompareController.performCompare(
                jobId, connRepo, connSource, connTarget, pid, batchNbr, this);
        } finally {
            try { connSource.close(); } catch (Exception e) { }
            try { connTarget.close(); } catch (Exception e) { }
        }
    }

    /**
     * Execute a discover job.
     */
    private void executeDiscoverJob(UUID jobId, int pid, String tableFilter) throws Exception {
        Connection connSource = DatabaseConnectionService.getConnection(
            Settings.Props.getProperty("source-type"), "source");
        Connection connTarget = DatabaseConnectionService.getConnection(
            Settings.Props.getProperty("target-type"), "target");
        
        if (connSource == null || connTarget == null) {
            throw new RuntimeException("Failed to connect to source or target database");
        }
        
        try {
            // Discover tables
            com.crunchydata.controller.DiscoverController.performTableDiscovery(
                Settings.Props, pid, tableFilter != null ? tableFilter : "", 
                connRepo, connSource, connTarget);
            
            // Discover columns
            com.crunchydata.controller.DiscoverController.performColumnDiscovery(
                Settings.Props, pid, tableFilter != null ? tableFilter : "", 
                connRepo, connSource, connTarget);
        } finally {
            try { connSource.close(); } catch (Exception e) { }
            try { connTarget.close(); } catch (Exception e) { }
        }
    }

    /**
     * Execute a test-connection job.
     */
    private void executeTestConnectionJob(UUID jobId, int pid) {
        LoggingUtils.write("info", THREAD_NAME, 
            String.format("Testing connections for project %d", pid));
        
        Map<String, ConnectionTestService.ConnectionTestResult> results = 
            ConnectionTestService.testAllConnections();
        
        // Build JSON result
        StringBuilder json = new StringBuilder();
        json.append("{");
        
        int i = 0;
        for (Map.Entry<String, ConnectionTestService.ConnectionTestResult> entry : results.entrySet()) {
            if (i > 0) json.append(",");
            json.append("\"").append(entry.getKey()).append("\":");
            json.append(resultToJson(entry.getValue()));
            i++;
        }
        
        json.append("}");
        
        boolean allSuccess = results.values().stream().allMatch(r -> r.success);
        String status = allSuccess ? "completed" : "completed";
        
        try {
            updateJobStatus(jobId, status, json.toString(), null);
        } catch (SQLException e) {
            LoggingUtils.write("severe", THREAD_NAME, 
                String.format("Failed to update test-connection job status: %s", e.getMessage()));
        }
    }

    private String resultToJson(ConnectionTestService.ConnectionTestResult result) {
        StringBuilder json = new StringBuilder();
        json.append("{");
        json.append("\"success\":").append(result.success).append(",");
        json.append("\"connectionType\":\"").append(escape(result.connectionType)).append("\",");
        json.append("\"databaseType\":\"").append(escape(result.databaseType)).append("\",");
        json.append("\"host\":\"").append(escape(result.host)).append("\",");
        json.append("\"port\":").append(result.port).append(",");
        json.append("\"database\":\"").append(escape(result.database)).append("\",");
        json.append("\"schema\":\"").append(escape(result.schema)).append("\",");
        json.append("\"user\":\"").append(escape(result.user)).append("\",");
        json.append("\"databaseProductName\":\"").append(escape(result.databaseProductName)).append("\",");
        json.append("\"databaseProductVersion\":\"").append(escape(result.databaseProductVersion)).append("\",");
        json.append("\"errorMessage\":\"").append(escape(result.errorMessage)).append("\",");
        json.append("\"errorDetail\":\"").append(escape(result.errorDetail)).append("\",");
        json.append("\"responseTimeMs\":").append(result.responseTimeMs);
        json.append("}");
        return json.toString();
    }

    private String escape(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                  .replace("\"", "\\\"")
                  .replace("\n", "\\n")
                  .replace("\r", "\\r")
                  .replace("\t", "\\t");
    }

    /**
     * Update job status in the work queue.
     */
    private void updateJobStatus(UUID jobId, String status, String resultSummary, 
                                 String errorMessage) throws SQLException {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(status);
        binds.add(status);
        binds.add(resultSummary);
        binds.add(errorMessage);
        binds.add(jobId.toString());
        
        SQLExecutionHelper.simpleUpdate(connRepo, SQL_JOB_UPDATE_STATUS, binds, true);
    }

    /**
     * Update job progress for a specific table (status and cid only, counts come from dc_result).
     */
    public void updateJobProgress(UUID jobId, long tid, String status, String errorMessage, Integer cid) {
        try {
            ArrayList<Object> binds = new ArrayList<>();
            binds.add(status);
            binds.add(status);
            binds.add(errorMessage);
            binds.add(cid);
            binds.add(jobId.toString());
            binds.add(tid);
            
            SQLExecutionHelper.simpleUpdate(connRepo, SQL_JOBPROGRESS_UPDATE, binds, true);
        } catch (Exception e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Failed to update job progress: %s", e.getMessage()));
        }
    }

    /**
     * Initialize job progress records for all tables.
     */
    public void initializeJobProgress(UUID jobId, long tid, String tableName) {
        try {
            ArrayList<Object> binds = new ArrayList<>();
            binds.add(jobId.toString());
            binds.add(tid);
            binds.add(tableName);
            
            SQLExecutionHelper.simpleUpdate(connRepo, SQL_JOBPROGRESS_INSERT, binds, true);
        } catch (Exception e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Failed to initialize job progress: %s", e.getMessage()));
        }
    }

    /**
     * Check for control signals (pause, stop, terminate).
     */
    public String checkJobControlSignal(UUID jobId) {
        try {
            ArrayList<Object> binds = new ArrayList<>();
            binds.add(jobId.toString());
            
            ResultSet rs = SQLExecutionHelper.simpleSelect(connRepo, SQL_JOBCONTROL_CHECK_PENDING, binds);
            
            if (rs != null && rs.next()) {
                int controlId = rs.getInt("control_id");
                String signal = rs.getString("signal");
                rs.close();
                
                // Mark as processed
                ArrayList<Object> markBinds = new ArrayList<>();
                markBinds.add(controlId);
                SQLExecutionHelper.simpleUpdate(connRepo, SQL_JOBCONTROL_MARK_PROCESSED, markBinds, false);
                
                return signal;
            }
            
            if (rs != null) {
                rs.close();
            }
        } catch (Exception e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Failed to check job control signal: %s", e.getMessage()));
        }
        
        return null;
    }

    /**
     * Build a result summary JSON string.
     */
    private String buildResultSummary(UUID jobId) {
        try {
            ArrayList<Object> binds = new ArrayList<>();
            binds.add(jobId.toString());
            
            ResultSet rs = SQLExecutionHelper.simpleSelect(connRepo, SQL_JOBPROGRESS_SUMMARY, binds);
            
            if (rs != null && rs.next()) {
                String summary = String.format(
                    "{\"totalTables\":%d,\"completedTables\":%d,\"failedTables\":%d," +
                    "\"totalSource\":%d,\"totalEqual\":%d,\"totalNotEqual\":%d,\"totalMissing\":%d}",
                    rs.getInt("total_tables"),
                    rs.getInt("completed_tables"),
                    rs.getInt("failed_tables"),
                    rs.getLong("total_source"),
                    rs.getLong("total_equal"),
                    rs.getLong("total_not_equal"),
                    rs.getLong("total_missing")
                );
                rs.close();
                return summary;
            }
            
            if (rs != null) {
                rs.close();
            }
        } catch (Exception e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Failed to build result summary: %s", e.getMessage()));
        }
        
        return null;
    }

    /**
     * Shutdown the server.
     */
    public void shutdown() {
        running.set(false);
        
        // Stop heartbeat thread
        if (heartbeatThread != null) {
            heartbeatThread.interrupt();
        }
        
        // Stop stale server cleanup thread
        if (staleServerCleanupThread != null) {
            staleServerCleanupThread.interrupt();
        }
        
        // Delete server entry from dc_server table
        if (serverId != null) {
            try {
                ArrayList<Object> binds = new ArrayList<>();
                binds.add(serverId.toString());
                SQLExecutionHelper.simpleUpdate(connRepo, SQL_SERVER_DELETE, binds, true);
                
                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Server '%s' removed from registry", serverName));
            } catch (Exception e) {
                LoggingUtils.write("warning", THREAD_NAME, 
                    String.format("Failed to remove server from registry: %s", e.getMessage()));
            }
        }
    }

    /**
     * Stop the server gracefully.
     */
    public void stop() {
        running.set(false);
    }

    /**
     * Get the server ID.
     */
    public UUID getServerId() {
        return serverId;
    }

    /**
     * Get the current job ID.
     */
    public UUID getCurrentJobId() {
        return currentJobId;
    }

    /**
     * Check if an exception is related to a database connection error.
     */
    private boolean isConnectionError(Exception e) {
        String message = e.getMessage();
        if (message == null) {
            return false;
        }
        message = message.toLowerCase();
        return message.contains("connection") 
            || message.contains("closed")
            || message.contains("socket")
            || message.contains("timeout")
            || message.contains("network")
            || message.contains("i/o error")
            || message.contains("communication");
    }

    /**
     * Get the hostname.
     */
    private String getHostname() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            return "unknown";
        }
    }

    /**
     * Static method to submit a job to the work queue.
     */
    public static UUID submitJob(Connection connRepo, int pid, String jobType, 
                                 int priority, int batchNbr, String tableFilter,
                                 String targetServerId, String scheduledAt, 
                                 String createdBy, String jobConfig) throws SQLException {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(pid);
        binds.add(jobType);
        binds.add(priority);
        binds.add(batchNbr);
        binds.add(tableFilter);
        binds.add(targetServerId);
        binds.add(scheduledAt);
        binds.add(createdBy);
        binds.add(jobConfig);
        
        ResultSet rs = SQLExecutionHelper.simpleSelect(connRepo, SQL_JOB_INSERT, binds);
        
        if (rs != null && rs.next()) {
            UUID jobId = UUID.fromString(rs.getString("job_id"));
            rs.close();
            return jobId;
        }
        
        throw new SQLException("Failed to submit job");
    }

    /**
     * Static method to send a control signal to a running job.
     */
    public static int sendControlSignal(Connection connRepo, UUID jobId, 
                                        String signal, String requestedBy) throws SQLException {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(jobId.toString());
        binds.add(signal);
        binds.add(requestedBy);
        
        ResultSet rs = SQLExecutionHelper.simpleSelect(connRepo, SQL_JOBCONTROL_INSERT, binds);
        
        if (rs != null && rs.next()) {
            int controlId = rs.getInt("control_id");
            rs.close();
            return controlId;
        }
        
        throw new SQLException("Failed to send control signal");
    }
}

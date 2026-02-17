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
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import static com.crunchydata.config.sql.ServerModeSQLConstants.*;

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

    private final Connection connRepo;
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
                    // Check for and process next job
                    processNextJob();
                    
                    // Wait before polling again
                    Thread.sleep(POLL_INTERVAL_MS);
                    
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                } catch (Exception e) {
                    LoggingUtils.write("warning", THREAD_NAME, 
                        String.format("Error processing job: %s", e.getMessage()));
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
     */
    private void registerServer() throws SQLException {
        String hostname = getHostname();
        long pid = ProcessHandle.current().pid();
        String config = String.format("{\"version\":\"%s\"}", Settings.VERSION);
        
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
                    updateHeartbeat();
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
                    markStaleServers();
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
     * Mark stale servers as offline and delete very stale servers.
     */
    private void markStaleServers() throws SQLException {
        ArrayList<Object> binds = new ArrayList<>();
        int updated = SQLExecutionHelper.simpleUpdate(connRepo, SQL_SERVER_MARK_STALE, binds, false);
        if (updated > 0) {
            LoggingUtils.write("info", THREAD_NAME, 
                String.format("Marked %d stale servers as offline", updated));
        }
        
        int deleted = SQLExecutionHelper.simpleUpdate(connRepo, SQL_SERVER_DELETE_STALE, binds, true);
        if (deleted > 0) {
            LoggingUtils.write("info", THREAD_NAME, 
                String.format("Deleted %d stale servers (no heartbeat for 5+ minutes)", deleted));
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
            // Load project configuration
            Settings.setProjectConfig(connRepo, pid);
            
            // Set batch number
            Settings.Props.setProperty("batch", String.valueOf(batchNbr));
            Settings.Props.setProperty("pid", String.valueOf(pid));
            
            // Set table filter if provided
            if (tableFilter != null && !tableFilter.isEmpty()) {
                Settings.Props.setProperty("table", tableFilter);
            }
            
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
                default:
                    throw new IllegalArgumentException("Unknown job type: " + jobType);
            }
            
            // Mark job as completed
            updateJobStatus(jobId, "completed", buildResultSummary(jobId), null);
            
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
        
        SQLExecutionHelper.simpleUpdate(connRepo, SQL_JOB_UPDATE_STATUS, binds, false);
    }

    /**
     * Update job progress for a specific table.
     */
    public void updateJobProgress(UUID jobId, long tid, String tableName, String status,
                                  Long sourceCnt, Long targetCnt, Long equalCnt,
                                  Long notEqualCnt, Long missingSourceCnt, 
                                  Long missingTargetCnt, String errorMessage) {
        try {
            ArrayList<Object> binds = new ArrayList<>();
            binds.add(status);
            binds.add(status);
            binds.add(sourceCnt);
            binds.add(targetCnt);
            binds.add(equalCnt);
            binds.add(notEqualCnt);
            binds.add(missingSourceCnt);
            binds.add(missingTargetCnt);
            binds.add(errorMessage);
            binds.add(jobId.toString());
            binds.add(tid);
            
            SQLExecutionHelper.simpleUpdate(connRepo, SQL_JOBPROGRESS_UPDATE, binds, false);
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
            
            SQLExecutionHelper.simpleUpdate(connRepo, SQL_JOBPROGRESS_INSERT, binds, false);
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
        
        // Unregister server
        if (serverId != null) {
            try {
                ArrayList<Object> binds = new ArrayList<>();
                binds.add(serverId.toString());
                SQLExecutionHelper.simpleUpdate(connRepo, SQL_SERVER_UNREGISTER, binds, false);
                
                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Server '%s' unregistered", serverName));
            } catch (Exception e) {
                LoggingUtils.write("warning", THREAD_NAME, 
                    String.format("Failed to unregister server: %s", e.getMessage()));
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

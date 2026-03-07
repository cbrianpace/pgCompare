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
package com.crunchydata.util;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.UUID;
import java.util.logging.*;

import static com.crunchydata.config.Settings.Props;

/**
 * Utility class for logging operations.
 * Provides methods to initialize logging configurations and write log messages at various severity levels.
 * Supports writing logs to a database table for job tracking when a job context is set.
 *
 * @author Brian Pace
 */
public final class LoggingUtils {

    private static final Logger LOGGER = Logger.getLogger(LoggingUtils.class.getName());
    private static final String STDOUT = "stdout";
    private static final String LOG_FORMAT_PROPERTY = "java.util.logging.SimpleFormatter.format";
    private static final String DEFAULT_LOG_FORMAT = "[%1$tF %1$tT] [%4$-7s] %5$s %n";
    private static final String MODULE_FORMAT = "[%-24s] %s";

    private static final String SQL_JOBLOG_INSERT = """
            INSERT INTO dc_job_log (job_id, log_level, thread_name, message, context)
            VALUES (?::uuid, ?, ?, ?, ?::jsonb)
            """;

    private static final ThreadLocal<JobLogContext> jobContext = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> writingToJobLog = ThreadLocal.withInitial(() -> false);

    static {
        System.setProperty(LOG_FORMAT_PROPERTY, DEFAULT_LOG_FORMAT);
    }

    private LoggingUtils() {
        throw new UnsupportedOperationException("Utility class");
    }

    /**
     * Context for job logging - holds job ID and database connection.
     */
    public static class JobLogContext {
        private final UUID jobId;
        private final Connection connection;
        private final boolean enabled;
        private volatile boolean hasSevereError = false;

        public JobLogContext(UUID jobId, Connection connection, boolean enabled) {
            this.jobId = jobId;
            this.connection = connection;
            this.enabled = enabled;
        }

        public UUID getJobId() { return jobId; }
        public Connection getConnection() { return connection; }
        public boolean isEnabled() { return enabled; }
        public boolean hasSevereError() { return hasSevereError; }
        public void setSevereError() { this.hasSevereError = true; }
    }

    /**
     * Sets the job context for the current thread. Log messages will be written
     * to the dc_job_log table when a context is set and job logging is enabled.
     *
     * @param jobId Job ID to associate with log entries
     * @param connection Database connection for writing logs
     */
    public static void setJobContext(UUID jobId, Connection connection) {
        boolean enabled = Boolean.parseBoolean(Props.getProperty("job-logging-enabled", "false"));
        jobContext.set(new JobLogContext(jobId, connection, enabled));
    }

    /**
     * Clears the job context for the current thread.
     */
    public static void clearJobContext() {
        jobContext.remove();
    }

    /**
     * Gets the current job context for the current thread.
     *
     * @return The current JobLogContext or null if not set
     */
    public static JobLogContext getJobContext() {
        return jobContext.get();
    }

    /**
     * Checks if the current job has encountered any SEVERE errors.
     *
     * @return true if SEVERE errors occurred during the job, false otherwise
     */
    public static boolean hasJobSevereError() {
        JobLogContext ctx = jobContext.get();
        return ctx != null && ctx.hasSevereError();
    }

    /**
     * Initializes the logging configuration based on provided properties.
     */
    public static void initialize() {
        Level level = mapLogLevel(Props.getProperty("log-level", "INFO"));
        LOGGER.setLevel(level);
        LOGGER.setUseParentHandlers(false);

        setupConsoleHandler(level);
        setupFileHandler(level);
    }

    private static void setupConsoleHandler(Level level) {
        if (LOGGER.getHandlers().length == 0) {
            ConsoleHandler consoleHandler = new ConsoleHandler();
            consoleHandler.setLevel(level);
            consoleHandler.setFormatter(new SimpleFormatter());
            LOGGER.addHandler(consoleHandler);
        } else {
            for (Handler handler : LOGGER.getHandlers()) {
                handler.setLevel(level);
            }
        }
    }

    private static void setupFileHandler(Level level) {
        String destination = Props.getProperty("log-destination", STDOUT).trim();

        if (!STDOUT.equalsIgnoreCase(destination)) {
            try {
                Files.createDirectories(Paths.get(destination).getParent());

                FileHandler fileHandler = new FileHandler(destination, true);
                fileHandler.setLevel(level);
                fileHandler.setFormatter(new SimpleFormatter());
                LOGGER.addHandler(fileHandler);
            } catch (IOException e) {
                System.err.printf("Warning: Cannot write to log file '%s'. Falling back to stdout.%n", destination);
            }
        }
    }

    private static Level mapLogLevel(String setting) {
        return switch (setting.trim().toUpperCase()) {
            case "DEBUG" -> Level.FINE;
            case "TRACE" -> Level.FINEST;
            case "WARN", "WARNING" -> Level.WARNING;
            case "ERROR", "SEVERE" -> Level.SEVERE;
            case "ALL" -> Level.ALL;
            case "OFF" -> Level.OFF;
            case "INFO" -> Level.INFO;
            default -> Level.INFO;
        };
    }

    /**
     * Logs a message with the specified severity.
     *
     * @param severity the severity level (e.g., INFO, WARNING, ERROR)
     * @param module   the source module name
     * @param message  the message to log
     */
    public static void write(String severity, String module, String message) {
        write(severity, module, message, null);
    }

    /**
     * Logs a message with the specified severity and optional JSON context.
     *
     * @param severity the severity level (e.g., INFO, WARNING, ERROR)
     * @param module   the source module name
     * @param message  the message to log
     * @param jsonContext optional JSON context for structured data (can be null)
     */
    public static void write(String severity, String module, String message, String jsonContext) {
        Level level = mapLogLevel(severity);
        String formattedMessage = String.format(MODULE_FORMAT, module, message);
        LOGGER.log(level, formattedMessage);

        // Track SEVERE errors for job status
        if (level == Level.SEVERE) {
            JobLogContext ctx = jobContext.get();
            if (ctx != null) {
                ctx.setSevereError();
            }
        }

        // Only write to job log if message meets configured log level threshold
        Level configuredLevel = mapLogLevel(Props.getProperty("log-level", "INFO"));
        if (level.intValue() >= configuredLevel.intValue()) {
            writeToJobLog(severity, module, message, jsonContext);
        }
    }

    /**
     * Writes a log entry to the dc_job_log table if job context is set and enabled.
     * Uses direct JDBC to avoid recursion through SQLExecutionHelper which logs.
     * Commits immediately to ensure logs are visible in real-time.
     */
    private static void writeToJobLog(String severity, String module, String message, String jsonContext) {
        // Prevent re-entrancy - if we're already writing to job log, don't recurse
        if (Boolean.TRUE.equals(writingToJobLog.get())) {
            return;
        }

        JobLogContext ctx = jobContext.get();
        if (ctx == null || !ctx.isEnabled() || ctx.getConnection() == null) {
            return;
        }

        writingToJobLog.set(true);
        try {
            Connection conn = ctx.getConnection();
            // Use direct JDBC instead of SQLExecutionHelper to avoid recursion
            // SQLExecutionHelper.simpleUpdate calls LoggingUtils.write which would cause infinite loop
            try (PreparedStatement pstmt = conn.prepareStatement(SQL_JOBLOG_INSERT)) {
                pstmt.setString(1, ctx.getJobId().toString());
                pstmt.setString(2, severity.toUpperCase());
                pstmt.setString(3, module);
                pstmt.setString(4, message);
                pstmt.setString(5, jsonContext);
                pstmt.executeUpdate();
                // Always commit immediately to make logs visible in real-time
                if (!conn.getAutoCommit()) {
                    conn.commit();
                }
            }
        } catch (Exception e) {
            // Don't let logging failures break the application
            // Log to console only to avoid any possibility of recursion
            LOGGER.log(Level.WARNING, String.format("[%-24s] Failed to write to job log: %s", "logging", e.getMessage()));
        } finally {
            writingToJobLog.set(false);
        }
    }
}

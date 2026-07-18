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

package com.crunchydata.config;

import java.sql.Statement;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Singleton class that manages global application state for signal handling.
 * Provides thread-safe flags for shutdown requests and configuration reload.
 * 
 * Signal handling:
 * - SIGINT (Ctrl+C): Graceful shutdown - complete current table comparison
 * - SIGTERM: Immediate termination - cancel all queries and stop
 * - SIGHUP: Reload configuration file
 *
 * @author Brian Pace
 */
public class ApplicationState {

    private static final ApplicationState INSTANCE = new ApplicationState();

    private final AtomicBoolean gracefulShutdownRequested = new AtomicBoolean(false);
    private final AtomicBoolean immediateTerminationRequested = new AtomicBoolean(false);
    private final AtomicBoolean reloadRequested = new AtomicBoolean(false);
    private final AtomicBoolean shutdownComplete = new AtomicBoolean(false);
    
    private final Set<Statement> activeStatements = Collections.newSetFromMap(new ConcurrentHashMap<>());

    private ApplicationState() {
    }

    public static ApplicationState getInstance() {
        return INSTANCE;
    }

    /**
     * Request a graceful shutdown of the application.
     * Current table comparison will complete before exit.
     */
    public void requestGracefulShutdown() {
        gracefulShutdownRequested.set(true);
    }

    /**
     * Request immediate termination of the application.
     * All queries will be cancelled and application will exit.
     */
    public void requestImmediateTermination() {
        immediateTerminationRequested.set(true);
        gracefulShutdownRequested.set(true);
        cancelAllStatements();
    }

    /**
     * Check if any shutdown has been requested (graceful or immediate).
     *
     * @return true if shutdown was requested
     */
    public boolean isShutdownRequested() {
        return gracefulShutdownRequested.get() || immediateTerminationRequested.get();
    }

    /**
     * Check if graceful shutdown has been requested.
     *
     * @return true if graceful shutdown was requested
     */
    public boolean isGracefulShutdownRequested() {
        return gracefulShutdownRequested.get() && !immediateTerminationRequested.get();
    }

    /**
     * Check if immediate termination has been requested.
     *
     * @return true if immediate termination was requested
     */
    public boolean isImmediateTerminationRequested() {
        return immediateTerminationRequested.get();
    }

    /**
     * Mark shutdown as complete.
     */
    public void markShutdownComplete() {
        shutdownComplete.set(true);
    }

    /**
     * Check if shutdown is complete.
     *
     * @return true if shutdown is complete
     */
    public boolean isShutdownComplete() {
        return shutdownComplete.get();
    }

    /**
     * Request a configuration reload.
     */
    public void requestReload() {
        reloadRequested.set(true);
    }

    /**
     * Check and clear the reload request flag.
     *
     * @return true if reload was requested (and clears the flag)
     */
    public boolean checkAndClearReloadRequest() {
        return reloadRequested.getAndSet(false);
    }

    /**
     * Check if reload has been requested without clearing the flag.
     *
     * @return true if reload was requested
     */
    public boolean isReloadRequested() {
        return reloadRequested.get();
    }

    /**
     * Register an active statement for potential cancellation.
     *
     * @param stmt the statement to register
     */
    public void registerStatement(Statement stmt) {
        if (stmt != null) {
            activeStatements.add(stmt);
        }
    }

    /**
     * Unregister a statement when it completes.
     *
     * @param stmt the statement to unregister
     */
    public void unregisterStatement(Statement stmt) {
        if (stmt != null) {
            activeStatements.remove(stmt);
        }
    }

    /**
     * Cancel all registered active statements.
     */
    public void cancelAllStatements() {
        for (Statement stmt : activeStatements) {
            try {
                if (stmt != null && !stmt.isClosed()) {
                    stmt.cancel();
                }
            } catch (Exception e) {
                // Ignore cancellation errors
            }
        }
        activeStatements.clear();
    }

    /**
     * Get the number of active statements.
     *
     * @return count of active statements
     */
    public int getActiveStatementCount() {
        return activeStatements.size();
    }

    /**
     * Reset all state flags. Useful for testing.
     */
    public void reset() {
        gracefulShutdownRequested.set(false);
        immediateTerminationRequested.set(false);
        reloadRequested.set(false);
        shutdownComplete.set(false);
        activeStatements.clear();
    }
}

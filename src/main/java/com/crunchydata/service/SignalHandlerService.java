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
import com.crunchydata.util.LoggingUtils;
import sun.misc.Signal;

/**
 * Service that registers and handles OS signals for shutdown and configuration reload.
 * 
 * Supported signals:
 * - SIGINT (2): Graceful shutdown - allows current table comparison to complete (Ctrl+C)
 * - SIGTERM (15): Immediate termination - cancels all queries and exits
 * - SIGHUP (1): Reload configuration from properties file
 *
 * @author Brian Pace
 */
public class SignalHandlerService {

    private static final String THREAD_NAME = "signal-handler";
    private static boolean initialized = false;

    private SignalHandlerService() {
    }

    /**
     * Register all signal handlers. Should be called once during application startup.
     */
    public static synchronized void initialize() {
        if (initialized) {
            LoggingUtils.write("warning", THREAD_NAME, "Signal handlers already initialized");
            return;
        }

        try {
            registerGracefulShutdownHandler("INT");
            registerImmediateTerminationHandler("TERM");
            registerReloadHandler("HUP");
            
            initialized = true;
            LoggingUtils.write("info", THREAD_NAME, 
                "Signal handlers registered: SIGINT (graceful), SIGTERM (immediate), SIGHUP (reload)");
        } catch (IllegalArgumentException e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Could not register signal handlers (may not be supported on this platform): %s", e.getMessage()));
        }
    }

    /**
     * Register a graceful shutdown signal handler (SIGINT/Ctrl+C).
     * Allows current table comparison to complete before exit.
     *
     * @param signalName The signal name (e.g., "INT")
     */
    private static void registerGracefulShutdownHandler(String signalName) {
        try {
            Signal.handle(new Signal(signalName), signal -> {
                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Received SIG%s - initiating graceful shutdown (current table will complete)", signalName));
                ApplicationState.getInstance().requestGracefulShutdown();
            });
        } catch (IllegalArgumentException e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Could not register SIG%s handler: %s", signalName, e.getMessage()));
        }
    }

    /**
     * Register an immediate termination signal handler (SIGTERM).
     * Cancels all queries and exits immediately.
     *
     * @param signalName The signal name (e.g., "TERM")
     */
    private static void registerImmediateTerminationHandler(String signalName) {
        try {
            Signal.handle(new Signal(signalName), signal -> {
                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Received SIG%s - cancelling all queries and terminating immediately", signalName));
                ApplicationState.getInstance().requestImmediateTermination();
            });
        } catch (IllegalArgumentException e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Could not register SIG%s handler: %s", signalName, e.getMessage()));
        }
    }

    /**
     * Register a reload signal handler for SIGHUP.
     *
     * @param signalName The signal name (should be "HUP")
     */
    private static void registerReloadHandler(String signalName) {
        try {
            Signal.handle(new Signal(signalName), signal -> {
                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Received SIG%s - requesting configuration reload", signalName));
                ApplicationState.getInstance().requestReload();
                
                try {
                    Settings.reloadProperties();
                    LoggingUtils.write("info", THREAD_NAME, "Configuration reloaded successfully");
                } catch (Exception e) {
                    LoggingUtils.write("severe", THREAD_NAME, 
                        String.format("Failed to reload configuration: %s", e.getMessage()));
                }
            });
        } catch (IllegalArgumentException e) {
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("Could not register SIG%s handler: %s", signalName, e.getMessage()));
        }
    }

    /**
     * Check if signal handlers are supported on the current platform.
     *
     * @return true if signal handlers can be registered
     */
    public static boolean isSignalHandlingSupported() {
        try {
            new Signal("TERM");
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}

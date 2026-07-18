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

package com.crunchydata.core.threading;

import com.crunchydata.config.ApplicationState;

/**
 * Utility class for thread synchronization.
 *
 * <p>This class provides synchronized methods for threads to wait and notify each other.</p>
 *
 * <p>It includes flags to indicate the status of source and target operations, as well as a counter for completed loader threads.</p>
 *
 * <p>Usage example:</p>
 * <pre>
 * {@code
 * ThreadSync sync = new ThreadSync();
 *
 * // In a thread
 * sync.ObserverWait();
 *
 * // In another thread
 * sync.ObserverNotify();
 * }
 * </pre>
 *
 * @see java.lang.Object#wait()
 * @see java.lang.Object#notifyAll()
 * @see java.lang.Exception#getMessage()
 *
 * @author Brian Pace
 */
public class ThreadSync {

    public volatile boolean sourceComplete = false;
    public volatile boolean targetComplete = false;

    public volatile boolean sourceWaiting = false;
    public volatile boolean targetWaiting = false;

    public volatile int loaderThreadComplete = 0;

    /**
     * Monotonic counter incremented on every observerNotify(). Used as a wait
     * predicate so a notify that arrives before observerWait() is entered is not
     * lost (classic missed-wakeup), and to ignore spurious wakeups.
     */
    private long notifyGeneration = 0;

    /**
     * Maximum time a producer will block in observerWait() before proceeding
     * anyway. This is a safety net: the wait is only a throttle that lets the
     * observer drain the staging tables, so proceeding early can never corrupt
     * results - at worst the staging tables grow slightly larger. It guarantees
     * a producer can never hang forever if the observer has already exited.
     */
    private static final long MAX_OBSERVER_WAIT_MS = 60000;

    /**
     * Increase the number of threads complete.
     */
    public synchronized void incrementLoaderThreadComplete() {
        loaderThreadComplete++;
    }

    /**
     * Causes the current thread to wait until it is notified by the observer.
     *
     * <p>Uses a generation counter as the wait predicate to avoid lost wakeups,
     * and a bounded wait so a producer can never block indefinitely if the
     * observer has already completed.</p>
     */
    public synchronized void observerWait() {
        long startGeneration = notifyGeneration;
        long deadline = System.currentTimeMillis() + MAX_OBSERVER_WAIT_MS;

        while (notifyGeneration == startGeneration) {
            long remaining = deadline - System.currentTimeMillis();
            if (remaining <= 0) {
                // Timeout safety net - proceed without corrupting results.
                return;
            }
            try {
                wait(remaining);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt(); // Restore interrupted status
                return;
            }
        }
    }

    /**
     * Advances the notify generation and wakes up all threads waiting on this
     * object's monitor. Incrementing the generation before notifying ensures a
     * producer that has not yet called observerWait() will observe the change
     * and skip waiting rather than block on an already-delivered notification.
     */
    public synchronized void observerNotify() {
        notifyGeneration++;
        notifyAll();
    }

    /**
     * Check if a graceful shutdown has been requested.
     *
     * @return true if shutdown was requested via signal
     */
    public boolean isShutdownRequested() {
        return ApplicationState.getInstance().isShutdownRequested();
    }

}

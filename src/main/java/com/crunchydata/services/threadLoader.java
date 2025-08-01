/*
 * Copyright 2012-2024 the original author or authors.
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

package com.crunchydata.services;

import com.crunchydata.models.DataCompare;
import com.crunchydata.util.Logging;
import com.crunchydata.util.ThreadSync;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

import static com.crunchydata.services.dbConnection.getConnection;


/**
 * Thread class responsible for loading data into the repository database.
 *
 * <p>This class extends Thread and implements the logic to retrieve DataCompare objects
 * from a blocking queue and insert them into a staging table in the repository database.</p>
 *
 * <p>The loader thread runs until both source and target complete flags are set to true
 * in the ThreadSync object provided during initialization.</p>
 *
 * @author Brian Pace
 */
public class threadLoader extends Thread  {
    private final BlockingQueue<DataCompare[]> q;
    private final Integer instanceNumber;
    private final String stagingTable;
    private final String targetType;
    private final Integer threadNumber;
    private final ThreadSync ts;

    /**
     * Constructor for initializing a dbLoader instance.
     *
     * @param threadNumber The number identifying the thread within its type.
     * @param instanceNumber The instance number of the thread.
     * @param targetType The type of data being loaded ("source" or "target").
     * @param q The BlockingQueue containing DataCompare objects to load.
     * @param stagingTable The name of the staging table in the repository database.
     * @param ts The ThreadSync object for coordinating thread synchronization.
     */
    public threadLoader(Integer threadNumber, Integer instanceNumber, String targetType, BlockingQueue<DataCompare[]> q, String stagingTable, ThreadSync ts) {
        this.q = q;
        this.instanceNumber = instanceNumber;
        this.stagingTable = stagingTable;
        this.targetType = targetType;
        this.threadNumber = threadNumber;
        this.ts = ts;
    }

    /**
     * Runs the loader thread logic.
     *
     * <p>The thread connects to the repository database, prepares an INSERT statement
     * for the staging table, and continuously polls the blocking queue for DataCompare
     * objects to insert. It commits batches of inserts and checks ThreadSync flags to
     * determine when to stop loading.</p>
     */
    @Override
    public void run() {
        String threadName = String.format("loader-%s-t%s-i%s", targetType, threadNumber, instanceNumber);
        Logging.write("info", threadName, "Start repository loader thread");

        Connection connRepo = null;
        PreparedStatement stmtLoad = null;

        try {
            // Connect to Repository
            Logging.write("info", threadName, "Connecting to repository database");
            connRepo = getConnection("postgres", "repo");

            if (connRepo == null) {
                Logging.write("severe", threadName, "Cannot connect to repository database");
                System.exit(1);
            }

            SQLService.simpleExecute(connRepo,"set synchronous_commit='off'");
            SQLService.simpleExecute(connRepo,"set work_mem='256MB'");

            connRepo.setAutoCommit(false);

            // Prepare INSERT statement for the staging table
            String sqlLoad = String.format("INSERT INTO %s (tid, pk_hash, column_hash, pk) VALUES (?, ?,?,(?)::jsonb)",stagingTable);
            connRepo.setAutoCommit(false);
            stmtLoad = connRepo.prepareStatement(sqlLoad);

            boolean stillLoading = true;

            // Main loop to load data into the repository
            while (stillLoading) {

                // Poll for DataCompare array from the blocking queue
                DataCompare[] dc = q.poll(500, TimeUnit.MILLISECONDS);

                if (dc != null && dc.length > 0) {
                    // Process each DataCompare object
                    for (DataCompare dataCompare : dc) {
                        if (dataCompare != null && dataCompare.getPk() != null) {
                            stmtLoad.setInt(1, dataCompare.getTid());
                            stmtLoad.setString(2, dataCompare.getPkHash());
                            stmtLoad.setString(3, dataCompare.getColumnHash());
                            stmtLoad.setString(4, dataCompare.getPk());
                            stmtLoad.addBatch();
                            stmtLoad.clearParameters();
                        } else {
                            // Exit loop if null or incomplete DataCompare object
                            break;
                        }
                    }

                    // Execute batch insert and commit transaction
                    stmtLoad.executeBatch();
                    stmtLoad.clearBatch();
                    connRepo.commit();
                }

                // Check if both source and target are complete
                if (ts.sourceComplete && ts.targetComplete) {
                    stillLoading = false;
                }
            }

            Logging.write("info", threadName, "Loader thread complete.");

            stmtLoad.close();
            connRepo.close();

            stmtLoad = null;
            connRepo = null;

            ts.incrementLoaderThreadComplete();

        } catch( SQLException e) {
            StackTraceElement[] stackTrace = e.getStackTrace();
            Logging.write("severe", threadName, String.format("Database error at line %s:  %s", stackTrace[0].getLineNumber(), e.getMessage()));
        } catch (Exception e) {
            StackTraceElement[] stackTrace = e.getStackTrace();
            Logging.write("severe", threadName, String.format("Error in loader thread at line %s:  %s", stackTrace[0].getLineNumber(), e.getMessage()));
        } finally {
            // Close PreparedStatement and Connection in finally block
            try {
                if (stmtLoad != null) {
                    stmtLoad.close();
                }

                if (connRepo != null) {
                    connRepo.close();
                }
            } catch (Exception e) {
                StackTraceElement[] stackTrace = e.getStackTrace();
                Logging.write("severe", threadName, String.format("Error closing connections at line %s:  %s", stackTrace[0].getLineNumber(), e.getMessage()));
            }
        }
    }
}

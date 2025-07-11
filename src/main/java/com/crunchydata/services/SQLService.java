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

import com.crunchydata.util.Logging;

import javax.sql.rowset.CachedRowSet;
import javax.sql.rowset.RowSetProvider;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;

/**
 * Utility class that contains common actions performed against the database
 * which are agnostic to the database platform.
 *
 * @author Brian Pace
 */
public class SQLService {
    private static final String THREAD_NAME = "common";

    /**
     * Utility method to execute a parameterized SQL query and return the results as a CachedRowSet.
     *
     * <p>This method prepares a PreparedStatement with the provided SQL query and binds parameters
     * from the given ArrayList. It then executes the query, populates a CachedRowSet with the
     * ResultSet data, and returns the CachedRowSet.</p>
     *
     * <p>If any exception occurs during the execution, a severe-level log message is written
     * using the Logging utility.</p>
     *
     * @param conn The database Connection object to use for executing the query.
     * @param sql The SQL query to execute, with placeholders for parameters.
     * @param binds The ArrayList containing the parameters to bind to the PreparedStatement.
     * @return A CachedRowSet containing the results of the query.
     */
    public static CachedRowSet simpleSelect(Connection conn, String sql, ArrayList<Object> binds) {
        ResultSet rs;
        PreparedStatement stmt;
        CachedRowSet crs = null;

        try {
            // Create a new CachedRowSet
            crs = RowSetProvider.newFactory().createCachedRowSet();

            // Prepare the PreparedStatement with the provided SQL query
            stmt = conn.prepareStatement(sql);

            // Bind parameters to the PreparedStatement
            for (int counter = 0; counter < binds.size(); counter++) {
                stmt.setObject(counter+1, binds.get(counter));
            }

            // Execute the query and populate the ResultSet
            rs = stmt.executeQuery();
            crs.populate(rs);

            // Close the ResultSet and PreparedStatement
            rs.close();
            stmt.close();
        } catch (Exception e) {
            // Log severe-level error if an exception occurs
            Logging.write("severe", THREAD_NAME, "Error executing simple select (" + sql + "):  " + e.getMessage());
        }

        // Return the CachedRowSet containing the query results
        return crs;
    }

    /**
     * Utility method to execute a parameterized SQL query and return a single Integer.
     *
     * <p>This method prepares a PreparedStatement with the provided SQL query and binds parameters
     * from the given ArrayList. It then executes the query, extracts the first row and first
     * column and returns the value.</p>
     *
     * <p>If any exception occurs during the execution, a severe-level log message is written
     * using the Logging utility.</p>
     *
     * @param conn The database Connection object to use for executing the query.
     * @param sql The SQL query to execute, with placeholders for parameters.
     * @param binds The ArrayList containing the parameters to bind to the PreparedStatement.
     * @return Integer.
     */
    public static Integer simpleSelectReturnInteger(Connection conn, String sql, ArrayList<Object> binds) {
        ResultSet rs;
        PreparedStatement stmt;
        Integer returnValue=null;

        try {
            // Prepare the PreparedStatement with the provided SQL query
            stmt = conn.prepareStatement(sql);

            // Bind parameters to the PreparedStatement
            for (int counter = 0; counter < binds.size(); counter++) {
                stmt.setObject(counter+1, binds.get(counter));
            }

            // Execute the query and populate the ResultSet
            rs = stmt.executeQuery();

            if (rs.next()) {
                returnValue = rs.getInt(1);
            }

            // Close the ResultSet and PreparedStatement
            rs.close();
            stmt.close();
        } catch (Exception e) {
            // Log severe-level error if an exception occurs
            Logging.write("severe", THREAD_NAME, "Error executing simple select (" + sql + "):  " + e.getMessage());
        }

        // Return the CachedRowSet containing the query results
        return returnValue;
    }

    /**
     * Utility method to execute a parameterized SQL query and return a single Integer.
     *
     * <p>This method prepares a PreparedStatement with the provided SQL query and binds parameters
     * from the given ArrayList. It then executes the query, extracts the first row and first
     * column and returns the value.</p>
     *
     * <p>If any exception occurs during the execution, a severe-level log message is written
     * using the Logging utility.</p>
     *
     * @param conn The database Connection object to use for executing the query.
     * @param sql The SQL query to execute, with placeholders for parameters.
     * @param binds The ArrayList containing the parameters to bind to the PreparedStatement.
     * @return Integer.
     */
    public static String simpleSelectReturnString(Connection conn, String sql, ArrayList<Object> binds) {
        ResultSet rs;
        PreparedStatement stmt;
        String returnValue=null;

        try {
            // Prepare the PreparedStatement with the provided SQL query
            stmt = conn.prepareStatement(sql);

            // Bind parameters to the PreparedStatement
            for (int counter = 0; counter < binds.size(); counter++) {
                stmt.setObject(counter+1, binds.get(counter));
            }

            // Execute the query and populate the ResultSet
            rs = stmt.executeQuery();

            if (rs.next()) {
                returnValue = rs.getString(1);
            }

            // Close the ResultSet and PreparedStatement
            rs.close();
            stmt.close();
        } catch (Exception e) {
            // Log severe-level error if an exception occurs
            Logging.write("severe", THREAD_NAME, "Error executing simple select (" + sql + "):  " + e.getMessage());
        }

        // Return the CachedRowSet containing the query results
        return returnValue;
    }

    /**
     * Utility method to execute a parameterized DML SQL query and return the count of rows impacted.
     *
     * <p>This method prepares a PreparedStatement with the provided SQL query (DML) and binds parameters
     * from the given ArrayList. It then executes the query, populates cnt variable with the
     * number of rows impacted.</p>
     *
     * <p>If any exception occurs during the execution, a severe-level log message is written
     * using the Logging utility.</p>
     *
     * @param conn The database Connection object to use for executing the query.
     * @param sql The SQL query to execute, with placeholders for parameters.
     * @param binds The ArrayList containing the parameters to bind to the PreparedStatement.
     * @return Integer containing the number of rows impacted by the query.
     */
    public static Integer simpleUpdate(Connection conn, String sql, ArrayList<Object> binds, Boolean commit) {
        int cnt;

        try {
            // Prepare the PreparedStatement with the provided SQL query
            PreparedStatement stmt = conn.prepareStatement(sql);

            stmt.setFetchSize(2000);

            // Bind parameters to the PreparedStatement
            for (int counter = 0; counter < binds.size(); counter++) {
                stmt.setObject(counter+1, binds.get(counter));
            }

            // Execute the query and get impacted row count
            cnt = stmt.executeUpdate();

            // Close PreparedStatement
            stmt.close();

            // Conditionally Commit Transaction
            if (commit) {
                conn.commit();
            }

        } catch (Exception e) {
            Logging.write("severe", THREAD_NAME, "Error executing simple update (" + sql + "):  " + e.getMessage());

            try { conn.rollback(); } catch (Exception ee) {
                // do nothing
            }

            cnt = -1;
        }

        return cnt;
    }

    /**
     * Utility method to execute a parameterized SQL query (DML) and return the results as a CachedRowSet.
     *
     * <p>This method prepares a PreparedStatement with the provided SQL query and binds parameters
     * from the given ArrayList. It then executes the query, populates a CachedRowSet with the
     * ResultSet data, and returns the CachedRowSet.</p>
     *
     * <p>If any exception occurs during the execution, a severe-level log message is written
     * using the Logging utility.</p>
     *
     * @param conn The database Connection object to use for executing the query.
     * @param sql The SQL query to execute, with placeholders for parameters.
     * @param binds The ArrayList containing the parameters to bind to the PreparedStatement.
     * @return A CachedRowSet containing the results of the query.
     */
    public static CachedRowSet simpleUpdateReturning(Connection conn, String sql, ArrayList<Object> binds) {
        CachedRowSet crs = null;

        try {
            // Create a new CachedRowSet
            crs = RowSetProvider.newFactory().createCachedRowSet();

            // Prepare the PreparedStatement with the provided SQL query
            PreparedStatement stmt = conn.prepareStatement(sql);

            stmt.setFetchSize(2000);

            // Bind parameters to the PreparedStatement
            for (int counter = 0; counter < binds.size(); counter++) {
                stmt.setObject(counter+1, binds.get(counter));
            }

            // Execute the query and populate the ResultSet
            ResultSet rs = stmt.executeQuery();
            crs.populate(rs);

            // Close the ResultSet and PreparedStatement
            rs.close();
            stmt.close();
            conn.commit();

        } catch (Exception e) {
            Logging.write("severe", THREAD_NAME, "Error executing simple update with returning (" + sql + "):  " + e.getMessage());
            try { conn.rollback(); } catch (Exception ee) {
                // do nothing
            }
        }

        return crs;
    }

    /**
     * Utility method to execute a parameterized SQL query (DML) and return a single Integer value.
     *
     * <p>This method prepares a PreparedStatement with the provided SQL query and binds parameters
     * from the given ArrayList. It then executes the query, returns a single Integer value.</p>
     *
     * <p>If any exception occurs during the execution, a severe-level log message is written
     * using the Logging utility.</p>
     *
     * @param conn The database Connection object to use for executing the query.
     * @param sql The SQL query to execute, with placeholders for parameters.
     * @param binds The ArrayList containing the parameters to bind to the PreparedStatement.
     * @return Integer.
     */
    public static Integer simpleUpdateReturningInteger(Connection conn, String sql, ArrayList<Object> binds) {
        Integer returnValue = null;

        try {
            // Prepare the PreparedStatement with the provided SQL query
            PreparedStatement stmt = conn.prepareStatement(sql);

            // Bind parameters to the PreparedStatement
            for (int counter = 0; counter < binds.size(); counter++) {
                stmt.setObject(counter+1, binds.get(counter));
            }

            // Execute the query and populate the ResultSet
            ResultSet rs = stmt.executeQuery();

            if (rs.next()) {
                returnValue = rs.getInt(1);
            }

            // Close the ResultSet and PreparedStatement
            rs.close();
            stmt.close();
            conn.commit();

        } catch (Exception e) {
            Logging.write("severe", THREAD_NAME, "Error executing simple update with returning (" + sql + "):  " + e.getMessage());
            try { conn.rollback(); } catch (Exception ee) {
                // do nothing
            }
        }

        return returnValue;
    }

    /**
     * Utility method to execute a parameterized SQL query.
     *
     * <p>This method prepares a PreparedStatement with the provided SQL query (DML) and binds parameters
     * from the given ArrayList. It then executes the query, populates cnt variable with the
     * number of rows impacted.</p>
     *
     * <p>If any exception occurs during the execution, a severe-level log message is written
     * using the Logging utility.</p>
     *
     * @param conn The database Connection object to use for executing the query.
     * @param sql The SQL query to execute, with placeholders for parameters.
     */
    public static void simpleExecute(Connection conn, String sql) {
        try {

            // Prepare the PreparedStatement with the provided SQL query
            PreparedStatement stmt = conn.prepareStatement(sql);

            // Execute the query
            stmt.execute();

            // Close the PreparedStatement
            stmt.close();

            if ( ! conn.getAutoCommit() ) {
                conn.commit();
            }
        } catch (Exception e) {
            Logging.write("severe", THREAD_NAME, "Error executing simple execute (" + sql + "):  " + e.getMessage());
            try { conn.rollback(); } catch (Exception ee) {
                // do nothing
            }
        }
    }
}

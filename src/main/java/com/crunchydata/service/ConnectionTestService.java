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

import com.crunchydata.util.LoggingUtils;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

import static com.crunchydata.config.Settings.Props;

/**
 * Service for testing database connections and returning detailed results.
 * 
 * @author Brian Pace
 */
public class ConnectionTestService {

    private static final String THREAD_NAME = "connection-test";

    /**
     * Result of a connection test.
     */
    public static class ConnectionTestResult {
        public boolean success;
        public String connectionType;
        public String databaseType;
        public String host;
        public int port;
        public String database;
        public String schema;
        public String user;
        public String databaseProductName;
        public String databaseProductVersion;
        public String driverName;
        public String driverVersion;
        public String errorMessage;
        public String errorDetail;
        public long responseTimeMs;

        public Map<String, Object> toMap() {
            Map<String, Object> result = new HashMap<>();
            result.put("success", success);
            result.put("connectionType", connectionType);
            result.put("databaseType", databaseType);
            result.put("host", host);
            result.put("port", port);
            result.put("database", database);
            result.put("schema", schema);
            result.put("user", user);
            result.put("databaseProductName", databaseProductName);
            result.put("databaseProductVersion", databaseProductVersion);
            result.put("driverName", driverName);
            result.put("driverVersion", driverVersion);
            result.put("errorMessage", errorMessage);
            result.put("errorDetail", errorDetail);
            result.put("responseTimeMs", responseTimeMs);
            return result;
        }

        @Override
        public String toString() {
            StringBuilder sb = new StringBuilder();
            sb.append(String.format("Connection Type: %s%n", connectionType));
            sb.append(String.format("Status: %s%n", success ? "SUCCESS" : "FAILED"));
            sb.append(String.format("Host: %s%n", host));
            sb.append(String.format("Port: %d%n", port));
            sb.append(String.format("Database: %s%n", database));
            sb.append(String.format("Schema: %s%n", schema));
            sb.append(String.format("User: %s%n", user));
            sb.append(String.format("Response Time: %d ms%n", responseTimeMs));
            
            if (success) {
                sb.append(String.format("Database Product: %s %s%n", databaseProductName, databaseProductVersion));
                sb.append(String.format("Driver: %s %s%n", driverName, driverVersion));
            } else {
                sb.append(String.format("Error: %s%n", errorMessage));
                if (errorDetail != null && !errorDetail.isEmpty()) {
                    sb.append(String.format("Detail: %s%n", errorDetail));
                }
            }
            
            return sb.toString();
        }
    }

    /**
     * Test a connection by type (repository, source, or target).
     *
     * @param connectionType The type of connection (repo, source, target)
     * @return ConnectionTestResult with the test results
     */
    public static ConnectionTestResult testConnection(String connectionType) {
        ConnectionTestResult result = new ConnectionTestResult();
        result.connectionType = connectionType;
        
        String prefix = connectionType.equals("repo") ? "repo" : connectionType;
        String platform = connectionType.equals("repo") ? "postgres" : Props.getProperty(connectionType + "-type");
        
        result.databaseType = platform;
        result.host = Props.getProperty(prefix + "-host");
        result.port = Integer.parseInt(Props.getProperty(prefix + "-port", "0"));
        result.database = Props.getProperty(prefix + "-dbname");
        result.schema = Props.getProperty(prefix + "-schema");
        result.user = Props.getProperty(prefix + "-user");
        
        long startTime = System.currentTimeMillis();
        Connection conn = null;
        
        try {
            LoggingUtils.write("info", THREAD_NAME, 
                String.format("Testing %s connection to %s:%d/%s", connectionType, result.host, result.port, result.database));
            
            conn = DatabaseConnectionService.getConnection(platform, prefix);
            
            if (conn == null) {
                result.success = false;
                result.errorMessage = "Failed to establish connection";
                result.errorDetail = "Connection returned null. Check credentials and network connectivity.";
            } else {
                result.success = true;
                
                DatabaseMetaData metaData = conn.getMetaData();
                result.databaseProductName = metaData.getDatabaseProductName();
                result.databaseProductVersion = metaData.getDatabaseProductVersion();
                result.driverName = metaData.getDriverName();
                result.driverVersion = metaData.getDriverVersion();
                
                LoggingUtils.write("info", THREAD_NAME, 
                    String.format("%s connection successful: %s %s", 
                        connectionType, result.databaseProductName, result.databaseProductVersion));
            }
        } catch (SQLException e) {
            result.success = false;
            result.errorMessage = e.getMessage();
            result.errorDetail = formatSQLException(e);
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("%s connection failed: %s", connectionType, e.getMessage()));
        } catch (Exception e) {
            result.success = false;
            result.errorMessage = e.getMessage();
            result.errorDetail = e.getClass().getName() + ": " + e.getMessage();
            LoggingUtils.write("warning", THREAD_NAME, 
                String.format("%s connection failed: %s", connectionType, e.getMessage()));
        } finally {
            result.responseTimeMs = System.currentTimeMillis() - startTime;
            if (conn != null) {
                try {
                    conn.close();
                } catch (SQLException e) {
                    // Ignore close errors
                }
            }
        }
        
        return result;
    }

    /**
     * Test all connections (repository, source, and target).
     *
     * @return Map containing results for each connection type
     */
    public static Map<String, ConnectionTestResult> testAllConnections() {
        Map<String, ConnectionTestResult> results = new HashMap<>();
        
        results.put("repository", testConnection("repo"));
        results.put("source", testConnection("source"));
        results.put("target", testConnection("target"));
        
        return results;
    }

    /**
     * Format a SQLException with all chained exceptions.
     */
    private static String formatSQLException(SQLException e) {
        StringBuilder sb = new StringBuilder();
        SQLException current = e;
        int count = 0;
        
        while (current != null && count < 5) {
            if (count > 0) {
                sb.append("\nCaused by: ");
            }
            sb.append(String.format("SQLState: %s, ErrorCode: %d, Message: %s",
                current.getSQLState(), current.getErrorCode(), current.getMessage()));
            current = current.getNextException();
            count++;
        }
        
        return sb.toString();
    }

    /**
     * Print test results to stdout in a formatted way.
     */
    public static void printResults(Map<String, ConnectionTestResult> results) {
        System.out.println();
        System.out.println("=".repeat(60));
        System.out.println("CONNECTION TEST RESULTS");
        System.out.println("=".repeat(60));
        
        for (Map.Entry<String, ConnectionTestResult> entry : results.entrySet()) {
            System.out.println();
            System.out.println("-".repeat(40));
            System.out.println(entry.getKey().toUpperCase());
            System.out.println("-".repeat(40));
            System.out.println(entry.getValue().toString());
        }
        
        System.out.println("=".repeat(60));
        
        boolean allSuccess = results.values().stream().allMatch(r -> r.success);
        System.out.println(String.format("Overall Status: %s", allSuccess ? "ALL CONNECTIONS SUCCESSFUL" : "SOME CONNECTIONS FAILED"));
        System.out.println("=".repeat(60));
        System.out.println();
    }

    /**
     * Print test results as JSON to stdout.
     */
    public static void printResultsAsJson(Map<String, ConnectionTestResult> results) {
        StringBuilder json = new StringBuilder();
        json.append("{\n");
        
        int i = 0;
        for (Map.Entry<String, ConnectionTestResult> entry : results.entrySet()) {
            if (i > 0) {
                json.append(",\n");
            }
            json.append(String.format("  \"%s\": %s", entry.getKey(), toJson(entry.getValue())));
            i++;
        }
        
        json.append("\n}");
        System.out.println(json.toString());
    }

    private static String toJson(ConnectionTestResult result) {
        StringBuilder json = new StringBuilder();
        json.append("{\n");
        json.append(String.format("    \"success\": %s,\n", result.success));
        json.append(String.format("    \"connectionType\": \"%s\",\n", escape(result.connectionType)));
        json.append(String.format("    \"databaseType\": \"%s\",\n", escape(result.databaseType)));
        json.append(String.format("    \"host\": \"%s\",\n", escape(result.host)));
        json.append(String.format("    \"port\": %d,\n", result.port));
        json.append(String.format("    \"database\": \"%s\",\n", escape(result.database)));
        json.append(String.format("    \"schema\": \"%s\",\n", escape(result.schema)));
        json.append(String.format("    \"user\": \"%s\",\n", escape(result.user)));
        json.append(String.format("    \"databaseProductName\": \"%s\",\n", escape(result.databaseProductName)));
        json.append(String.format("    \"databaseProductVersion\": \"%s\",\n", escape(result.databaseProductVersion)));
        json.append(String.format("    \"driverName\": \"%s\",\n", escape(result.driverName)));
        json.append(String.format("    \"driverVersion\": \"%s\",\n", escape(result.driverVersion)));
        json.append(String.format("    \"errorMessage\": \"%s\",\n", escape(result.errorMessage)));
        json.append(String.format("    \"errorDetail\": \"%s\",\n", escape(result.errorDetail)));
        json.append(String.format("    \"responseTimeMs\": %d\n", result.responseTimeMs));
        json.append("  }");
        return json.toString();
    }

    private static String escape(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                  .replace("\"", "\\\"")
                  .replace("\n", "\\n")
                  .replace("\r", "\\r")
                  .replace("\t", "\\t");
    }
}

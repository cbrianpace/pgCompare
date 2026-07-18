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

import com.crunchydata.config.Settings;
import com.crunchydata.core.database.SQLExecutionHelper;
import com.crunchydata.util.LoggingUtils;
import org.json.JSONObject;

import java.io.FileInputStream;
import java.io.IOException;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Properties;

public class ConfigImportService {

    private static final String THREAD_NAME = "config-import";

    private static final String SQL_CHECK_PROJECT_EXISTS = """
            SELECT pid FROM dc_project WHERE pid = ?
            """;

    private static final String SQL_INSERT_PROJECT = """
            INSERT INTO dc_project (project_name, project_config) VALUES (?, ?::jsonb)
            RETURNING pid
            """;

    private static final String SQL_UPDATE_PROJECT_CONFIG = """
            UPDATE dc_project SET project_config = ?::jsonb WHERE pid = ?
            """;

    public static ImportResult importFromProperties(Connection conn, Integer pid, String inputFile) 
            throws IOException, SQLException {
        
        LoggingUtils.write("info", THREAD_NAME, 
                String.format("Importing configuration from %s to project %d", inputFile, pid));

        Properties fileProps = new Properties();
        try (FileInputStream fis = new FileInputStream(inputFile)) {
            fileProps.load(fis);
        }

        Properties defaultProps = Settings.setDefaults();
        JSONObject configJson = new JSONObject();
        int importedCount = 0;
        int skippedCount = 0;

        for (String key : fileProps.stringPropertyNames()) {
            String rawValue = fileProps.getProperty(key);
            if (rawValue == null) {
                skippedCount++;
                continue;
            }
            String value = rawValue.trim();
            String defaultValue = defaultProps.getProperty(key);

            if (key.contains("password") || key.equals("config-file")) {
                skippedCount++;
                LoggingUtils.write("info", THREAD_NAME, 
                        String.format("Skipping sensitive/system property: %s", key));
                continue;
            }

            if (defaultValue == null || !value.equals(defaultValue)) {
                configJson.put(key, value);
                importedCount++;
                LoggingUtils.write("info", THREAD_NAME, 
                        String.format("Importing property: %s = %s", key, value));
            } else {
                skippedCount++;
            }
        }

        boolean projectExists = checkProjectExists(conn, pid);
        
        if (projectExists) {
            updateProjectConfig(conn, pid, configJson.toString());
            LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Updated existing project %d with configuration", pid));
        } else {
            Integer newPid = createProject(conn, "project-" + pid, configJson.toString());
            LoggingUtils.write("info", THREAD_NAME, 
                    String.format("Created new project with pid %d", newPid));
        }

        conn.commit();

        ImportResult result = new ImportResult(importedCount, skippedCount, projectExists);
        LoggingUtils.write("info", THREAD_NAME, 
                String.format("Import complete: %d properties imported, %d skipped, project %s", 
                        importedCount, skippedCount, projectExists ? "updated" : "created"));

        return result;
    }

    private static boolean checkProjectExists(Connection conn, Integer pid) {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(pid);
        Integer existingPid = SQLExecutionHelper.simpleSelectReturnInteger(conn, SQL_CHECK_PROJECT_EXISTS, binds);
        return existingPid != null;
    }

    private static void updateProjectConfig(Connection conn, Integer pid, String configJson) {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(configJson);
        binds.add(pid);
        SQLExecutionHelper.simpleUpdate(conn, SQL_UPDATE_PROJECT_CONFIG, binds, true);
    }

    private static Integer createProject(Connection conn, String projectName, String configJson) {
        ArrayList<Object> binds = new ArrayList<>();
        binds.add(projectName);
        binds.add(configJson);
        return SQLExecutionHelper.simpleUpdateReturningInteger(conn, SQL_INSERT_PROJECT, binds);
    }

    public record ImportResult(int propertiesImported, int propertiesSkipped, boolean projectUpdated) {}
}

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
import com.crunchydata.controller.RepoController;
import com.crunchydata.util.LoggingUtils;
import org.json.JSONObject;

import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;
import java.sql.Connection;
import java.util.Iterator;
import java.util.Properties;
import java.util.TreeSet;

public class ConfigExportService {

    private static final String THREAD_NAME = "config-export";

    public static ExportResult exportToProperties(Connection conn, Integer pid, String outputFile) 
            throws IOException {
        
        if (outputFile == null || outputFile.isEmpty()) {
            throw new IllegalArgumentException("Output file path is required for export-config. Use --file parameter.");
        }

        LoggingUtils.write("info", THREAD_NAME, 
                String.format("Exporting configuration from project %d to %s", pid, outputFile));

        String configJsonStr = RepoController.getProjectConfig(conn, pid);
        JSONObject configJson = new JSONObject(configJsonStr);

        if (configJson.isEmpty()) {
            LoggingUtils.write("warning", THREAD_NAME, 
                    String.format("No configuration found for project %d", pid));
            return new ExportResult(0, outputFile);
        }

        Properties defaultProps = Settings.setDefaults();
        int exportedCount = 0;

        try (PrintWriter writer = new PrintWriter(new FileWriter(outputFile))) {
            writer.println("# pgCompare Configuration");
            writer.println("# Exported from project " + pid);
            writer.println("# Only non-default values are included");
            writer.println();

            TreeSet<String> sortedKeys = new TreeSet<>();
            Iterator<String> keys = configJson.keys();
            while (keys.hasNext()) {
                sortedKeys.add(keys.next());
            }

            String currentSection = "";
            for (String key : sortedKeys) {
                String value = configJson.get(key).toString();
                String defaultValue = defaultProps.getProperty(key);

                if (defaultValue != null && value.equals(defaultValue)) {
                    continue;
                }

                String section = getSectionForKey(key);
                if (!section.equals(currentSection)) {
                    if (!currentSection.isEmpty()) {
                        writer.println();
                    }
                    writer.println("# " + section);
                    currentSection = section;
                }

                writer.println(key + "=" + value);
                exportedCount++;
                LoggingUtils.write("info", THREAD_NAME, 
                        String.format("Exported property: %s = %s", key, value));
            }
        }

        LoggingUtils.write("info", THREAD_NAME, 
                String.format("Export complete: %d properties exported to %s", exportedCount, outputFile));

        return new ExportResult(exportedCount, outputFile);
    }

    private static String getSectionForKey(String key) {
        if (key.startsWith("repo-")) {
            return "Repository Settings";
        } else if (key.startsWith("source-")) {
            return "Source Database Settings";
        } else if (key.startsWith("target-")) {
            return "Target Database Settings";
        } else {
            return "System Settings";
        }
    }

    public record ExportResult(int propertiesExported, String outputFile) {}
}

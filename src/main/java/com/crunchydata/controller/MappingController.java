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

package com.crunchydata.controller;

import com.crunchydata.service.MappingExportService;
import com.crunchydata.service.MappingImportService;
import com.crunchydata.util.LoggingUtils;

import java.sql.Connection;

public class MappingController {

    private static final String THREAD_NAME = "mapping-ctrl";

    public static void performExport(Connection connRepo, Integer pid, String tableFilter, String outputFile) {
        try {
            LoggingUtils.write("info", THREAD_NAME, "Starting mapping export");
            
            String file = outputFile;
            if (file == null || file.isEmpty()) {
                file = "pgcompare-mappings-" + pid + ".yaml";
            }

            MappingExportService.exportToYaml(connRepo, pid, tableFilter, file);
            
            LoggingUtils.write("info", THREAD_NAME, String.format("Export completed successfully to: %s", file));
            System.out.println("Export completed: " + file);

        } catch (Exception e) {
            LoggingUtils.write("severe", THREAD_NAME, String.format("Export failed: %s", e.getMessage()));
            throw new RuntimeException("Mapping export failed", e);
        }
    }

    public static void performImport(Connection connRepo, Integer pid, String tableFilter, 
                                      String inputFile, boolean overwrite) {
        try {
            LoggingUtils.write("info", THREAD_NAME, "Starting mapping import");

            if (inputFile == null || inputFile.isEmpty()) {
                throw new IllegalArgumentException("Input file is required for import. Use --file option.");
            }

            MappingImportService.ImportResult result = MappingImportService.importFromYaml(
                    connRepo, pid, inputFile, overwrite, tableFilter);

            LoggingUtils.write("info", THREAD_NAME, "Import completed successfully");
            System.out.println("Import completed:");
            System.out.println("  Tables added:   " + result.tablesAdded());
            System.out.println("  Tables updated: " + result.tablesUpdated());
            System.out.println("  Tables skipped: " + result.tablesSkipped());
            System.out.println("  Columns processed: " + result.columnsProcessed());

        } catch (Exception e) {
            LoggingUtils.write("severe", THREAD_NAME, String.format("Import failed: %s", e.getMessage()));
            throw new RuntimeException("Mapping import failed", e);
        }
    }
}

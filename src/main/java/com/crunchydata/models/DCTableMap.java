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


package com.crunchydata.models;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DCTableMap {
    private Integer tid;
    private String destType = "target";
    private String schemaName;
    private String tableName;
    private String modColumn;
    private String tableFilter;
    private boolean tablePreserveCase = false;
    private boolean schemaPreserveCase = false;
    //Not from Table
    private Integer batchNbr;
    private String compareSQL;
    private String tableAlias;
    private Integer pid;
}

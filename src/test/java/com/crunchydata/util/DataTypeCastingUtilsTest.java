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

package com.crunchydata.util;

import com.crunchydata.config.Settings;
import org.json.JSONObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Golden-master (characterization) tests for {@link DataTypeCastingUtils}.
 *
 * <p>These tests lock in the EXACT compare/hash SQL expressions generated for each
 * data type across every supported platform. Cross-platform correctness depends on
 * source and target producing byte-identical hash input, so any unintended change to
 * these expressions is a correctness bug (e.g. false missing/not-equal findings).</p>
 *
 * <p>The expected strings below are a snapshot of the validated, production-correct
 * behavior. If a change to {@code DataTypeCastingUtils} causes a failure here, treat it
 * as a regression unless the expression change is intentional AND re-validated against
 * real source/target databases per TESTING.md.</p>
 *
 * <p>Tests are pure (no database) and run in milliseconds.</p>
 *
 * @author pgCompare
 */
class DataTypeCastingUtilsTest {

    private static final String COL = "col";

    /**
     * Configure the property values these casts depend on. Defaults mirror the
     * documented defaults (number-cast=notation, float-scale=3, database hash).
     */
    @BeforeEach
    void setUp() {
        Settings.Props.setProperty("number-cast", "notation");
        Settings.Props.setProperty("float-scale", "3");
        Settings.Props.setProperty("standard-number-format", "0000000000000000000000.0000000000000000000000");
        Settings.Props.setProperty("column-hash-method", "database");
    }

    private JSONObject col(int dataLength) {
        JSONObject c = new JSONObject();
        c.put("dataLength", dataLength);
        return c;
    }

    @Nested
    @DisplayName("Timestamp casting")
    class TimestampCasting {

        @Test
        void postgresTimestampNoTz() {
            assertEquals(
                "coalesce(to_char(col,'MMDDYYYYHH24MISS'),' ')",
                DataTypeCastingUtils.castTimestamp("timestamp", COL, "postgres"));
        }

        @Test
        void postgresTimestamptzGetsUtcConversion() {
            assertEquals(
                "coalesce(to_char(col at time zone 'UTC','MMDDYYYYHH24MISS'),' ')",
                DataTypeCastingUtils.castTimestamp("timestamptz", COL, "postgres"));
        }

        @Test
        @DisplayName("timestamp_ntz must NOT get tz conversion (ntz override)")
        void postgresTimestampNtzNoTzConversion() {
            assertEquals(
                "coalesce(to_char(col,'MMDDYYYYHH24MISS'),' ')",
                DataTypeCastingUtils.castTimestamp("timestamp_ntz", COL, "postgres"));
        }

        @Test
        void oracleTimestamp() {
            assertEquals(
                "nvl(to_char(col,'MMDDYYYYHH24MISS'),' ')",
                DataTypeCastingUtils.castTimestamp("timestamp", COL, "oracle"));
        }

        @Test
        void mysqlDatetimeConvertsSessionTzToUtc() {
            assertEquals(
                "coalesce(date_format(convert_tz(col,@@session.time_zone,'UTC'),'%m%d%Y%H%i%S'),' ')",
                DataTypeCastingUtils.castTimestamp("datetime", COL, "mysql"));
        }

        @Test
        void mssqlDateUsesFormat() {
            assertEquals(
                "coalesce(format(col,'MMddyyyyHHmmss'),' ')",
                DataTypeCastingUtils.castTimestamp("date", COL, "mssql"));
        }

        @Test
        void snowflakeTimestampLtzGetsTzConversion() {
            assertEquals(
                "coalesce(to_char(convert_timezone('UTC', col),'MMDDYYYYHH24MISS'),' ')",
                DataTypeCastingUtils.castTimestamp("timestamp_ltz", COL, "snowflake"));
        }

        @Test
        void db2TimestampWithTimeZone() {
            assertEquals(
                "coalesce(to_char(col at time zone 'UTC','MMDDYYYYHH24MISS'),' ')",
                DataTypeCastingUtils.castTimestamp("timestamp with time zone", COL, "db2"));
        }
    }

    @Nested
    @DisplayName("Numeric casting (notation)")
    class NumericCasting {

        @Test
        void postgresNumericNotation() {
            assertEquals(
                "coalesce(trim(to_char(col,'0.9999999999EEEE')),' ')",
                DataTypeCastingUtils.castNumber("numeric", COL, "postgres"));
        }

        @Test
        @DisplayName("postgres real uses float-scale cast path")
        void postgresRealFloatScale() {
            assertEquals(
                "trim(cast(cast(cast(col as double precision) as numeric(32,3)) as text))",
                DataTypeCastingUtils.castNumber("real", COL, "postgres"));
        }

        @Test
        void oracleNumericNotation() {
            assertEquals(
                "lower(nvl(trim(to_char(col,'0.9999999999EEEE')),' '))",
                DataTypeCastingUtils.castNumber("numeric", COL, "oracle"));
        }

        @Test
        void snowflakeNumericNotation() {
            assertEquals(
                "coalesce(trim(to_char(col,'FM9.9999999999EEEE')),' ')",
                DataTypeCastingUtils.castNumber("numeric", COL, "snowflake"));
        }

        @Test
        void db2FloatFixedFormat() {
            assertEquals(
                "trim(to_char(col,'999999999999999999999999999990.000'))",
                DataTypeCastingUtils.castNumber("float", COL, "db2"));
        }

        @Test
        @DisplayName("standard number-cast uses configured standard-number-format")
        void postgresNumericStandard() {
            Settings.Props.setProperty("number-cast", "standard");
            assertEquals(
                "coalesce(trim(to_char(trim_scale(col),'0000000000000000000000.0000000000000000000000')),' ')",
                DataTypeCastingUtils.castNumber("numeric", COL, "postgres"));
        }
    }

    @Nested
    @DisplayName("String casting")
    class StringCasting {

        @Test
        void postgresString() {
            assertEquals(
                "coalesce(case when length(coalesce(trim(col::text),''))=0 then ' ' else trim(col::text) end,' ')",
                DataTypeCastingUtils.castString("varchar", COL, "postgres", col(10)));
        }

        @Test
        void oracleVarcharLengthGtOne() {
            assertEquals(
                "nvl(trim(col),' ')",
                DataTypeCastingUtils.castString("varchar2", COL, "oracle", col(10)));
        }

        @Test
        void mssqlVarcharLengthGtOne() {
            assertEquals(
                "case when len(col)=0 then ' ' else coalesce(rtrim(ltrim(col)),' ') end",
                DataTypeCastingUtils.castString("varchar", COL, "mssql", col(10)));
        }

        @Test
        @DisplayName("mssql text type cannot use trim")
        void mssqlTextNoTrim() {
            assertEquals(
                "coalesce(col,' ')",
                DataTypeCastingUtils.castString("text", COL, "mssql", col(10)));
        }
    }

    @Nested
    @DisplayName("Boolean casting")
    class BooleanCasting {

        @Test
        void postgresBooleanNotation() {
            assertEquals(
                "coalesce(trim(to_char(case when coalesce(col::text,'0') = 'true' then 1 else 0 end,'0.9999999999EEEE')),' ')",
                DataTypeCastingUtils.castBoolean("boolean", COL, "postgres"));
        }

        @Test
        void oracleBoolean() {
            assertEquals(
                "nvl(to_char(col),'0')",
                DataTypeCastingUtils.castBoolean("boolean", COL, "oracle"));
        }

        @Test
        void snowflakeBoolean() {
            assertEquals(
                "coalesce(to_char(col),'0')",
                DataTypeCastingUtils.castBoolean("boolean", COL, "snowflake"));
        }
    }

    @Nested
    @DisplayName("Binary casting")
    class BinaryCasting {

        @Test
        void postgresBinaryMd5() {
            assertEquals(
                "coalesce(md5(col), ' ')",
                DataTypeCastingUtils.castBinary("bytea", COL, "postgres"));
        }

        @Test
        void oracleBinaryHash() {
            assertEquals(
                "case when dbms_lob.getlength(col) = 0 or col is null then ' ' else lower(dbms_crypto.hash(col,2)) end",
                DataTypeCastingUtils.castBinary("blob", COL, "oracle"));
        }
    }

    @Nested
    @DisplayName("cast() dispatch routes to the correct type handler")
    class CastDispatch {

        @Test
        void numericTypeRoutesToNumber() {
            assertEquals(
                DataTypeCastingUtils.castNumber("numeric", COL, "postgres"),
                DataTypeCastingUtils.cast("numeric", COL, "postgres", col(0)));
        }

        @Test
        void timestampTypeRoutesToTimestamp() {
            assertEquals(
                DataTypeCastingUtils.castTimestamp("timestamp", COL, "postgres"),
                DataTypeCastingUtils.cast("timestamp", COL, "postgres", col(0)));
        }

        @Test
        void stringTypeRoutesToString() {
            assertEquals(
                DataTypeCastingUtils.castString("varchar", COL, "postgres", col(10)),
                DataTypeCastingUtils.cast("varchar", COL, "postgres", col(10)));
        }

        @Test
        void booleanTypeRoutesToBoolean() {
            assertEquals(
                DataTypeCastingUtils.castBoolean("boolean", COL, "postgres"),
                DataTypeCastingUtils.cast("boolean", COL, "postgres", col(0)));
        }
    }
}

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

package com.crunchydata.config.sql;

public interface ServerModeSQLConstants {

    // DC_SERVER - Server registration table
    String REPO_DDL_DC_SERVER = """
            CREATE TABLE dc_server (
                server_id uuid DEFAULT gen_random_uuid() NOT NULL,
                server_name text NOT NULL,
                server_host text NOT NULL,
                server_pid int8 NOT NULL,
                status varchar(20) DEFAULT 'active' NOT NULL,
                registered_at timestamptz DEFAULT current_timestamp NOT NULL,
                last_heartbeat timestamptz DEFAULT current_timestamp NOT NULL,
                current_job_id uuid NULL,
                server_config jsonb NULL,
                CONSTRAINT dc_server_pk PRIMARY KEY (server_id),
                CONSTRAINT dc_server_status_check CHECK (status IN ('active', 'idle', 'busy', 'offline', 'terminated'))
            )
            """;

    String REPO_DDL_DC_SERVER_IDX1 = """
            CREATE INDEX dc_server_idx1 ON dc_server USING btree (status, last_heartbeat)
            """;

    // DC_JOB - Job queue for scheduled jobs
    String REPO_DDL_DC_JOB = """
            CREATE TABLE dc_job (
                job_id uuid DEFAULT gen_random_uuid() NOT NULL,
                pid int8 NOT NULL,
                job_type varchar(20) DEFAULT 'compare' NOT NULL,
                status varchar(20) DEFAULT 'pending' NOT NULL,
                priority int4 DEFAULT 5 NOT NULL,
                batch_nbr int4 DEFAULT 0 NOT NULL,
                table_filter text NULL,
                target_server_id uuid NULL,
                assigned_server_id uuid NULL,
                created_at timestamptz DEFAULT current_timestamp NOT NULL,
                scheduled_at timestamptz NULL,
                started_at timestamptz NULL,
                completed_at timestamptz NULL,
                created_by text NULL,
                job_config jsonb NULL,
                result_summary jsonb NULL,
                error_message text NULL,
                CONSTRAINT dc_job_pk PRIMARY KEY (job_id),
                CONSTRAINT dc_job_type_check CHECK (job_type IN ('compare', 'check', 'discover')),
                CONSTRAINT dc_job_status_check CHECK (status IN ('pending', 'scheduled', 'running', 'paused', 'completed', 'failed', 'cancelled')),
                CONSTRAINT dc_job_priority_check CHECK (priority BETWEEN 1 AND 10)
            )
            """;

    String REPO_DDL_DC_JOB_IDX1 = """
            CREATE INDEX dc_job_idx1 ON dc_job USING btree (status, priority DESC, created_at)
            """;

    String REPO_DDL_DC_JOB_IDX2 = """
            CREATE INDEX dc_job_idx2 ON dc_job USING btree (pid, status)
            """;

    String REPO_DDL_DC_JOB_FK1 = """
            ALTER TABLE dc_job ADD CONSTRAINT dc_job_fk1 FOREIGN KEY (pid) REFERENCES dc_project(pid) ON DELETE CASCADE
            """;

    // DC_JOB_CONTROL - Job control signals table
    String REPO_DDL_DC_JOB_CONTROL = """
            CREATE TABLE dc_job_control (
                control_id serial NOT NULL,
                job_id uuid NOT NULL,
                signal varchar(20) NOT NULL,
                requested_at timestamptz DEFAULT current_timestamp NOT NULL,
                processed_at timestamptz NULL,
                requested_by text NULL,
                CONSTRAINT dc_job_control_pk PRIMARY KEY (control_id),
                CONSTRAINT dc_job_control_signal_check CHECK (signal IN ('pause', 'resume', 'stop', 'terminate'))
            )
            """;

    String REPO_DDL_DC_JOB_CONTROL_FK1 = """
            ALTER TABLE dc_job_control ADD CONSTRAINT dc_job_control_fk1 FOREIGN KEY (job_id) REFERENCES dc_job(job_id) ON DELETE CASCADE
            """;

    // DC_JOB_PROGRESS - Track progress of running jobs
    String REPO_DDL_DC_JOB_PROGRESS = """
            CREATE TABLE dc_job_progress (
                job_id uuid NOT NULL,
                tid int8 NOT NULL,
                table_name text NOT NULL,
                status varchar(20) DEFAULT 'pending' NOT NULL,
                started_at timestamptz NULL,
                completed_at timestamptz NULL,
                source_cnt int8 DEFAULT 0,
                target_cnt int8 DEFAULT 0,
                equal_cnt int8 DEFAULT 0,
                not_equal_cnt int8 DEFAULT 0,
                missing_source_cnt int8 DEFAULT 0,
                missing_target_cnt int8 DEFAULT 0,
                error_message text NULL,
                CONSTRAINT dc_job_progress_pk PRIMARY KEY (job_id, tid),
                CONSTRAINT dc_job_progress_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped'))
            )
            """;

    String REPO_DDL_DC_JOB_PROGRESS_FK1 = """
            ALTER TABLE dc_job_progress ADD CONSTRAINT dc_job_progress_fk1 FOREIGN KEY (job_id) REFERENCES dc_job(job_id) ON DELETE CASCADE
            """;

    // Server registration and heartbeat queries
    String SQL_SERVER_REGISTER = """
            INSERT INTO dc_server (server_name, server_host, server_pid, status, server_config)
            VALUES (?, ?, ?, 'idle', ?::jsonb)
            RETURNING server_id
            """;

    String SQL_SERVER_HEARTBEAT = """
            UPDATE dc_server 
            SET last_heartbeat = current_timestamp, status = ?
            WHERE server_id = ?::uuid
            """;

    String SQL_SERVER_UNREGISTER = """
            UPDATE dc_server 
            SET status = 'terminated', last_heartbeat = current_timestamp
            WHERE server_id = ?::uuid
            """;

    String SQL_SERVER_SELECT_ACTIVE = """
            SELECT server_id, server_name, server_host, server_pid, status, 
                   registered_at, last_heartbeat, current_job_id, server_config
            FROM dc_server
            WHERE status != 'terminated' 
                  AND last_heartbeat > current_timestamp - interval '5 minutes'
            ORDER BY status, last_heartbeat DESC
            """;

    String SQL_SERVER_MARK_STALE = """
            UPDATE dc_server 
            SET status = 'offline'
            WHERE status NOT IN ('terminated', 'offline')
                  AND last_heartbeat < current_timestamp - interval '2 minutes'
            """;

    String SQL_SERVER_DELETE_STALE = """
            DELETE FROM dc_server 
            WHERE status != 'terminated'
                  AND last_heartbeat < current_timestamp - interval '5 minutes'
            """;

    // Job queue management queries
    String SQL_JOB_INSERT = """
            INSERT INTO dc_job (pid, job_type, priority, batch_nbr, table_filter, 
                                       target_server_id, scheduled_at, created_by, job_config)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
            RETURNING job_id
            """;

    String SQL_JOB_CLAIM_NEXT = """
            UPDATE dc_job 
            SET status = 'running', assigned_server_id = ?::uuid, started_at = current_timestamp
            WHERE job_id = (
                SELECT job_id FROM dc_job
                WHERE status = 'pending'
                      AND (scheduled_at IS NULL OR scheduled_at <= current_timestamp)
                      AND (target_server_id IS NULL OR target_server_id = ?::uuid)
                ORDER BY priority DESC, created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING job_id, pid, job_type, batch_nbr, table_filter, job_config
            """;

    String SQL_JOB_UPDATE_STATUS = """
            UPDATE dc_job 
            SET status = ?, completed_at = CASE WHEN ? IN ('completed', 'failed', 'cancelled') THEN current_timestamp ELSE completed_at END,
                result_summary = COALESCE(?::jsonb, result_summary),
                error_message = COALESCE(?, error_message)
            WHERE job_id = ?::uuid
            """;

    String SQL_JOB_SELECT_BY_STATUS = """
            SELECT job_id, pid, job_type, status, priority, batch_nbr, table_filter,
                   target_server_id, assigned_server_id, created_at, scheduled_at,
                   started_at, completed_at, created_by, job_config, result_summary, error_message
            FROM dc_job
            WHERE status = ANY(?)
            ORDER BY priority DESC, created_at ASC
            """;

    String SQL_JOB_SELECT_BY_PROJECT = """
            SELECT job_id, pid, job_type, status, priority, batch_nbr, table_filter,
                   target_server_id, assigned_server_id, created_at, scheduled_at,
                   started_at, completed_at, created_by, job_config, result_summary, error_message
            FROM dc_job
            WHERE pid = ?
            ORDER BY created_at DESC
            LIMIT ?
            """;

    String SQL_JOB_SELECT_RUNNING = """
            SELECT w.job_id, w.pid, w.job_type, w.status, w.batch_nbr, w.started_at,
                   s.server_name, s.server_host
            FROM dc_job w
            LEFT JOIN dc_server s ON w.assigned_server_id = s.server_id
            WHERE w.status = 'running'
            """;

    // Job control queries
    String SQL_JOBCONTROL_INSERT = """
            INSERT INTO dc_job_control (job_id, signal, requested_by)
            VALUES (?::uuid, ?, ?)
            RETURNING control_id
            """;

    String SQL_JOBCONTROL_CHECK_PENDING = """
            SELECT control_id, signal 
            FROM dc_job_control 
            WHERE job_id = ?::uuid AND processed_at IS NULL
            ORDER BY requested_at ASC
            LIMIT 1
            """;

    String SQL_JOBCONTROL_MARK_PROCESSED = """
            UPDATE dc_job_control 
            SET processed_at = current_timestamp
            WHERE control_id = ?
            """;

    // Job progress queries
    String SQL_JOBPROGRESS_INSERT = """
            INSERT INTO dc_job_progress (job_id, tid, table_name, status)
            VALUES (?::uuid, ?, ?, 'pending')
            ON CONFLICT (job_id, tid) DO UPDATE SET status = 'pending'
            """;

    String SQL_JOBPROGRESS_UPDATE = """
            UPDATE dc_job_progress 
            SET status = ?, started_at = COALESCE(started_at, current_timestamp),
                completed_at = CASE WHEN ? IN ('completed', 'failed') THEN current_timestamp ELSE completed_at END,
                source_cnt = COALESCE(?, source_cnt), target_cnt = COALESCE(?, target_cnt),
                equal_cnt = COALESCE(?, equal_cnt), not_equal_cnt = COALESCE(?, not_equal_cnt),
                missing_source_cnt = COALESCE(?, missing_source_cnt), 
                missing_target_cnt = COALESCE(?, missing_target_cnt),
                error_message = COALESCE(?, error_message)
            WHERE job_id = ?::uuid AND tid = ?
            """;

    String SQL_JOBPROGRESS_SELECT_BY_JOB = """
            SELECT job_id, tid, table_name, status, started_at, completed_at,
                   source_cnt, target_cnt, equal_cnt, not_equal_cnt,
                   missing_source_cnt, missing_target_cnt, error_message
            FROM dc_job_progress
            WHERE job_id = ?::uuid
            ORDER BY table_name
            """;

    String SQL_JOBPROGRESS_SUMMARY = """
            SELECT 
                COUNT(*) as total_tables,
                COUNT(*) FILTER (WHERE status = 'completed') as completed_tables,
                COUNT(*) FILTER (WHERE status = 'running') as running_tables,
                COUNT(*) FILTER (WHERE status = 'failed') as failed_tables,
                SUM(COALESCE(source_cnt, 0)) as total_source,
                SUM(COALESCE(equal_cnt, 0)) as total_equal,
                SUM(COALESCE(not_equal_cnt, 0)) as total_not_equal,
                SUM(COALESCE(missing_source_cnt, 0) + COALESCE(missing_target_cnt, 0)) as total_missing
            FROM dc_job_progress
            WHERE job_id = ?::uuid
            """;
}

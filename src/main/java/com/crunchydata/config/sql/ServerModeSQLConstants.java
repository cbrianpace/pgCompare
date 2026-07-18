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
                rid int8 NULL,
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
                source varchar(20) DEFAULT 'server' NOT NULL,
                CONSTRAINT dc_job_pk PRIMARY KEY (job_id),
                CONSTRAINT dc_job_type_check CHECK (job_type IN ('compare', 'check', 'discover', 'test-connection')),
                CONSTRAINT dc_job_status_check CHECK (status IN ('pending', 'scheduled', 'running', 'paused', 'completed', 'error', 'failed', 'cancelled')),
                CONSTRAINT dc_job_priority_check CHECK (priority BETWEEN 1 AND 10),
                CONSTRAINT dc_job_source_check CHECK (source IN ('server', 'standalone', 'api'))
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

    // DC_JOB_PROGRESS - Track progress of running jobs (status only, counts come from dc_result)
    String REPO_DDL_DC_JOB_PROGRESS = """
            CREATE TABLE dc_job_progress (
                job_id uuid NOT NULL,
                tid int8 NOT NULL,
                table_name text NOT NULL,
                status varchar(20) DEFAULT 'pending' NOT NULL,
                started_at timestamptz NULL,
                completed_at timestamptz NULL,
                error_message text NULL,
                cid int4 NULL,
                CONSTRAINT dc_job_progress_pk PRIMARY KEY (job_id, tid),
                CONSTRAINT dc_job_progress_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped'))
            )
            """;

    String REPO_DDL_DC_JOB_PROGRESS_FK1 = """
            ALTER TABLE dc_job_progress ADD CONSTRAINT dc_job_progress_fk1 FOREIGN KEY (job_id) REFERENCES dc_job(job_id) ON DELETE CASCADE
            """;

    // DC_JOB_LOG - Store log entries for jobs
    String REPO_DDL_DC_JOB_LOG = """
            CREATE TABLE dc_job_log (
                log_id serial NOT NULL,
                job_id uuid NOT NULL,
                log_ts timestamptz DEFAULT current_timestamp NOT NULL,
                log_level varchar(10) NOT NULL,
                thread_name varchar(50) NULL,
                message text NOT NULL,
                context jsonb NULL,
                CONSTRAINT dc_job_log_pk PRIMARY KEY (log_id)
            )
            """;

    String REPO_DDL_DC_JOB_LOG_IDX1 = """
            CREATE INDEX dc_job_log_idx1 ON dc_job_log USING btree (job_id, log_ts)
            """;

    String REPO_DDL_DC_JOB_LOG_FK1 = """
            ALTER TABLE dc_job_log ADD CONSTRAINT dc_job_log_fk1 FOREIGN KEY (job_id) REFERENCES dc_job(job_id) ON DELETE CASCADE
            """;

    // Server registration and heartbeat queries
    String SQL_SERVER_REGISTER = """
            INSERT INTO dc_server (server_name, server_host, server_pid, status, server_config)
            VALUES (?, ?, ?, 'idle', ?::jsonb)
            RETURNING server_id
            """;

    String SQL_SERVER_DELETE_BY_NAME = """
            DELETE FROM dc_server 
            WHERE server_name = ?
            RETURNING server_id, server_name, status
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

    String SQL_SERVER_DELETE = """
            DELETE FROM dc_server WHERE server_id = ?::uuid
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

    String SQL_SERVER_SELECT_STALE_TO_MARK = """
            SELECT server_id, server_name, server_host
            FROM dc_server 
            WHERE status NOT IN ('terminated', 'offline')
                  AND last_heartbeat < current_timestamp - interval '2 minutes'
            """;

    String SQL_SERVER_DELETE_STALE = """
            DELETE FROM dc_server 
            WHERE status != 'terminated'
                  AND last_heartbeat < current_timestamp - interval '5 minutes'
            """;

    String SQL_SERVER_SELECT_STALE_TO_DELETE = """
            SELECT server_id, server_name, server_host
            FROM dc_server 
            WHERE status != 'terminated'
                  AND last_heartbeat < current_timestamp - interval '5 minutes'
            """;

    // Orphaned job detection - jobs that are running but assigned server is offline/terminated/missing
    String SQL_JOB_SELECT_ORPHANED = """
            SELECT j.job_id, j.job_type, j.assigned_server_id, s.server_name, s.status as server_status
            FROM dc_job j
            LEFT JOIN dc_server s ON j.assigned_server_id = s.server_id
            WHERE j.status = 'running'
              AND j.source != 'standalone'
              AND (s.server_id IS NULL 
                   OR s.status IN ('offline', 'terminated')
                   OR s.last_heartbeat < current_timestamp - interval '5 minutes')
            """;

    String SQL_JOB_MARK_ORPHANED_FAILED = """
            UPDATE dc_job 
            SET status = 'failed', 
                completed_at = current_timestamp,
                error_message = 'Job orphaned: assigned server is no longer available'
            WHERE job_id = ?::uuid AND status = 'running'
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
            SET status = ?, completed_at = CASE WHEN ? IN ('completed', 'error', 'failed', 'cancelled') THEN current_timestamp ELSE completed_at END,
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
                error_message = COALESCE(?, error_message),
                cid = COALESCE(?, cid)
            WHERE job_id = ?::uuid AND tid = ?
            """;

    String SQL_JOBPROGRESS_SELECT_BY_JOB = """
            SELECT job_id, tid, table_name, status, started_at, completed_at,
                   error_message, cid
            FROM dc_job_progress
            WHERE job_id = ?::uuid
            ORDER BY table_name
            """;

    String SQL_JOBPROGRESS_SUMMARY = """
            SELECT 
                COUNT(*) as total_tables,
                COUNT(*) FILTER (WHERE jp.status = 'completed') as completed_tables,
                COUNT(*) FILTER (WHERE jp.status = 'running') as running_tables,
                COUNT(*) FILTER (WHERE jp.status = 'failed') as failed_tables,
                COALESCE(SUM(r.source_cnt), 0) as total_source,
                COALESCE(SUM(r.equal_cnt), 0) as total_equal,
                COALESCE(SUM(r.not_equal_cnt), 0) as total_not_equal,
                COALESCE(SUM(r.missing_source_cnt), 0) + COALESCE(SUM(r.missing_target_cnt), 0) as total_missing
            FROM dc_job_progress jp
            LEFT JOIN dc_result r ON jp.cid = r.cid
            WHERE jp.job_id = ?::uuid
            """;

    String SQL_JOB_SET_RID = """
            UPDATE dc_job SET rid = ? WHERE job_id = ?::uuid
            """;

    // Job log queries
    String SQL_JOBLOG_INSERT = """
            INSERT INTO dc_job_log (job_id, log_level, thread_name, message, context)
            VALUES (?::uuid, ?, ?, ?, ?::jsonb)
            """;

    String SQL_JOBLOG_SELECT_BY_JOB = """
            SELECT log_id, job_id, log_ts, log_level, thread_name, message, context
            FROM dc_job_log
            WHERE job_id = ?::uuid
            ORDER BY log_ts, log_id
            """;

    String SQL_JOBLOG_SELECT_BY_JOB_PAGED = """
            SELECT log_id, job_id, log_ts, log_level, thread_name, message, context
            FROM dc_job_log
            WHERE job_id = ?::uuid
            ORDER BY log_ts, log_id
            LIMIT ? OFFSET ?
            """;

    String SQL_JOBLOG_COUNT_BY_JOB = """
            SELECT COUNT(*) FROM dc_job_log WHERE job_id = ?::uuid
            """;

    // Standalone job creation
    String SQL_JOB_CREATE_STANDALONE = """
            INSERT INTO dc_job (pid, job_type, status, batch_nbr, table_filter, started_at, source, rid)
            VALUES (?, ?, 'running', ?, ?, current_timestamp, 'standalone', ?)
            RETURNING job_id
            """;
}

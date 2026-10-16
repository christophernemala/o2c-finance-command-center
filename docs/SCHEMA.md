# Database schema

Generated from `postgres/migrations` by `npm run docs:schema`. Do not edit by hand; `tests/schema-doc.test.ts` fails when this file is stale.

Migrations: 12 · public tables: 32 · tables with RLS: 32

Writes go through the SECURITY DEFINER routines listed at the end. The `authenticated` role can only SELECT, except for inserting archived source CSVs into `source_files` under its RLS insert policy.

## agent_guardrail_versions

RLS: enabled · policies: scope_read (SELECT)
References: agent_guardrails, entities, users

| Column | Type | Null |
|---|---|---|
| guardrail_id | uuid | no |
| version | integer | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| stage | text | no |
| status | text | no |
| simulation | jsonb | yes |
| maker | uuid | no |
| checker | uuid | yes |
| created_at | timestamp with time zone | no |
| decided_at | timestamp with time zone | yes |

## agent_guardrails

RLS: enabled · policies: scope_read (SELECT)
References: entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| name | text | no |
| kind | text | no |
| agent_kind | text | yes |
| params | jsonb | no |
| created_by | uuid | no |
| created_at | timestamp with time zone | no |

## agent_incidents

RLS: enabled · policies: scope_read (SELECT)
References: agent_runs, entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| kind | text | no |
| severity | text | no |
| agent_kind | text | yes |
| run_id | uuid | no |
| tool | text | yes |
| detail | jsonb | no |
| cost_usd | numeric(12,6) | yes |
| opened_at | timestamp with time zone | no |
| resolved_at | timestamp with time zone | yes |
| resolved_by | uuid | yes |

## agent_jobs

RLS: enabled · policies: agent_job_read (SELECT)
References: entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| agent | text | no |
| requested_by | uuid | no |
| status | text | no |
| as_of | date | no |
| result | jsonb | yes |
| created_at | timestamp with time zone | no |
| completed_at | timestamp with time zone | yes |

## agent_policies

RLS: enabled · policies: scope_read (SELECT)
References: entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| auto_execute | boolean | no |
| per_item_limit | numeric(15,2) | no |
| daily_limit | numeric(15,2) | no |
| status | text | no |
| maker | uuid | no |
| checker | uuid | yes |
| created_at | timestamp with time zone | no |
| decided_at | timestamp with time zone | yes |

## agent_runs

RLS: enabled · policies: scope_read (SELECT)
References: entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| name | text | no |
| status | text | no |
| operation_id | uuid | yes |
| updated_at | timestamp with time zone | no |
| kind | text | yes |
| trigger | text | yes |
| requested_by | uuid | yes |
| agent_user | uuid | yes |
| as_of | date | yes |
| model | text | yes |
| input_tokens | integer | no |
| output_tokens | integer | no |
| cache_read_tokens | integer | no |
| cost_usd | numeric(12,6) | yes |
| summary | text | yes |
| error | text | yes |
| created_at | timestamp with time zone | no |
| started_at | timestamp with time zone | yes |
| finished_at | timestamp with time zone | yes |
| step_count | integer | no |

## agent_schedules

RLS: enabled · policies: scope_read (SELECT)
References: entities, users

| Column | Type | Null |
|---|---|---|
| tenant_id | uuid | no |
| entity_id | uuid | no |
| kind | text | no |
| cadence | text | no |
| updated_by | uuid | no |
| updated_at | timestamp with time zone | no |

## agent_steps

RLS: enabled · policies: scope_read (SELECT)
References: agent_runs, entities

| Column | Type | Null |
|---|---|---|
| run_id | uuid | no |
| seq | integer | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| type | text | no |
| tool | text | yes |
| detail | jsonb | no |
| duration_ms | integer | yes |
| created_at | timestamp with time zone | no |

## allocations

RLS: enabled · policies: scope_read (SELECT)
References: approvals, invoices, receipts

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| invoice_id | uuid | no |
| receipt_id | uuid | no |
| approval_id | uuid | no |
| amount | numeric(15,2) | no |
| created_at | timestamp with time zone | no |

## approvals

RLS: enabled · policies: scope_read (SELECT)
References: agent_policies, agent_runs, bank_lines, customers, entities, invoices, receipts, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| kind | text | no |
| amount | numeric(15,2) | no |
| maker | uuid | no |
| approver | uuid | yes |
| status | text | no |
| invoice_id | uuid | yes |
| receipt_id | uuid | yes |
| bank_line_id | uuid | yes |
| customer_id | uuid | yes |
| invoice_version | integer | yes |
| receipt_version | integer | yes |
| bank_version | integer | yes |
| evidence | text | no |
| version | integer | no |
| created_at | timestamp with time zone | no |
| checker_basis | text | no |
| policy_id | uuid | yes |
| agent_run_id | uuid | yes |

## audit_events

RLS: enabled · policies: scope_read (SELECT)
References: entities

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| actor | uuid | no |
| operation | text | no |
| record_id | uuid | no |
| at | timestamp with time zone | no |
| detail | jsonb | no |

## bank_lines

RLS: enabled · policies: scope_read (SELECT)
References: entities

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| reference | text | no |
| booked_at | date | no |
| direction | text | no |
| amount | numeric(15,2) | no |
| version | integer | no |

## cashflow_runs

RLS: enabled · policies: cashflow_read (SELECT)
References: entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| starts_on | date | no |
| opening_cash | numeric(15,2) | no |
| scenario | text | no |
| model_version | text | no |
| source_digest | text | no |
| maker | uuid | no |
| checker | uuid | no |
| approved_at | timestamp with time zone | no |
| evidence | text | no |
| confidence_percent | numeric(5,2) | yes |
| confidence_method | text | yes |
| entries | jsonb | no |

## collection_messages

RLS: enabled · policies: scope_read (SELECT)
References: agent_runs, customer_contacts, customers, entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| customer_id | uuid | no |
| contact_id | uuid | no |
| to_email | text | no |
| tone | text | no |
| subject | text | no |
| body | text | no |
| invoice_ids | ARRAY | no |
| total_overdue | numeric(15,2) | no |
| attach_statement | boolean | no |
| status | text | no |
| maker | uuid | no |
| checker | uuid | yes |
| agent_run_id | uuid | yes |
| attempts | integer | no |
| provider_id | text | yes |
| error | text | yes |
| created_at | timestamp with time zone | no |
| decided_at | timestamp with time zone | yes |
| sending_at | timestamp with time zone | yes |
| sent_at | timestamp with time zone | yes |

## copilot_files

RLS: enabled · policies: owner_read (SELECT)
References: entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| user_id | uuid | no |
| name | text | no |
| media_type | text | no |
| content | bytea | no |
| digest | text | no |
| created_at | timestamp with time zone | no |

## copilot_messages

RLS: enabled · policies: owner_read (SELECT)
References: copilot_threads

| Column | Type | Null |
|---|---|---|
| thread_id | uuid | no |
| seq | integer | no |
| role | text | no |
| content | text | no |
| trace | jsonb | no |
| created_at | timestamp with time zone | no |

## copilot_threads

RLS: enabled · policies: owner_read (SELECT)
References: entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| user_id | uuid | no |
| title | text | no |
| created_at | timestamp with time zone | no |
| updated_at | timestamp with time zone | no |

## credit_limits

RLS: enabled · policies: scope_read (SELECT)
References: customers, entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| customer_id | uuid | no |
| credit_limit | numeric(15,2) | no |
| reason | text | no |
| status | text | no |
| maker | uuid | no |
| checker | uuid | yes |
| created_at | timestamp with time zone | no |
| decided_at | timestamp with time zone | yes |

## customer_contacts

RLS: enabled · policies: scope_read (SELECT)
References: customers, entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| customer_id | uuid | no |
| name | text | no |
| email | text | no |
| role | text | no |
| is_primary | boolean | no |
| archived | boolean | no |
| created_by | uuid | no |
| created_at | timestamp with time zone | no |

## customer_holds

RLS: enabled · policies: scope_read (SELECT)
References: agent_runs, customers, entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| customer_id | uuid | no |
| reason | text | no |
| placed_by | uuid | no |
| placed_by_kind | text | no |
| agent_run_id | uuid | yes |
| placed_at | timestamp with time zone | no |
| released_by | uuid | yes |
| released_at | timestamp with time zone | yes |
| release_reason | text | yes |

## customers

RLS: enabled · policies: scope_read (SELECT)
References: entities

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| account | text | no |
| name | text | no |

## ecl_runs

RLS: enabled · policies: scope_read (SELECT)
References: entities

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| model_version | text | no |
| exposure_snapshot | text | no |
| scenario | jsonb | no |
| allowance | numeric(15,2) | no |
| as_of | date | no |
| status | text | no |
| created_at | timestamp with time zone | no |

## entities

RLS: enabled · policies: scope_read (SELECT)
References: tenants

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| name | text | no |
| currency | text | no |

## import_batches

RLS: enabled · policies: scope_read (SELECT)
References: entities, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| maker | uuid | no |
| checker | uuid | yes |
| kind | text | no |
| file_name | text | no |
| digest | text | no |
| payload | jsonb | no |
| rows | integer | no |
| total | numeric(22,2) | no |
| status | text | no |
| created_at | timestamp with time zone | no |

## invoices

RLS: enabled · policies: scope_read (SELECT)
References: customers

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| customer_id | uuid | no |
| number | text | no |
| issued_at | date | no |
| due_date | date | no |
| gross | numeric(15,2) | no |
| lifecycle | text | no |
| dispute | text | no |
| collection | text | no |
| version | integer | no |

## journals

RLS: enabled · policies: scope_read (SELECT)
References: approvals

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| approval_id | uuid | no |
| amount | numeric(15,2) | no |
| debit_account | text | no |
| credit_account | text | no |
| created_at | timestamp with time zone | no |

## memberships

RLS: enabled · policies: member_read (SELECT)
References: tenants, users

| Column | Type | Null |
|---|---|---|
| tenant_id | uuid | no |
| user_id | uuid | no |
| role | text | no |

## payment_promises

RLS: enabled · policies: scope_read (SELECT)
References: customers, entities, invoices, users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| customer_id | uuid | no |
| invoice_id | uuid | yes |
| amount | numeric(15,2) | no |
| promised_date | date | no |
| status | text | no |
| note | text | yes |
| created_by | uuid | no |
| created_at | timestamp with time zone | no |

## profiles

RLS: enabled · policies: profiles_read_self (SELECT), profiles_update_self (UPDATE)
References: users

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| email | text | yes |
| full_name | text | yes |
| avatar_url | text | yes |
| provider | text | no |
| created_at | timestamp with time zone | no |
| updated_at | timestamp with time zone | no |

## receipts

RLS: enabled · policies: scope_read (SELECT)
References: bank_lines, customers

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| tenant_id | uuid | no |
| entity_id | uuid | no |
| customer_id | uuid | no |
| bank_line_id | uuid | no |
| amount | numeric(15,2) | no |
| version | integer | no |
| created_at | timestamp with time zone | no |

## source_files

RLS: enabled · policies: source_insert (INSERT), source_read (SELECT)
References: entities, users

| Column | Type | Null |
|---|---|---|
| tenant_id | uuid | no |
| entity_id | uuid | no |
| uploaded_by | uuid | no |
| digest | text | no |
| original_name | text | no |
| content | bytea | no |
| content_type | text | no |
| created_at | timestamp with time zone | no |

## tenants

RLS: enabled · policies: tenant_read (SELECT)

| Column | Type | Null |
|---|---|---|
| id | uuid | no |
| name | text | no |

## Routines callable by `authenticated`

| Routine | Security |
|---|---|
| add_customer_contact | definer |
| agent_ar_overview | definer |
| agent_auto_post | definer |
| agent_cash_candidates | definer |
| agent_console | definer |
| agent_edges | definer |
| agent_finish_run | definer |
| agent_guardrails_active | definer |
| agent_guardrails_list | definer |
| agent_incidents_list | definer |
| agent_invoices | definer |
| agent_ops_overview | definer |
| agent_record_step | definer |
| agent_run_detail | definer |
| archive_customer_contact | definer |
| collections_worklist | definer |
| commit_import | definer |
| copilot_append | definer |
| copilot_attach | definer |
| copilot_file | definer |
| copilot_history | definer |
| copilot_threads_list | definer |
| customer_account | definer |
| customer_statement | definer |
| decide_action | definer |
| decide_agent_policy | definer |
| decide_collection_message | definer |
| decide_credit_limit | definer |
| decide_guardrail_stage | definer |
| edge_failures | definer |
| enqueue_agent_job | definer |
| execute_action | definer |
| member_role | definer |
| place_customer_hold | definer |
| propose_action | definer |
| propose_agent_policy | definer |
| propose_collection_message | definer |
| propose_credit_limit | definer |
| propose_guardrail | definer |
| propose_guardrail_stage | definer |
| record_payment_promise | definer |
| release_customer_hold | definer |
| report_ar_pack | definer |
| request_agent_run | definer |
| resolve_agent_incident | definer |
| run_agent_job | definer |
| set_agent_schedule | definer |
| simulate_guardrail | definer |
| source_entity_access | invoker |
| stage_import | definer |
| workspace_access | invoker |
| workspace_entities | invoker |
| workspace_insights | invoker |
| workspace_snapshot | invoker |

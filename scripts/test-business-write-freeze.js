import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, createHmac, pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { connect, localConnection } from './catalog/database.ts';
import { install, cleanup, parent, item, operation, users, state } from './collection-update-apply-fixtures.ts';
// Local only. Real authenticator connections, not SET ROLE from postgres:
// SECURITY DEFINER changes current_user but must never change session_user.
const settings = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
assert.equal(settings.API_URL, 'http://127.0.0.1:55321');
const admin = await connect(), operator = await connect();
const connections = [admin, operator];
const pids = new Map();
const namespace = `prod2.synthetic.${randomUUID()}`;
const probe = `prod2_probe_${randomBytes(8).toString('hex')}`;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const authAdmin = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, options);
const accounts = [];
let installed = false, probeCreated = false, provisioned = false;
let sqlRefusals = 0, restRefusals = 0, scenarios = 0;
const pass = (name) => { scenarios++; console.log(`PASS ${name}`); };
const relations = (await admin.query(`select format('%I.%I',n.nspname,c.relname) relation,
  n.nspname schema,c.relname as table,(select attname from pg_attribute where attrelid=c.oid and attnum>0
  and not attisdropped order by attnum limit 1) as column,
  (select attname from pg_attribute where attrelid=c.oid and attnum>0 and not attisdropped
    and attidentity='' and attgenerated='' order by attnum limit 1) update_column
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind='r' and c.oid<>'private.business_write_freeze'::regclass order by 1`)).rows;
async function fingerprint() {
    const snapshot = {};
    for (const { relation } of relations) {
        snapshot[relation] = (await admin.query(`select count(*)::text count,
      encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),''),'UTF8')),'hex') hash
      from ${relation} t`)).rows[0];
    }
    snapshot.sequences = (await admin.query(`select sequencename,last_value::text from pg_sequences
    where schemaname='public' order by sequencename`)).rows;
    return snapshot;
}
async function permissions() {
    return (await admin.query(`select jsonb_build_object('tables',(select jsonb_agg(jsonb_build_array(c.oid::regclass::text,c.relacl::text)
    order by c.oid::regclass::text) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
    and c.relkind in ('r','p','v','S')), 'columns',(select jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,a.attacl::text)
    order by a.attrelid,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and a.attnum>0 and not a.attisdropped),
    'functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.proacl::text,p.proowner::regrole::text)
    order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname<>$1)) result`, [probe])).rows[0].result;
}
async function session(db, isolation = 'read committed', role = 'authenticated', claims = {}) {
    await db.query(`begin isolation level ${isolation}`);
    assert.ok(['authenticated', 'service_role', 'anon'].includes(role));
    await db.query(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: users[0], aal: 'aal2', ...claims })]);
}
async function refused(work, code = 'PT503', message = 'business_writes_frozen') {
    await assert.rejects(work, { code, message });
    sqlRefusals++;
}
async function toggle(closed, db = operator) {
    const result = (await db.query('select private.set_business_write_freeze($1) state', [closed])).rows[0].state;
    assert.equal(result.frozen, closed);
    // A separate statement/connection observes committed state, never the
    // provisional result of a setter inside a caller's open transaction.
    assert.equal((await admin.query('select private.get_business_write_freeze() state')).rows[0].state.frozen, closed);
}
function jwt(role = 'authenticated', extra = {}, key = settings.JWT_SECRET) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: users[0], role, aal: 'aal2', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, ...extra })}`;
    return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}
// Created before activation and reused after it: an old client/session token.
const oldToken = jwt();
async function rest(path, method = 'GET', body, token = oldToken, extraHeaders = {}) {
    const response = await fetch(`${settings.API_URL}/rest/v1/${path}`, { method,
        headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extraHeaders },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
    const text = await response.text();
    return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}
async function frozenRest(work) {
    const response = await work;
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { code: 'PT503', message: 'business_writes_frozen', details: null, hint: null });
    restRefusals++;
}
const pending = (work) => work.then(result => ({ result, error: null })).catch((error) => ({ result: null, error }));
async function blocked(waiter, holder) {
    const waiting = pids.get(waiter), holding = pids.get(holder);
    const deadline = Date.now() + 5000;
    do {
        if ((await admin.query('select $2::int=any(pg_blocking_pids($1::int)) blocked', [waiting, holding])).rows[0].blocked)
            return;
        await delay(20);
    } while (Date.now() < deadline);
    assert.fail('Expected real PostgreSQL lock wait was not observed');
}
async function ordinary(label) {
    const url = new URL(localConnection());
    url.username = 'authenticator';
    const db = new pg.Client({ connectionString: url.href, application_name: `${namespace}.${label}` });
    await db.connect();
    connections.push(db);
    assert.equal((await db.query('select session_user')).rows[0].session_user, 'authenticator');
    return db;
}
const original = await fingerprint(), originalPermissions = await permissions();
const initialAuth = (await admin.query('select id::text,encode(sha256(convert_to(to_jsonb(u)::text,\'UTF8\')),\'hex\') hash from auth.users u order by id')).rows;
try {
    assert.equal((await admin.query('select frozen from private.business_write_freeze')).rows[0].frozen, false, 'Test must not reopen an existing operator freeze');
    await admin.query('select pg_advisory_lock(830011)'); // same reserved-fixture mutex as 8E/8F/8G
    await install(admin);
    installed = true;
    await admin.query("insert into public.user_preferences(user_id) values ($1)", [users[0]]);
    const writer = await ordinary('writer'), waiter = await ordinary('waiter');
    await operator.query("select set_config('application_name',$1,false)", [`${namespace}.operator`]);
    for (const db of connections) {
        await db.query("set statement_timeout='15s'");
        pids.set(db, (await db.query('select pg_backend_pid() pid')).rows[0].pid);
    }
    // Narrow test-only definer: no arbitrary SQL or state/Auth access. Its
    // DML affects zero rows, including on a faulty guard. Removed in finally.
    await admin.query(`create function public.${probe}(p_relation regclass,p_op text) returns jsonb
    language plpgsql security definer set search_path='' as $test$
    declare column_name text;
    begin
      if p_relation::oid not in (select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('public','private') and c.relkind='r' and c.oid<>'private.business_write_freeze'::regclass)
        then raise exception 'invalid_probe_relation'; end if;
      select attname into column_name from pg_attribute where attrelid=p_relation and attnum>0 and not attisdropped
        and attidentity='' and attgenerated='' order by attnum limit 1;
      case p_op when 'INSERT' then execute format('insert into %s overriding system value select * from %s where false',p_relation,p_relation);
        when 'UPDATE' then execute format('update %s set %I=%I where false',p_relation,column_name,column_name);
        when 'DELETE' then execute format('delete from %s where false',p_relation);
        when 'identity' then null; else raise exception 'invalid_probe_operation'; end case;
      return jsonb_build_object('session_user',session_user,'current_user',current_user,'jwt',auth.jwt());
    end; $test$;
    revoke all on function public.${probe}(regclass,text) from public,anon,authenticated,service_role;
    grant execute on function public.${probe}(regclass,text) to authenticated;`);
    probeCreated = true;
    await session(writer);
    const identity = (await writer.query(`select public.${probe}('public.collections','identity') result`)).rows[0].result;
    assert.equal(identity.session_user, 'authenticator');
    assert.equal(identity.current_user, 'postgres');
    assert.equal(identity.jwt.sub, users[0]);
    await writer.query('commit');
    pass('actual session_user authenticator, SECURITY DEFINER current_user postgres, independent JWT');
    // Real Phase 8 receipt before closure. Noop still writes exactly one receipt.
    await session(writer);
    const prior = (await writer.query("select public.reorder_collection_item_v2($1,$2,'start',null,2,$3) result", [parent(), item(1), operation(970)])).rows[0].result;
    await writer.query('commit');
    const plan = (await rest('rpc/preview_collection_update', 'POST', { p_collection_id: parent() })).body;
    assert.ok(plan.token);
    const readers = [
        ['get_collection_content_v2', { p_collection_id: parent() }], ['get_collection_content', { p_collection_id: parent(3) }],
        ['get_collection_item_order', { p_collection_id: parent(3) }], ['get_collection_operation_result', { p_collection_id: parent(), p_operation_id: operation(970) }],
        ['get_collection_update_status', { p_collection_id: parent() }], ['preview_collection_update', { p_collection_id: parent() }],
        ['get_notification_center', {}], ['get_notification_unread_count', {}], ['get_notification_content', { p_announcement_id: randomUUID() }],
        ['get_variant_detail', { p_variant_id: '-95001' }], ['get_catalog_card', { p_card_id: '-95001' }],
        ['get_catalog_set', { p_set_id: '-95001' }], ['get_catalog_pokemon', { p_pokemon_id: '-95001' }],
        ['search_catalog_variants_for_add', { p_query: 'Synthetic', p_limit: 20, p_offset: 0 }], ['search_global_navigation', { p_query: 'Synthetic' }],
    ];
    const readBefore = await Promise.all(readers.map(([name, body]) => rest(`rpc/${name}`, 'POST', body)));
    readBefore.forEach(r => assert.equal(r.status, 200));
    await toggle(true);
    const frozenBefore = await fingerprint();
    for (const { relation } of relations)
        for (const op of ['INSERT', 'UPDATE', 'DELETE']) {
            await session(writer);
            await refused(writer.query(`select public.${probe}($1::regclass,$2)`, [relation, op]));
            await writer.query('rollback');
        }
    pass('66 INSERT/UPDATE/DELETE refusals across all 22 MY. tables through an actual privileged definer');
    for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const command of ["select private.set_business_write_freeze(false)", "update private.business_write_freeze set frozen=false where singleton",
            "select private.require_business_writes_open()", "set session authorization postgres", "set role postgres",
            "select set_config('role','postgres',true)", "set session_replication_role=replica", "alter table public.collections disable trigger business_write_freeze"]) {
            await session(writer, 'read committed', role, { role: 'postgres', user_metadata: { operator: true }, app_metadata: { role: 'supabase_admin' } });
            await assert.rejects(writer.query(command), { code: '42501' });
            sqlRefusals++;
            await writer.query('rollback');
        }
    }
    pass('24 real SQL identity/state/trigger/replication bypass attempts denied, including service_role');
    const writes = [
        ['create_automatic_collection', { p_name: 'Synthetic', p_target_type: 'set', p_target_id: '-95001' }],
        ['add_manual_collection_item', { p_collection_id: parent(3), p_variant_id: '-95001', p_placement: 'end' }],
        ['remove_manual_collection_item', { p_collection_id: parent(3), p_collection_item_id: item(1) }],
        ['reorder_collection_item', { p_collection_id: parent(3), p_item_id: item(1), p_placement: 'start', p_anchor_id: null }],
        ['add_manual_collection_item_v2', { p_collection_id: parent(4), p_variant_id: '-95001', p_placement: 'end', p_expected_revision: '0', p_operation_id: operation(971) }],
        ['remove_manual_collection_item_v2', { p_collection_id: parent(), p_collection_item_id: item(2), p_expected_revision: '2', p_operation_id: operation(972) }],
        ['reorder_collection_item_v2', { p_collection_id: parent(), p_item_id: item(1), p_placement: 'start', p_anchor_id: null, p_expected_revision: '2', p_operation_id: operation(970) }],
        ['set_collection_item_hidden', { p_collection_id: parent(), p_collection_item_id: item(1), p_is_hidden: false, p_expected_revision: '2', p_operation_id: operation(973) }],
        ['apply_collection_update', { p_collection_id: parent(), p_preview_token: plan.token, p_operation_id: operation(974) }],
        ['mark_notification_read', { p_notification_key: `collection:${parent()}`, p_observed_revision: '8' }],
        ['process_announcement_notification', { p_announcement_id: randomUUID(), p_observed_hash: 'a'.repeat(64) }],
    ];
    for (const [name, body] of writes)
        await frozenRest(rest(`rpc/${name}`, 'POST', body));
    for (const { table, column, update_column } of relations.filter(r => r.schema === 'public')) {
        // Zero-row DML still fires statement guards. No catalogue mutation or
        // sequence allocation is possible, including if a guard regresses.
        await frozenRest(rest(table, 'POST', [], settings.SERVICE_ROLE_KEY));
        await frozenRest(rest(`${table}?${column}=is.null`, 'PATCH', { [update_column]: null }, settings.SERVICE_ROLE_KEY));
        await frozenRest(rest(`${table}?${column}=is.null`, 'DELETE', undefined, settings.SERVICE_ROLE_KEY));
    }
    for (const [path, method, body] of [
        ['collections', 'POST', { name: 'Frozen client', collection_type: 'free' }],
        [`collections?id=eq.${parent(3)}`, 'PATCH', { name: 'Frozen rename' }], [`collections?id=eq.${parent(3)}`, 'DELETE', undefined],
        ['physical_copies', 'POST', { variant_id: '-95001', name: 'Frozen copy', note: '' }],
        [`physical_copies?user_id=eq.${users[0]}`, 'PATCH', { note: 'Frozen note' }], [`physical_copies?user_id=eq.${users[0]}`, 'DELETE', undefined],
        ['user_preferences', 'POST', { user_id: users[0], binder_default_format: '2x2' }],
        [`user_preferences?user_id=eq.${users[0]}`, 'PATCH', { binder_default_format: '2x2' }],
        ['collection_view_preferences', 'POST', { user_id: users[0], collection_id: parent(), binder_format: '2x2' }],
        [`collection_view_preferences?user_id=eq.${users[0]}`, 'PATCH', { binder_format: '2x2' }],
        [`collection_view_preferences?user_id=eq.${users[0]}`, 'DELETE', undefined],
        [`collection_shares?collection_id=eq.${parent()}`, 'DELETE', undefined],
    ])
        await frozenRest(rest(path, method, body));
    // Existing column grants prohibit the UPDATE(user_id) needed by this
    // upsert, before triggers. service_role has those grants, but hits the guard.
    assert.equal((await rest('user_preferences?on_conflict=user_id', 'POST', { user_id: users[0], binder_default_format: '2x2' }, oldToken, { Prefer: 'resolution=merge-duplicates' })).status, 403);
    restRefusals++;
    await frozenRest(rest('user_preferences?on_conflict=user_id', 'POST', { user_id: users[0], binder_default_format: '2x2' }, settings.SERVICE_ROLE_KEY, { Prefer: 'resolution=merge-duplicates', 'x-my-operator': 'true', 'x-maintenance-bypass': 'postgres' }));
    await frozenRest(rest('collections', 'POST', { name: 'Forged metadata', collection_type: 'free' }, jwt('authenticated', { user_metadata: { operator: true }, app_metadata: { role: 'postgres' }, role_override: 'supabase_admin' })));
    for (const role of ['postgres', 'supabase_admin', 'my_notification_publisher']) {
        const response = await rest('collections', 'POST', { name: 'Forged role', collection_type: 'free' }, jwt(role));
        assert.ok([401, 403].includes(response.status));
        restRefusals++;
    }
    assert.ok([401, 403].includes((await rest('collections', 'POST', {}, jwt('authenticated', {}, 'wrong-key'))).status));
    restRefusals++;
    assert.ok([401, 403].includes((await rest('collections', 'POST', {}, settings.ANON_KEY)).status));
    restRefusals++;
    assert.deepEqual(await fingerprint(), frozenBefore);
    const readAfter = await Promise.all(readers.map(([name, body]) => rest(`rpc/${name}`, 'POST', body)));
    assert.deepEqual(readAfter, readBefore);
    assert.equal((await rest('profiles?select=id')).status, 200);
    assert.deepEqual((await rest('profiles?select=id', 'GET', undefined, jwt('authenticated', { aal: 'aal1' }))).body, []);
    pass('old token/direct REST: 11 writer RPCs, 14 service tables, ordinary DML/upsert and JWT/header attacks; 15 readers unchanged; AAL1 still denied');
    // PostgreSQL publisher identity. Never overwrite provisioned credentials.
    assert.equal((await admin.query("select rolpassword is not null configured from pg_authid where rolname='my_notification_publisher'")).rows[0].configured, false, 'Preserve existing publisher credentials; use a separate credential-free Local volume for this test');
    const password = randomBytes(32).toString('base64url'), salt = randomBytes(16);
    const salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
    const stored = createHash('sha256').update(createHmac('sha256', salted).update('Client Key').digest()).digest('base64');
    const server = createHmac('sha256', salted).update('Server Key').digest('base64');
    const verifier = `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`;
    await admin.query(`alter role my_notification_publisher password '${verifier}'`);
    provisioned = true;
    const publisherUrl = new URL(localConnection());
    publisherUrl.username = 'my_notification_publisher';
    publisherUrl.password = password;
    const publisher = new pg.Client({ connectionString: publisherUrl.href });
    await publisher.connect();
    connections.push(publisher);
    assert.deepEqual((await publisher.query('select session_user,current_user')).rows[0], { session_user: 'my_notification_publisher', current_user: 'my_notification_publisher' });
    const payload = { publication_key: namespace, category: 'announcement', title: 'Synthetic freeze announcement', body: 'Isolated Local fixture',
        app_version: null, action: null, requires_action: false, include_new_users: false, expires_at: null,
        publication_context: { reason: 'PROD.2 Local test', include_new_users_justification: null } };
    const publication = (await publisher.query('select private.publish_notification_announcement($1::jsonb) result', [JSON.stringify(payload)])).rows[0].result;
    assert.deepEqual((await publisher.query('select private.publish_notification_announcement($1::jsonb) result', [JSON.stringify(payload)])).rows[0].result, publication);
    await frozenRest(rest('rpc/mark_notification_read', 'POST', { p_notification_key: `announcement:${publication.announcement_id}`, p_observed_revision: publication.content_hash }));
    await frozenRest(rest('rpc/process_announcement_notification', 'POST', { p_announcement_id: publication.announcement_id, p_observed_hash: publication.content_hash }));
    assert.equal((await rest('rpc/get_notification_content', 'POST', { p_announcement_id: publication.announcement_id })).status, 200);
    await publisher.query('select private.withdraw_notification_announcement($1)', [namespace]);
    await assert.rejects(publisher.query('insert into public.collections(name,collection_type) values(\'Bypass\',\'free\')'), { code: '42501' });
    sqlRefusals++;
    await assert.rejects(publisher.query('select private.set_business_write_freeze(false)'), { code: '42501' });
    sqlRefusals++;
    await assert.rejects(publisher.query('insert into private.notification_announcements default values'), { code: '42501' });
    sqlRefusals++;
    pass('real publisher LOGIN can publish/retry/withdraw during freeze; no direct DML or toggle; users cannot mark/process announcement');
    await admin.query('delete from private.notification_announcements where publication_key=$1', [namespace]);
    // Fail closed when the authoritative singleton is missing, then restore it
    // exactly. This deliberately tests corruption using trusted SQL, not an API.
    const saved = (await admin.query('select to_jsonb(s) state from private.business_write_freeze s')).rows[0].state;
    await admin.query('delete from private.business_write_freeze');
    await session(writer);
    await refused(writer.query('update public.user_preferences set binder_default_format=\'2x2\' where user_id=$1', [users[0]]), 'PT503', 'business_write_freeze_unavailable');
    await writer.query('rollback');
    await admin.query('insert into private.business_write_freeze select * from jsonb_populate_record(null::private.business_write_freeze,$1::jsonb)', [JSON.stringify(saved)]);
    pass('missing authoritative state fails closed');
    await toggle(false);
    for (const isolation of ['repeatable read', 'serializable']) {
        await session(writer, isolation);
        await writer.query('select count(*) from public.collections'); // snapshot before toggle
        await toggle(true);
        await assert.rejects(writer.query("update public.user_preferences set binder_default_format='2x2' where user_id=$1", [users[0]]), { code: '40001' });
        sqlRefusals++;
        await writer.query('rollback');
        await toggle(false);
    }
    pass('pre-freeze REPEATABLE READ and SERIALIZABLE snapshots cannot write after activation');
    // A admitted writer holds FOR SHARE through COMMIT; B toggle waits; C
    // writer started before activation waits behind B and is then refused.
    await session(writer);
    await writer.query("update public.user_preferences set binder_default_format='2x2' where user_id=$1", [users[0]]);
    const closing = pending(operator.query('select private.set_business_write_freeze(true) state'));
    await blocked(operator, writer);
    assert.equal((await admin.query('select frozen from private.business_write_freeze')).rows[0].frozen, false);
    await session(waiter);
    const queued = pending(waiter.query("update public.user_preferences set binder_default_format='4x3' where user_id=$1", [users[0]]));
    await blocked(waiter, operator);
    await writer.query('commit');
    assert.equal((await closing).error, null);
    const queuedError = (await queued).error;
    assert.equal(queuedError.code, 'PT503');
    assert.equal(queuedError.message, 'business_writes_frozen');
    sqlRefusals++;
    await waiter.query('rollback');
    assert.equal((await admin.query('select binder_default_format from public.user_preferences where user_id=$1', [users[0]])).rows[0].binder_default_format, '2x2');
    pass('observed lock queue: activation drains admitted writer through COMMIT; queued older transaction refused afterward');
    // Timeout/rollback never records a successful activation or reopens.
    await toggle(false);
    await session(writer);
    await writer.query("update public.user_preferences set binder_default_format='3x3' where user_id=$1", [users[0]]);
    await operator.query('begin');
    await operator.query("set local lock_timeout='100ms'");
    await assert.rejects(operator.query('select private.set_business_write_freeze(true)'), { code: '55P03' });
    sqlRefusals++;
    await operator.query('rollback');
    await writer.query('rollback');
    assert.equal((await admin.query('select frozen from private.business_write_freeze')).rows[0].frozen, false);
    await operator.query('begin');
    await operator.query('select private.set_business_write_freeze(true)');
    const provisional = pending(rest('collections', 'POST', { name: 'Uncommitted closure', collection_type: 'free' }));
    await operator.query('commit');
    await frozenRest(provisional.then(r => { assert.equal(r.error, null); return r.result; }));
    pass('failed activation rolls back; provisional activation becomes effective only after COMMIT');
    await toggle(false);
    await session(writer);
    assert.deepEqual((await writer.query("select public.reorder_collection_item_v2($1,$2,'start',null,2,$3) result", [parent(), item(1), operation(970)])).rows[0].result, prior);
    await writer.query('commit');
    await session(writer);
    const applied = (await writer.query('select public.apply_collection_update($1,$2::jsonb,$3) result', [parent(), plan.token, operation(974)])).rows[0].result;
    await writer.query('commit');
    const afterApply = await state(admin);
    await toggle(true);
    assert.deepEqual((await rest('rpc/get_collection_operation_result', 'POST', { p_collection_id: parent(), p_operation_id: operation(974) })).body, applied);
    await frozenRest(rest('rpc/apply_collection_update', 'POST', { p_collection_id: parent(), p_preview_token: plan.token, p_operation_id: operation(974) }));
    await toggle(false);
    await session(writer);
    assert.deepEqual((await writer.query('select public.apply_collection_update($1,$2::jsonb,$3) result', [parent(), plan.token, operation(974)])).rows[0].result, applied);
    await writer.query('commit');
    assert.deepEqual(await state(admin), afterApply);
    const reopened = await rest('collections', 'POST', { name: 'Reopened client', collection_type: 'free' });
    assert.equal(reopened.status, 201);
    await admin.query('delete from public.collections where owner_id=$1 and name=$2', [users[0], 'Reopened client']);
    pass('same UUID/token retries resume; exact receipt readable while frozen; no duplicate apply/revision; direct client resumes');
    // Native Auth and existing Edge handler. Revocation is intentionally
    // preserved even if a racing freeze causes the subsequent delete to fail.
    const email = `${namespace}@example.test`;
    let passwordAuth = `My!${randomBytes(24).toString('hex')}`;
    const created = await authAdmin.auth.admin.createUser({ email, password: passwordAuth, email_confirm: true });
    assert.equal(created.error, null);
    assert.ok(created.data.user);
    const account = { id: created.data.user.id, email, password: passwordAuth,
        client: createClient(settings.API_URL, settings.ANON_KEY, options), factor: '', secret: '' };
    accounts.push(account);
    assert.equal((await account.client.auth.signInWithPassword({ email, password: passwordAuth })).error, null);
    const enrollment = await account.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PROD.2 isolated fixture' });
    assert.equal(enrollment.error, null);
    assert.ok(enrollment.data);
    account.factor = enrollment.data.id;
    account.secret = enrollment.data.totp.secret;
    function totp(secret) {
        const bits = [...secret].map(c => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0')).join('');
        const key = Buffer.from(bits.match(/.{8}/g).map(b => Number.parseInt(b, 2))), counter = Buffer.alloc(8);
        counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
        const digest = createHmac('sha1', key).update(counter).digest();
        key.fill(0);
        return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
    }
    async function elevate() {
        const challenge = await account.client.auth.mfa.challenge({ factorId: account.factor });
        assert.equal(challenge.error, null);
        assert.ok(challenge.data);
        const verified = await account.client.auth.mfa.verify({ factorId: account.factor, challengeId: challenge.data.id, code: totp(account.secret) });
        assert.equal(verified.error, null);
        assert.ok(verified.data);
        return verified.data.access_token;
    }
    const existingAuthToken = await elevate();
    const authBusiness = await fingerprint();
    await toggle(true);
    await frozenRest(rest('collections', 'POST', { name: 'Existing real Auth session', collection_type: 'free' }, existingAuthToken));
    const newEmail = `new.${namespace}@example.test`;
    const refusedCreation = await authAdmin.auth.admin.createUser({ email: newEmail, password: passwordAuth, email_confirm: true });
    assert.equal(refusedCreation.error?.status, 500);
    assert.match(refusedCreation.error.message, /Database error/i);
    const signup = createClient(settings.API_URL, settings.ANON_KEY, options);
    const refusedSignup = await signup.auth.signUp({ email: `signup.${namespace}@example.test`, password: passwordAuth });
    assert.equal(refusedSignup.error?.status, 500);
    assert.match(refusedSignup.error.message, /Database error/i);
    assert.equal((await admin.query('select count(*)::int n from auth.users where email=any($1::text[])', [[newEmail, `signup.${namespace}@example.test`]])).rows[0].n, 0);
    assert.equal((await account.client.auth.updateUser({ data: { maintenance_operator: true } })).error, null);
    const changedPassword = `My!${randomBytes(24).toString('hex')}`;
    assert.equal((await account.client.auth.updateUser({ password: changedPassword, current_password: passwordAuth })).error, null);
    passwordAuth = changedPassword;
    account.password = changedPassword;
    assert.equal((await account.client.auth.updateUser({ email: `email.${namespace}@example.test` })).error, null);
    assert.equal((await account.client.auth.signInWithPassword({ email, password: passwordAuth })).error, null);
    const access = await elevate();
    assert.equal((await account.client.auth.refreshSession()).error, null);
    const refusedDeletion = await authAdmin.auth.admin.deleteUser(account.id, false);
    assert.equal(refusedDeletion.error?.status, 500);
    assert.match(refusedDeletion.error.message, /Database error/i);
    const endpoint = `${settings.API_URL}/functions/v1/delete-account`;
    assert.equal((await fetch(endpoint)).status, 405, 'Serve Local delete-account before this integration');
    const edge = await fetch(endpoint, { method: 'POST', headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: passwordAuth, totpCode: totp(account.secret), confirmConsequences: true, confirmDeletion: true }), signal: AbortSignal.timeout(60_000) });
    assert.equal(edge.status, 503);
    assert.deepEqual(await edge.json(), { error: 'deletion_failed' });
    assert.deepEqual(await fingerprint(), authBusiness);
    assert.equal((await admin.query('select count(*)::int n from auth.sessions where user_id=$1', [account.id])).rows[0].n, 0);
    assert.equal((await authAdmin.auth.admin.getUserById(account.id)).error, null);
    pass('real Auth: creation/physical deletion refused atomically; metadata/password/email request/login/MFA/refresh preserved; Edge 503 preserves business/account and revokes sessions');
    await toggle(false);
    assert.equal((await account.client.auth.signInWithPassword({ email, password: passwordAuth })).error, null);
    const reopenedAccess = await elevate();
    const deleted = await fetch(endpoint, { method: 'POST', headers: { apikey: settings.ANON_KEY, Authorization: `Bearer ${reopenedAccess}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: passwordAuth, totpCode: totp(account.secret), confirmConsequences: true, confirmDeletion: true }), signal: AbortSignal.timeout(60_000) });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { deleted: true });
    assert.equal((await admin.query('select count(*)::int n from auth.users where id=$1', [account.id])).rows[0].n, 0);
    pass('real Edge destruction resumes after explicit reopening');
}
finally {
    for (const db of connections)
        await db.query('rollback').catch(() => undefined);
    // Preserve an existing freeze if preflight rejected it; this run owns only
    // its own toggles, reserved fixtures and ephemeral publisher credential.
    if (installed)
        await toggle(false);
    await admin.query('delete from private.notification_announcements where publication_key=$1', [namespace]);
    for (const account of accounts)
        await admin.query('delete from auth.users where id=$1', [account.id]);
    if (probeCreated)
        await admin.query(`drop function public.${probe}(regclass,text)`);
    if (installed)
        await cleanup(admin);
    if (provisioned)
        await admin.query('alter role my_notification_publisher password null');
    assert.deepEqual(await fingerprint(), original, 'All 22 original MY. tables and sequences preserved');
    assert.deepEqual(await permissions(), originalPermissions, 'No permanent ACL or owner changes from testing/toggles');
    const currentAuth = (await admin.query('select id::text,encode(sha256(convert_to(to_jsonb(u)::text,\'UTF8\')),\'hex\') hash from auth.users u order by id')).rows;
    assert.deepEqual(currentAuth, initialAuth, 'Existing account unchanged; synthetic accounts removed');
    await admin.query('select pg_advisory_unlock(830011)');
    for (const db of connections)
        await db.end();
}
pass('cleanup: 22 table fingerprints, six sequences, existing Auth rows and all ACLs identical; freeze open; publisher credential restored');
console.log(JSON.stringify({ scenarios, sqlRefusals, restRefusals, tables: relations.length, publicReaders: 15, writerRPCs: 11 }));

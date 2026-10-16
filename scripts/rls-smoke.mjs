import { createClient } from '@supabase/supabase-js';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const accounts=[['A',process.env.FD_TEST_A_EMAIL,process.env.FD_TEST_A_PASSWORD],['B',process.env.FD_TEST_B_EMAIL,process.env.FD_TEST_B_PASSWORD]];
if(!url||!key||accounts.some(([,email,password])=>!email||!password)){
 console.error('Missing Supabase URL/key or FD_TEST_A/B_EMAIL/PASSWORD environment variables.'); process.exit(2);
}
function client(){return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})}
const a=client(),b=client();let aId,bId,wa,wb;let failed=0;
function assert(name,ok,details=''){console.log(`${ok?'PASS':'FAIL'} ${name}${details?' — '+details:''}`);if(!ok)failed++}
async function readOrThrow(client,table,filter){const q=client.from(table).select('*').eq('id',filter);const {data,error}=await q;if(error)throw new Error(`${table}: ${error.message}`);return data}
async function createTemp(c, who, expectedUserId) {
  const { data: authData, error: authError } =
    await c.auth.getUser();

  if (authError || !authData.user) {
    throw new Error(
      `Cannot verify authenticated user ${who}: ${
        authError?.message || 'No authenticated user'
      }`
    );
  }

  if (authData.user.id !== expectedUserId) {
    throw new Error(
      `Authentication identity mismatch for account ${who}`
    );
  }

  const { data, error } = await c
    .from('wagers')
    .insert({
      user_id: authData.user.id,
      event_label: `FD RLS TEST ${who}`,
      event_date: '2026-10-15',
      selections: 'Temporary ownership test - not a real wager',
      market: 'Test',
      sportsbook: 'Test',
      american_odds: 100,
      stake: 1,
      result: 'pending'
    })
    .select('id,user_id')
    .single();

  if (error) {
    throw new Error(
      `Cannot create temporary wager for ${who}: ${error.message}`
    );
  }

  if (data.user_id !== expectedUserId) {
    throw new Error(
      `Inserted wager belongs to the wrong account: ${who}`
    );
  }

  return data;
}
try {
 for(let i=0;i<2;i++){const [label,email,password]=accounts[i];const c=i===0?a:b;const {data,error}=await c.auth.signInWithPassword({email,password});if(error||!data.user)throw new Error(`Sign-in ${label}: ${error?.message||'no session'}`);if(i===0)aId=data.user.id;else bId=data.user.id;}
 if(aId===bId)throw new Error('The two logins resolve to the same account.');
 wa = await createTemp(a, 'A', aId);
 wb = await createTemp(b, 'B', bId);
 assert('Account A reads its own wager',(await readOrThrow(a,'wagers',wa.id)).length===1);
 assert('Account B cannot SELECT A wager',(await readOrThrow(b,'wagers',wa.id)).length===0);
 assert('Account A cannot SELECT B wager',(await readOrThrow(a,'wagers',wb.id)).length===0);
 const newLabel='FD-RLS-UNAUTHORIZED-UPDATE';
 let r=await b.from('wagers').update({event_label:newLabel}).eq('id',wa.id).select('id');
 assert('Account B cannot UPDATE A wager',!r.error && r.data.length===0 && (await readOrThrow(a,'wagers',wa.id))[0]?.event_label!==newLabel,r.error?.message);
 r=await b.from('wagers').delete().eq('id',wa.id).select('id');
 assert('Account B cannot DELETE A wager',!r.error && r.data.length===0 && (await readOrThrow(a,'wagers',wa.id)).length===1,r.error?.message);
 const p=await a.from('profiles').select('display_name').eq('id',aId).single();if(p.error)throw new Error('Profile A unreadable: '+p.error.message);
 r=await b.from('profiles').update({display_name:p.data.display_name}).eq('id',aId).select('id');
 assert('Account B cannot UPDATE A profile',!r.error && r.data.length===0,r.error?.message);
 const {data:legs,error:legError}=await b.from('wager_legs').insert({wager_id:wa.id,user_id:bId,leg_order:1,market:'Test',selection:'Unauthorized cross-owner leg'}).select('id');
 assert('Account B cannot attach a leg to A wager',!!legError || !legs?.length,legError?.message);
 const check=await b.from('wager_legs').select('id').eq('wager_id',wa.id);if(check.error)throw new Error('Could not check injected legs: '+check.error.message);
 assert('No cross-owned leg visible to Account B',check.data.length===0);
} catch(e){failed++;console.error('ERROR:',e.message)} finally {
 // Delete only records created by this run. If a control fails, we still clean up these temporary test wagers.
 for(const [c,w,label] of [[a,wa,'A'],[b,wb,'B']])if(w?.id){const {error}=await c.from('wagers').delete().eq('id',w.id);if(error){failed++;console.error(`CLEANUP FAILED ${label}:`,error.message)}}
 await Promise.all([a.auth.signOut(),b.auth.signOut()]);
 console.log(failed?`RLS ACCEPTANCE FAILED: ${failed} issue(s)`:'RLS ACCEPTANCE PASSED');
 if(failed)process.exitCode=1;
}

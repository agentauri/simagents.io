import { expect, test } from 'bun:test';
import { accumulateMetrics, emptyMetrics, type AgentCounters } from '@simagents/engine/engine/metrics';
import { estimateRecordedCost } from '../services/token-cost';
const now = Date.parse('2026-10-04T12:00:00Z');
const context = { providerId: 'codex', modelId: 'gpt-5.4-mini-2026-03-17', endpoint: 'https://api.openai.com/v1/responses' };
function agent(tokens: unknown = { input: 1000, output: 100 }, pricingContext: unknown = context, eligible = true): AgentCounters {
 const m=emptyMetrics();accumulateMetrics(m,{eventType:'agent_signal',agentId:'agent',tick:0,payload:{action:'signal',tokens,pricingContext,costEligible:eligible}},'codex');return m.agents[0];
}
test('source-bound standard estimates separate known input/output and never become billed totals',()=>{
 const a=agent();const cost=estimateRecordedCost(a,now);expect(a.tokenUsage?.inputTokens).toBe(1000);expect(a.tokenUsage?.outputTokens).toBe(100);
 expect(cost.available).toBe(true);if(cost.available){expect(cost.amount).toBeCloseTo(.0012);expect(cost.currency).toBe('USD');expect(cost.price.retrievedAt).toBe('2026-10-04');expect(cost.price.source).toStartWith('https://developers.openai.com');}
});
test('unknown prices, wrong commercial paths, missing usage and old histories are unavailable, not zero',()=>{
 for(const a of [agent(undefined,{...context,modelId:'not-a-priced-model'}),agent({},context),agent({input:10},context),agent(undefined,{...context,endpoint:'https://other.example.test/v1/responses'}),{...agent(),tokenUsage:undefined}])expect(estimateRecordedCost(a,now).available).toBe(false);
});
test('mixed models, unavailable billing components, stale rates and outside-tier requests cannot produce a total estimate',()=>{
 const a=agent();a.tokenUsage!.mixedContext=true;expect(estimateRecordedCost(a,now)).toEqual({available:false,reason:'mixed-context'});
 expect(estimateRecordedCost(agent({input:1,output:1},context,false),now).available).toBe(false);
 expect(estimateRecordedCost(agent(),Date.parse('2026-12-01')).available).toBe(false);
 const q=agent({input:256001,output:10},{providerId:'qwen',modelId:'qwen-plus-2025-12-01',endpoint:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'});
 expect(estimateRecordedCost(q,now)).toEqual({available:false,reason:'outside-tier'});
});
test('a genuine reported zero stays zero only when usage and the published route are complete',()=>{
 const cost=estimateRecordedCost(agent({input:0,output:0}),now);expect(cost.available).toBe(true);if(cost.available)expect(cost.amount).toBe(0);
});

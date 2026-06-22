import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '$lib/config/defaults';
import { FH2_LIMITS, OUTPUT_COUNT } from '$lib/types/fh2';
import { MockTransport } from './fh2-sysex';

describe('default config', () => {
	it('populates the documented entity counts', () => {
		const c = createDefaultConfig();
		expect(c.converters).toHaveLength(FH2_LIMITS.converters);
		expect(c.clocks).toHaveLength(FH2_LIMITS.clocks);
		expect(c.triggers).toHaveLength(FH2_LIMITS.triggers);
		expect(c.euclideans).toHaveLength(FH2_LIMITS.euclideans);
		expect(c.sequencers.note).toHaveLength(FH2_LIMITS.noteSequencers);
		expect(c.sequencers.drum.lanes).toHaveLength(FH2_LIMITS.drumLanes);
		expect(c.outputRanges).toHaveLength(OUTPUT_COUNT);
		expect(c.gateLevels).toHaveLength(OUTPUT_COUNT);
	});
});

describe('MockTransport', () => {
	it('round-trips a config through send/request', async () => {
		const t = new MockTransport();
		const sent = createDefaultConfig('Round Trip');
		sent.globals.triggerLength = 137;
		sent.converters[0].enabled = true;
		await t.connect();
		await t.sendConfig(sent);
		const got = await t.requestConfig();
		expect(got).toEqual(sent);
		// returned object must be an independent copy
		got.globals.triggerLength = 90;
		const again = await t.requestConfig();
		expect(again.globals.triggerLength).toBe(137);
	});
});

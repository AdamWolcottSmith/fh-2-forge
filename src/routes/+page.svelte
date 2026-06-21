<script lang="ts">
	import { createDefaultConfig } from '$lib/config/defaults';
	import { FH2_LIMITS } from '$lib/types/fh2';

	// Phase 1 placeholder dashboard: confirms the data model + theme load.
	const config = createDefaultConfig();

	const cards = [
		{ label: 'MIDI/CV Converters', value: FH2_LIMITS.converters },
		{ label: 'Clock Generators', value: FH2_LIMITS.clocks },
		{ label: 'Trigger Generators', value: FH2_LIMITS.triggers },
		{ label: 'Euclidean Patterns', value: FH2_LIMITS.euclideans },
		{ label: 'Outputs', value: FH2_LIMITS.outputs },
		{ label: 'Note Sequencers', value: FH2_LIMITS.noteSequencers }
	];
</script>

<header class="mb-6">
	<h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
	<p class="text-sm text-muted">
		Config: <span class="text-text">{config.name}</span> · targets firmware v{config.version}
	</p>
</header>

<section class="grid grid-cols-2 gap-4 md:grid-cols-3">
	{#each cards as card (card.label)}
		<div class="rounded-lg border border-edge bg-surface p-4">
			<div class="text-3xl font-semibold text-accent">{card.value}</div>
			<div class="mt-1 text-sm text-muted">{card.label}</div>
		</div>
	{/each}
</section>

<p class="mt-8 text-sm text-muted">
	Scaffold is live. Next: SVG front-panel visualizer and the MIDI/CV converter editor — see the
	roadmap in <code class="text-text">README.md</code>.
</p>

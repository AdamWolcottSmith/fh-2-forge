<script lang="ts">
	import { configStore } from '$lib/stores/config.svelte';

	const config = $derived(configStore.config);

	const cards = [
		{ href: '/converters', label: 'MIDI/CV Converters', count: () => config.converters.filter((c) => c.enabled).length, total: () => config.converters.length },
		{ href: '/clocks', label: 'Clocks', count: () => config.clocks.filter((c) => c.type > 0).length, total: () => config.clocks.length },
		{ href: '/triggers', label: 'Triggers', count: () => config.triggers.filter((t) => t.type > 0).length, total: () => config.triggers.length },
		{ href: '/euclidean', label: 'Euclidean', count: () => config.euclideans.filter((e) => e.output >= 0).length, total: () => config.euclideans.length },
		{ href: '/sequencers', label: 'Sequencers', count: () => config.sequencers.note.length + 1, total: () => config.sequencers.note.length + 1 },
		{ href: '/outputs', label: 'Outputs', count: () => config.outputRanges.length, total: () => config.outputRanges.length }
	];
</script>

<header class="mb-6">
	<h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
	<p class="text-sm text-muted">
		Config: <span class="text-text">{config.name || 'Untitled'}</span> · targets firmware v{config.version}
		{#if config.mappings.length}· {config.mappings.length} MIDI mappings{/if}
	</p>
</header>

<section class="grid grid-cols-2 gap-4 md:grid-cols-3">
	{#each cards as card (card.href)}
		<a
			href={card.href}
			class="rounded-lg border border-edge bg-surface p-4 transition-colors hover:border-accent"
		>
			<div class="text-3xl font-semibold text-accent">
				{card.count()}<span class="text-base text-muted">/{card.total()}</span>
			</div>
			<div class="mt-1 text-sm text-muted">{card.label}</div>
		</a>
	{/each}
</section>

<p class="mt-8 text-sm text-muted">
	Connect an FH-2 (or click <span class="text-text">Use mock</span> in the top bar), then
	<span class="text-text">Load</span> to read its config. Edits here can be sent back or exported as
	<code class="text-text">.syx</code>.
</p>

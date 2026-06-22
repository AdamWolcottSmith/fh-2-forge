<script lang="ts">
	import NumberField from '$lib/components/form/NumberField.svelte';
	import { configStore } from '$lib/stores/config.svelte';

	let selected = $state(0);
	const clocks = $derived(configStore.config.clocks);
	const clk = $derived(clocks[selected]);
	const touch = () => configStore.touch();
</script>

<header class="mb-5">
	<h1 class="text-2xl font-semibold tracking-tight">Clocks</h1>
	<p class="text-sm text-muted">{clocks.length} clock generators</p>
</header>

<div class="grid grid-cols-[160px_1fr] gap-5">
	<nav class="grid max-h-[70vh] grid-cols-2 gap-1 overflow-y-auto pr-1">
		{#each clocks as c, i (c.id)}
			<button
				type="button"
				onclick={() => (selected = i)}
				class="rounded border px-2 py-1.5 text-sm transition-colors
					{selected === i
					? 'border-accent bg-surface-2 text-text'
					: 'border-edge bg-surface text-muted hover:text-text'}"
			>
				{c.id}
			</button>
		{/each}
	</nav>

	{#if clk}
		<section class="rounded-lg border border-edge bg-surface p-4">
			<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Clock {clk.id}</h2>
			<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
				<NumberField label="Type" bind:value={clk.type} min={0} max={127} onchange={touch} />
				<NumberField label="Base" bind:value={clk.base} min={0} max={127} onchange={touch} />
				<NumberField label="Multiplier" bind:value={clk.mult} min={0} max={127} onchange={touch} />
				<NumberField label="Length" bind:value={clk.len} min={0} max={127} onchange={touch} />
				<NumberField label="Output" bind:value={clk.output} min={0} max={127} onchange={touch} />
				<NumberField label="Shift" bind:value={clk.shift} min={0} max={127} onchange={touch} />
			</div>
		</section>
	{/if}
</div>

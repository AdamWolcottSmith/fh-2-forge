<script lang="ts">
	import NumberField from '$lib/components/form/NumberField.svelte';
	import ToggleField from '$lib/components/form/ToggleField.svelte';
	import { configStore } from '$lib/stores/config.svelte';

	const note = $derived(configStore.config.sequencers.note);
	const drum = $derived(configStore.config.sequencers.drum);
	const touch = () => configStore.touch();
</script>

<header class="mb-5">
	<h1 class="text-2xl font-semibold tracking-tight">Sequencers</h1>
	<p class="text-sm text-muted">Routing for the 4 note sequencers and the drum sequencer</p>
</header>

<div class="flex max-w-4xl flex-col gap-5">
	{#each note as s, i (s.id)}
		<section class="rounded-lg border border-edge bg-surface p-4">
			<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Note sequencer {s.id}</h2>
			<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
				<NumberField label="MIDI channel" bind:value={s.channel} min={1} max={16} onchange={touch} />
				<NumberField label="Clock" bind:value={s.clk} min={0} max={127} onchange={touch} />
			</div>
			<div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
				<ToggleField label="Internal" bind:value={s.outInternal} onchange={touch} />
				<ToggleField label="C" bind:value={s.outC} onchange={touch} />
				<ToggleField label="A" bind:value={s.outA} onchange={touch} />
				<ToggleField label="D" bind:value={s.outD} onchange={touch} />
				<ToggleField label="S" bind:value={s.outS} onchange={touch} />
			</div>
		</section>
	{/each}

	<section class="rounded-lg border border-edge bg-surface p-4">
		<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Drum sequencer</h2>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			<NumberField label="MIDI channel" bind:value={drum.channel} min={1} max={16} onchange={touch} />
		</div>
		<div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
			<ToggleField label="Internal" bind:value={drum.outInternal} onchange={touch} />
			<ToggleField label="C" bind:value={drum.outC} onchange={touch} />
			<ToggleField label="A" bind:value={drum.outA} onchange={touch} />
			<ToggleField label="D" bind:value={drum.outD} onchange={touch} />
			<ToggleField label="S" bind:value={drum.outS} onchange={touch} />
		</div>
		<h3 class="mt-4 mb-2 text-xs font-medium text-muted">Lane notes</h3>
		<div class="grid grid-cols-4 gap-3 md:grid-cols-8">
			{#each drum.notes as _, j (j)}
				<NumberField label={`Lane ${j + 1}`} bind:value={drum.notes[j]} min={0} max={127} onchange={touch} />
			{/each}
		</div>
	</section>
</div>

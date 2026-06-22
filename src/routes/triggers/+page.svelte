<script lang="ts">
	import NumberField from '$lib/components/form/NumberField.svelte';
	import ToggleField from '$lib/components/form/ToggleField.svelte';
	import { configStore } from '$lib/stores/config.svelte';

	let selected = $state(0);
	const triggers = $derived(configStore.config.triggers);
	const trg = $derived(triggers[selected]);
	const touch = () => configStore.touch();

	// "Any note" maps to note === -1; toggling restores a sensible note value.
	const anyNote = $derived(trg?.note < 0);
	function setAnyNote(on: boolean) {
		trg.note = on ? -1 : 36;
		touch();
	}
</script>

<header class="mb-5">
	<h1 class="text-2xl font-semibold tracking-tight">Triggers</h1>
	<p class="text-sm text-muted">{triggers.length} trigger generators</p>
</header>

<div class="grid grid-cols-[200px_1fr] gap-5">
	<nav class="grid max-h-[70vh] grid-cols-4 gap-1 overflow-y-auto pr-1">
		{#each triggers as t, i (t.id)}
			<button
				type="button"
				onclick={() => (selected = i)}
				class="rounded border px-1 py-1.5 text-xs transition-colors
					{selected === i
					? 'border-accent bg-surface-2 text-text'
					: 'border-edge bg-surface text-muted hover:text-text'}"
			>
				{t.id}
			</button>
		{/each}
	</nav>

	{#if trg}
		<section class="rounded-lg border border-edge bg-surface p-4">
			<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Trigger {trg.id}</h2>
			<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
				<NumberField label="Type" bind:value={trg.type} min={0} max={15} onchange={touch} />
				<NumberField label="MIDI channel" bind:value={trg.channel} min={1} max={16} onchange={touch} />
				<NumberField label="Envelope" bind:value={trg.env} min={1} max={4} onchange={touch} />
				<NumberField label="Note" bind:value={trg.note} min={0} max={127} disabled={anyNote} hint={anyNote ? 'Any note' : undefined} onchange={touch} />
				<NumberField label="Output" bind:value={trg.output} min={0} max={127} onchange={touch} />
			</div>
			<div class="mt-3 max-w-xs">
				<ToggleField
					label="Any note"
					value={anyNote}
					onchange={() => setAnyNote(!anyNote)}
					hint="Fire on any incoming note"
				/>
			</div>
		</section>
	{/if}
</div>

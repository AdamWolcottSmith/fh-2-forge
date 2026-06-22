<script lang="ts">
	import NumberField from '$lib/components/form/NumberField.svelte';
	import SelectField from '$lib/components/form/SelectField.svelte';
	import ToggleField from '$lib/components/form/ToggleField.svelte';
	import { configStore } from '$lib/stores/config.svelte';
	import {
		EXT_CLOCK_RUN_LABELS,
		START_TYPE_LABELS,
		TAP_TYPE_LABELS
	} from '$lib/types/fh2';

	const g = $derived(configStore.config.globals);
	const touch = () => configStore.touch();

	const opts = (labels: readonly string[]) => labels.map((label, value) => ({ value, label }));
</script>

<header class="mb-5">
	<h1 class="text-2xl font-semibold tracking-tight">Globals</h1>
	<p class="text-sm text-muted">Module-wide settings</p>
</header>

<div class="flex max-w-4xl flex-col gap-5">
	<section class="rounded-lg border border-edge bg-surface p-4">
		<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Clock & timing</h2>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
			<NumberField label="Trigger length (ms)" bind:value={g.triggerLength} min={1} max={100} onchange={touch} />
			<NumberField label="Transpose (semi)" bind:value={g.transpose} min={-48} max={48} onchange={touch} />
			<NumberField label="Ext clock mult" bind:value={g.extClockMultiplier} min={1} max={96} onchange={touch} />
			<SelectField label="Ext clock run" bind:value={g.extClockRun} options={opts(EXT_CLOCK_RUN_LABELS)} onchange={touch} />
			<NumberField label="Tempo min" bind:value={g.tempoMin} min={0} max={127} hint="BPM = value + 1" onchange={touch} />
			<NumberField label="Tempo max" bind:value={g.tempoMax} min={0} max={127} hint="BPM = value + 128" onchange={touch} />
		</div>
	</section>

	<section class="rounded-lg border border-edge bg-surface p-4">
		<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Tap tempo & start/stop</h2>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
			<SelectField label="Tap type" bind:value={g.tapType} options={opts(TAP_TYPE_LABELS)} onchange={touch} />
			<NumberField label="Tap channel" bind:value={g.tapChannel} min={0} max={15} onchange={touch} />
			<NumberField label="Tap CC" bind:value={g.tapCC} min={0} max={127} onchange={touch} />
			<SelectField label="Start/Stop type" bind:value={g.startType} options={opts(START_TYPE_LABELS)} onchange={touch} />
			<NumberField label="Start channel" bind:value={g.startChannel} min={0} max={15} onchange={touch} />
			<NumberField label="Start CC" bind:value={g.startCC} min={0} max={127} onchange={touch} />
		</div>
	</section>

	<section class="rounded-lg border border-edge bg-surface p-4">
		<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Behaviour</h2>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
			<NumberField label="Preset prog. change" bind:value={g.presetProgramChange} min={0} max={16} hint="0 = Off" onchange={touch} />
			<NumberField label="Euclidean accent" bind:value={g.euclideanAccent} min={0} max={127} onchange={touch} />
		</div>
		<div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
			<ToggleField label="Legato velocity" bind:value={g.legatoVelocity} onchange={touch} />
			<ToggleField label="Soft takeover" bind:value={g.softTakeover} onchange={touch} />
		</div>
	</section>
</div>

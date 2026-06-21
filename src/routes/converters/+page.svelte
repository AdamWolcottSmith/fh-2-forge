<script lang="ts">
	import NumberField from '$lib/components/form/NumberField.svelte';
	import SelectField from '$lib/components/form/SelectField.svelte';
	import ToggleField from '$lib/components/form/ToggleField.svelte';
	import { configStore } from '$lib/stores/config.svelte';
	import { MCV_SCHEME_LABELS, MCV_TYPE, MCV_TYPE_LABELS } from '$lib/types/fh2';

	let selected = $state(0);

	const converters = $derived(configStore.config.converters);
	const conv = $derived(converters[selected]);

	const typeOptions = MCV_TYPE_LABELS.map((label, value) => ({ value, label }));
	const schemeOptions = MCV_SCHEME_LABELS.map((label, value) => ({ value, label }));

	const touch = () => configStore.touch();

	// Convenience: how many converters are enabled, for the header summary.
	const enabledCount = $derived(converters.filter((c) => c.enabled).length);
</script>

<header class="mb-5 flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">MIDI/CV Converters</h1>
		<p class="text-sm text-muted">{enabledCount} of {converters.length} enabled</p>
	</div>
	{#if configStore.dirty}
		<span class="rounded-full bg-warn/20 px-3 py-1 text-xs text-warn">Unsaved changes</span>
	{/if}
</header>

<div class="grid grid-cols-[180px_1fr] gap-5">
	<!-- Master list -->
	<nav class="flex flex-col gap-1">
		{#each converters as c, i (c.id)}
			<button
				type="button"
				onclick={() => (selected = i)}
				class="flex items-center justify-between rounded border px-3 py-2 text-left text-sm transition-colors
					{selected === i
					? 'border-accent bg-surface-2 text-text'
					: 'border-edge bg-surface text-muted hover:text-text'}"
			>
				<span>Converter {c.id}</span>
				<span
					class="size-2 rounded-full {c.enabled ? 'bg-good' : 'bg-edge'}"
					title={c.enabled ? 'Enabled' : 'Disabled'}
				></span>
			</button>
		{/each}
	</nav>

	<!-- Detail editor -->
	{#if conv}
		<div class="flex flex-col gap-5">
			<section class="rounded-lg border border-edge bg-surface p-4">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">
						Converter {conv.id}
					</h2>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							bind:checked={conv.enabled}
							onchange={touch}
							class="size-4 accent-accent"
						/>
						Enabled
					</label>
				</div>

				<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
					<NumberField label="MIDI channel" bind:value={conv.channel} min={1} max={16} onchange={touch} />
					<NumberField label="Note min" bind:value={conv.noteMin} min={0} max={127} onchange={touch} />
					<NumberField label="Note max" bind:value={conv.noteMax} min={0} max={127} onchange={touch} />
				</div>
			</section>

			<section class="rounded-lg border border-edge bg-surface p-4">
				<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Voicing</h2>
				<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
					<SelectField label="Type" bind:value={conv.type} options={typeOptions} onchange={touch} />
					<SelectField
						label="Allocation"
						bind:value={conv.scheme}
						options={schemeOptions}
						onchange={touch}
					/>
					<NumberField label="Polyphony" bind:value={conv.polyphony} min={1} max={16} onchange={touch} />
					<NumberField
						label="Last MPE channel"
						bind:value={conv.lastMpeChannel}
						min={1}
						max={16}
						hint={conv.type === MCV_TYPE.MPE ? undefined : 'MPE only'}
						onchange={touch}
					/>
				</div>
				<div class="mt-3">
					<ToggleField
						label="Ignore surplus voices"
						bind:value={conv.ignoreSurplus}
						hint="Drop extra notes instead of stealing"
						onchange={touch}
					/>
				</div>
			</section>

			<section class="rounded-lg border border-edge bg-surface p-4">
				<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Outputs</h2>
				<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
					<NumberField
						label="Base output"
						bind:value={conv.baseOutput}
						min={0}
						max={63}
						hint="0-based, first pitch CV"
						onchange={touch}
					/>
					<NumberField label="Stride" bind:value={conv.stride} min={1} max={32} onchange={touch} />
					<NumberField
						label="Base gate"
						bind:value={conv.baseGate}
						min={0}
						max={127}
						hint="0 or 64–127"
						onchange={touch}
					/>
				</div>
				<div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
					<ToggleField label="Pitch CV (VC)" bind:value={conv.cvOutput} onchange={touch} />
					<ToggleField label="Gate (VG)" bind:value={conv.gateOutput} onchange={touch} />
					<ToggleField label="Trigger (VT)" bind:value={conv.triggerOutput} onchange={touch} />
					<ToggleField label="Envelope (VE)" bind:value={conv.envOutput} onchange={touch} />
					<ToggleField label="Paraphonic gate (G)" bind:value={conv.paraGate} onchange={touch} />
				</div>
			</section>

			<section class="rounded-lg border border-edge bg-surface p-4">
				<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Pitch bend</h2>
				<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
					<NumberField label="Bend up (semi)" bind:value={conv.bendDepth} min={0} max={96} onchange={touch} />
					<NumberField
						label="Bend down (semi)"
						bind:value={conv.bendDownDepth}
						min={0}
						max={96}
						onchange={touch}
					/>
					<NumberField
						label="Pitch-bend output (PB)"
						bind:value={conv.pitchBendOutput}
						min={0}
						max={127}
						hint="0 = off"
						onchange={touch}
					/>
				</div>
			</section>

			<section class="rounded-lg border border-edge bg-surface p-4">
				<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
					Modulation outputs
				</h2>
				<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
					<NumberField
						label="Velocity (VV)"
						bind:value={conv.velOutput}
						min={0}
						max={127}
						hint="0 = off"
						onchange={touch}
					/>
					<NumberField
						label="Release vel (VR)"
						bind:value={conv.relVelOutput}
						min={0}
						max={127}
						hint="0 = off"
						onchange={touch}
					/>
					<NumberField
						label="MPE Y (VY)"
						bind:value={conv.mpeYOutput}
						min={0}
						max={127}
						hint="output / CC"
						onchange={touch}
					/>
				</div>
				<div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
					<ToggleField label="Velocity gate (VVG)" bind:value={conv.velGateOutput} onchange={touch} />
					<ToggleField label="Channel pressure (A)" bind:value={conv.pressure} onchange={touch} />
					<ToggleField
						label="Voice pressure (VP)"
						bind:value={conv.voicePressureOutput}
						onchange={touch}
					/>
					<ToggleField label="Gated pressure (GA)" bind:value={conv.gatedPressure} onchange={touch} />
					<ToggleField label="Random CV (VRND)" bind:value={conv.randomOutput} onchange={touch} />
				</div>
			</section>

			<section class="rounded-lg border border-edge bg-surface p-4">
				<h2 class="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Behaviour</h2>
				<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
					<NumberField label="Sustain (SUS)" bind:value={conv.sustain} min={0} max={127} onchange={touch} />
				</div>
				<div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
					<ToggleField label="Mono retrigger (MT)" bind:value={conv.monoRetrigger} onchange={touch} />
					<ToggleField label="Interrupt gate (IG)" bind:value={conv.interruptGate} onchange={touch} />
					<ToggleField label="Env zero-start (ZS)" bind:value={conv.envZeroStart} onchange={touch} />
				</div>
			</section>
		</div>
	{/if}
</div>

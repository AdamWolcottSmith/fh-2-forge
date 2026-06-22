<script lang="ts">
	import { configStore } from '$lib/stores/config.svelte';
	import { OUTPUT_RANGE_LABELS } from '$lib/types/fh2';

	const ranges = $derived(configStore.config.outputRanges);
	const gates = $derived(configStore.config.gateLevels);
	const touch = () => configStore.touch();

	const sel =
		'rounded border border-edge bg-surface-2 px-2 py-1 text-sm text-text outline-none focus:border-accent';
	const num =
		'w-24 rounded border border-edge bg-surface-2 px-2 py-1 text-sm text-text outline-none focus:border-accent';
</script>

<header class="mb-5">
	<h1 class="text-2xl font-semibold tracking-tight">Outputs</h1>
	<p class="text-sm text-muted">Voltage range and gate levels for all {ranges.length} outputs</p>
</header>

<div class="max-w-3xl overflow-hidden rounded-lg border border-edge">
	<table class="w-full text-sm">
		<thead class="bg-surface-2 text-xs text-muted uppercase">
			<tr>
				<th class="px-4 py-2 text-left font-medium">Output</th>
				<th class="px-4 py-2 text-left font-medium">Range</th>
				<th class="px-4 py-2 text-left font-medium">Gate low</th>
				<th class="px-4 py-2 text-left font-medium">Gate high</th>
			</tr>
		</thead>
		<tbody>
			{#each ranges as _, i (i)}
				<tr class="border-t border-edge {i % 2 ? 'bg-surface' : 'bg-bg'}">
					<td class="px-4 py-1.5 text-muted">{i + 1}</td>
					<td class="px-4 py-1.5">
						<select class={sel} bind:value={ranges[i]} onchange={touch}>
							{#each OUTPUT_RANGE_LABELS as label, v (v)}
								<option value={v}>{label}</option>
							{/each}
						</select>
					</td>
					<td class="px-4 py-1.5">
						<input type="number" min="0" max="16383" class={num} bind:value={gates[i].lo} oninput={touch} />
					</td>
					<td class="px-4 py-1.5">
						<input type="number" min="0" max="16383" class={num} bind:value={gates[i].hi} oninput={touch} />
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

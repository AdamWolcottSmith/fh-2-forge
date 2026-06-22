<script lang="ts">
	import { configStore } from '$lib/stores/config.svelte';

	const euclideans = $derived(configStore.config.euclideans);
	const touch = () => configStore.touch();

	const cell =
		'w-24 rounded border border-edge bg-surface-2 px-2 py-1 text-sm text-text outline-none focus:border-accent';
</script>

<header class="mb-5">
	<h1 class="text-2xl font-semibold tracking-tight">Euclidean</h1>
	<p class="text-sm text-muted">
		Output assignments for the 16 Euclidean generators. Use −1 for no output. Rhythm parameters
		(pulses/steps/rotation) are set on the device or via MIDI mappings.
	</p>
</header>

<div class="max-w-2xl overflow-hidden rounded-lg border border-edge">
	<table class="w-full text-sm">
		<thead class="bg-surface-2 text-xs text-muted uppercase">
			<tr>
				<th class="px-4 py-2 text-left font-medium">Generator</th>
				<th class="px-4 py-2 text-left font-medium">On output</th>
				<th class="px-4 py-2 text-left font-medium">Off output</th>
			</tr>
		</thead>
		<tbody>
			{#each euclideans as e, i (e.id)}
				<tr class="border-t border-edge {i % 2 ? 'bg-surface' : 'bg-bg'}">
					<td class="px-4 py-1.5 text-muted">Euclidean {e.id}</td>
					<td class="px-4 py-1.5">
						<input type="number" min="-1" max="127" class={cell} bind:value={e.output} oninput={touch} />
					</td>
					<td class="px-4 py-1.5">
						<input type="number" min="-1" max="127" class={cell} bind:value={e.offOutput} oninput={touch} />
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<script lang="ts">
	interface Props {
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		hint?: string;
		disabled?: boolean;
		onchange?: () => void;
	}
	let {
		label,
		value = $bindable(),
		min,
		max,
		step = 1,
		hint,
		disabled = false,
		onchange
	}: Props = $props();
</script>

<label class="flex flex-col gap-1" class:opacity-50={disabled}>
	<span class="text-xs font-medium text-muted">{label}</span>
	<input
		type="number"
		bind:value
		{min}
		{max}
		{step}
		{disabled}
		oninput={onchange}
		class="w-full rounded border border-edge bg-surface-2 px-2 py-1.5 text-sm text-text outline-none focus:border-accent disabled:cursor-not-allowed"
	/>
	{#if hint}<span class="text-[11px] text-muted/70">{hint}</span>{/if}
</label>

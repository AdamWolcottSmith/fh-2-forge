<script lang="ts">
	interface Option {
		value: number;
		label: string;
	}
	interface Props {
		label: string;
		value: number;
		options: readonly Option[];
		hint?: string;
		disabled?: boolean;
		onchange?: () => void;
	}
	let { label, value = $bindable(), options, hint, disabled = false, onchange }: Props = $props();
</script>

<label class="flex flex-col gap-1" class:opacity-50={disabled}>
	<span class="text-xs font-medium text-muted">{label}</span>
	<select
		bind:value
		{disabled}
		onchange={onchange}
		class="w-full rounded border border-edge bg-surface-2 px-2 py-1.5 text-sm text-text outline-none focus:border-accent disabled:cursor-not-allowed"
	>
		{#each options as opt (opt.value)}
			<option value={opt.value}>{opt.label}</option>
		{/each}
	</select>
	{#if hint}<span class="text-[11px] text-muted/70">{hint}</span>{/if}
</label>

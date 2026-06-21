<script lang="ts">
	interface Props {
		label: string;
		value: boolean;
		hint?: string;
		disabled?: boolean;
		onchange?: () => void;
	}
	let { label, value = $bindable(), hint, disabled = false, onchange }: Props = $props();
</script>

<label
	class="flex cursor-pointer items-center justify-between gap-3 rounded border border-edge bg-surface-2 px-3 py-2"
	class:opacity-50={disabled}
>
	<span class="flex flex-col">
		<span class="text-sm text-text">{label}</span>
		{#if hint}<span class="text-[11px] text-muted/70">{hint}</span>{/if}
	</span>
	<input
		type="checkbox"
		bind:checked={value}
		{disabled}
		onchange={onchange}
		class="size-4 shrink-0 accent-accent"
	/>
</label>

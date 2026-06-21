<script lang="ts">
	import { configStore } from '$lib/stores/config.svelte';

	let fileInput = $state<HTMLInputElement>();

	const status = $derived(configStore.connection.status);

	const statusLabel = $derived.by(() => {
		const c = configStore.connection;
		switch (c.status) {
			case 'connected':
				return `FH-2: ${c.inputName}`;
			case 'mock':
				return 'Mock device';
			case 'connecting':
				return 'Connecting…';
			default:
				return 'Not connected';
		}
	});

	const statusColor = $derived(
		status === 'connected'
			? 'bg-good'
			: status === 'mock'
				? 'bg-accent-2'
				: status === 'connecting'
					? 'bg-warn'
					: 'bg-bad'
	);

	function downloadSyx() {
		const url = URL.createObjectURL(configStore.exportSyx());
		const a = document.createElement('a');
		a.href = url;
		a.download = configStore.exportFilename();
		a.click();
		URL.revokeObjectURL(url);
	}

	async function onFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) configStore.importSyx(new Uint8Array(await file.arrayBuffer()));
		input.value = '';
	}

	const btn =
		'rounded border border-edge bg-surface-2 px-3 py-1 text-text transition-colors hover:border-muted disabled:cursor-not-allowed disabled:opacity-50';
	const btnAccent =
		'rounded border border-accent bg-accent/15 px-3 py-1 text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50';
</script>

<header
	class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-edge bg-surface px-4 py-2 text-sm"
>
	<!-- Connection status -->
	<div class="flex items-center gap-2">
		<span class="size-2.5 rounded-full {statusColor}"></span>
		<span class="text-text">{statusLabel}</span>
		{#if configStore.firmware}
			<span class="text-xs text-muted">· {configStore.firmware}</span>
		{/if}
	</div>

	<!-- Config name -->
	<label class="flex items-center gap-2">
		<span class="text-xs text-muted">Config</span>
		<input
			bind:value={configStore.config.name}
			oninput={() => configStore.touch()}
			maxlength="16"
			placeholder="Untitled"
			class="w-40 rounded border border-edge bg-surface-2 px-2 py-1 text-text outline-none focus:border-accent"
		/>
		{#if configStore.dirty}
			<span class="text-xs text-warn">●</span>
		{/if}
	</label>

	<!-- Actions -->
	<div class="ml-auto flex flex-wrap items-center gap-2">
		{#if configStore.connected}
			<button class={btn} onclick={() => configStore.loadFromDevice()} disabled={configStore.busy}>
				Load
			</button>
			<button class={btnAccent} onclick={() => configStore.sendToDevice()} disabled={configStore.busy}>
				Send
			</button>
			<button class={btn} onclick={() => configStore.disconnect()} disabled={configStore.busy}>
				Disconnect
			</button>
		{:else}
			<button class={btnAccent} onclick={() => configStore.connect()} disabled={configStore.busy}>
				Connect
			</button>
			<button class={btn} onclick={() => configStore.connectMock()} disabled={configStore.busy}>
				Use mock
			</button>
		{/if}

		<span class="mx-1 h-5 w-px bg-edge"></span>

		<button class={btn} onclick={() => fileInput?.click()}>Import .syx</button>
		<button class={btn} onclick={downloadSyx}>Export .syx</button>
		<input
			bind:this={fileInput}
			type="file"
			accept=".syx,.bin,application/octet-stream"
			class="hidden"
			onchange={onFile}
		/>
	</div>

	{#if configStore.error}
		<p class="w-full text-xs text-bad">{configStore.error}</p>
	{/if}
</header>

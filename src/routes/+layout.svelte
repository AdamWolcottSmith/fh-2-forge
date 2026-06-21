<script lang="ts">
	import '../app.css';

	let { children } = $props();

	// Top-level navigation. Routes are stubbed in Phase 1 and filled in per the
	// roadmap in README.md.
	const nav = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/converters', label: 'MIDI/CV Converters' },
		{ href: '/euclidean', label: 'Euclidean & Sequencers' },
		{ href: '/outputs', label: 'Outputs & Expanders' },
		{ href: '/advanced', label: 'Clocks, Triggers & Advanced' },
		{ href: '/library', label: 'Library' }
	];
</script>

<div class="grid min-h-screen grid-cols-[220px_1fr] bg-bg text-text">
	<aside class="flex flex-col gap-1 border-r border-edge bg-surface p-3">
		<div class="mb-4 px-2 py-1">
			<div class="text-lg font-semibold tracking-tight">
				FH-2 <span class="text-accent">Forge</span>
			</div>
			<div class="text-xs text-muted">Expert Sleepers FH-2 config</div>
		</div>
		<nav class="flex flex-col gap-0.5">
			{#each nav as item (item.href)}
				<a
					href={item.href}
					class="rounded px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
				>
					{item.label}
				</a>
			{/each}
		</nav>
		<div class="mt-auto px-2 text-xs text-muted">
			<span class="inline-flex items-center gap-1.5">
				<span class="size-2 rounded-full bg-bad"></span> Not connected
			</span>
		</div>
	</aside>

	<main class="overflow-y-auto p-6">
		{@render children()}
	</main>
</div>

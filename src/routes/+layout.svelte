<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import ConnectionBar from '$lib/components/ConnectionBar.svelte';

	let { children } = $props();

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

	const nav = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/converters', label: 'MIDI/CV Converters' },
		{ href: '/globals', label: 'Globals' },
		{ href: '/clocks', label: 'Clocks' },
		{ href: '/triggers', label: 'Triggers' },
		{ href: '/euclidean', label: 'Euclidean' },
		{ href: '/sequencers', label: 'Sequencers' },
		{ href: '/outputs', label: 'Outputs' }
	];
</script>

<div class="flex h-screen flex-col bg-bg text-text">
	<ConnectionBar />

	<div class="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
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
						class="rounded px-3 py-2 text-sm transition-colors hover:bg-surface-2 hover:text-text
							{isActive(item.href) ? 'bg-surface-2 font-medium text-accent' : 'text-muted'}"
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</aside>

		<main class="overflow-y-auto p-6">
			{@render children()}
		</main>
	</div>
</div>

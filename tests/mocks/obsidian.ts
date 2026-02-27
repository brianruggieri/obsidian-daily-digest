/**
 * Minimal mock of the Obsidian API for testing.
 * Only stubs the surface area actually used by the plugin.
 */

export class Notice {
	constructor(_msg: string, _timeout?: number) {}
}

export class Plugin {
	app: Record<string, unknown> = {
		vault: {
			getAbstractFileByPath: () => null,
			create: async () => ({}),
			modify: async () => {},
			read: async () => "",
			createFolder: async () => {},
			adapter: {
				exists: async () => false,
				read: async () => "",
				write: async () => {},
			},
		},
	};
	manifest = { id: "daily-digest", version: "1.0.0" };
	async loadData(): Promise<unknown> {
		return {};
	}
	async saveData(_data: unknown): Promise<void> {}
	addRibbonIcon() {
		return { addClass: () => {} };
	}
	addCommand() {}
	addSettingTab() {}
}

export class PluginSettingTab {
	app: Record<string, unknown>;
	containerEl = {
		empty: () => {},
		createEl: () => ({
			createEl: () => ({}),
			setText: () => {},
		}),
	};
	constructor(app: Record<string, unknown>, _plugin: unknown) {
		this.app = app;
	}
	display(): void {}
}

export class Modal {
	app: Record<string, unknown>;
	contentEl = {
		empty: () => {},
		createEl: () => ({
			createEl: () => ({}),
			setText: () => {},
			addClass: () => {},
		}),
		createDiv: () => ({
			createEl: () => ({}),
			setText: () => {},
			addClass: () => {},
		}),
	};
	constructor(app: Record<string, unknown>) {
		this.app = app;
	}
	open(): void {}
	close(): void {}
}

export class Setting {
	settingEl = {};
	constructor(_containerEl: unknown) {}
	setName(_name: string) {
		return this;
	}
	setDesc(_desc: string) {
		return this;
	}
	addText(_cb: (text: unknown) => void) {
		return this;
	}
	addToggle(_cb: (toggle: unknown) => void) {
		return this;
	}
	addDropdown(_cb: (dropdown: unknown) => void) {
		return this;
	}
	addTextArea(_cb: (textarea: unknown) => void) {
		return this;
	}
	addSlider(_cb: (slider: unknown) => void) {
		return this;
	}
	addButton(_cb: (btn: unknown) => void) {
		return this;
	}
	setClass(_cls: string) {
		return this;
	}
}

export class TFile {
	path = "";
	name = "";
	basename = "";
	extension = "";
}

export class TFolder {
	path = "";
	name = "";
	children: unknown[] = [];
}

export async function requestUrl(opts: {
	url: string;
	method?: string;
	contentType?: string;
	headers?: Record<string, string>;
	body?: string;
}): Promise<{ json: unknown; text: string; status: number }> {
	// When AI_MODE=real, delegate to native fetch so matrix:real actually
	// hits the Anthropic API instead of returning an empty stub.
	if (process.env.AI_MODE === "real" && opts.url.startsWith("http")) {
		const headers: Record<string, string> = { ...opts.headers };
		if (opts.contentType) headers["Content-Type"] = opts.contentType;
		const resp = await fetch(opts.url, {
			method: opts.method ?? "GET",
			headers,
			body: opts.body,
		});
		const text = await resp.text();
		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			json = {};
		}
		return { json, text, status: resp.status };
	}
	return { json: {}, text: "", status: 200 };
}

// Platform constant
export const Platform = {
	isMacOS: true,
	isWin: false,
	isLinux: false,
	isMobile: false,
	isDesktop: true,
};

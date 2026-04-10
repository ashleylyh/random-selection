const namesInput = document.getElementById("namesInput");
const groupCountInput = document.getElementById("groupCount");
const groupSizeInput = document.getElementById("groupSize");
const resultsContainer = document.getElementById("results");
const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const fileInput = document.getElementById("nameFile");
const adminTokenInput = document.getElementById("adminToken");
const adminBundlesInput = document.getElementById("adminBundles");
const adminEnabledInput = document.getElementById("adminEnabled");
const adminSaveBtn = document.getElementById("adminSaveBtn");
const adminStatusEl = document.getElementById("adminStatus");

let latestGroups = null;
let latestLockedSets = [];

const ADMIN_STORAGE_KEY = "random-group-admin-config-v1";

loadAdminConfig();

document.getElementById("generateBtn").addEventListener("click", () => {
	void buildAndRenderGroups();
});

document.getElementById("reshuffleBtn").addEventListener("click", () => {
	if (!latestGroups) {
		setStatus("Generate once before reshuffling.");
		return;
	}
	void buildAndRenderGroups();
});

document.getElementById("copyBtn").addEventListener("click", async () => {
	if (!latestGroups) {
		setStatus("Nothing to copy yet.");
		return;
	}

	const output = latestGroups
		.map(
			(group, index) =>
				`Group ${index + 1} (${group.members.length}): ${group.members.join(", ")}`
		)
		.join("\n");

	try {
		await navigator.clipboard.writeText(output);
		setStatus("Copied results to clipboard.", true);
	} catch {
		setStatus("Clipboard blocked by browser. Select and copy manually.");
	}
});

document.getElementById("sampleBtn").addEventListener("click", () => {
	namesInput.value = [
		"Ashley",
		"Mia",
		"Noah",
		"Emma",
		"Lucas",
		"Sophia",
		"Liam",
		"Olivia",
		"Ethan",
		"Ava",
		"Daniel",
		"Ella"
	].join("\n");
	groupCountInput.value = "3";
	groupSizeInput.value = "4";
	setStatus("Sample loaded.", true);
});

adminSaveBtn.addEventListener("click", () => {
	const token = adminTokenInput.value.trim();
	const bundlesRaw = adminBundlesInput.value;
	const enabled = adminEnabledInput.checked;

	if (!token) {
		setAdminStatus("Token is required to save admin config.");
		return;
	}

	let parsedBundles;
	try {
		parsedBundles = parseBundlesText(bundlesRaw);
	} catch (error) {
		setAdminStatus(error.message || "Invalid bundle format.");
		return;
	}

	const payload = {
		token,
		bundlesRaw,
		enabled
	};

	localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(payload));
	setAdminStatus(
		`Saved ${parsedBundles.length} bundle rule(s). Override is ${enabled ? "ON" : "OFF"}.`,
		true
	);
});

fileInput.addEventListener("change", async (event) => {
	const file = event.target.files && event.target.files[0];
	if (!file) {
		return;
	}

	try {
		const text = await file.text();
		const merged = mergeNames(namesInput.value, text);
		namesInput.value = merged.join("\n");
		setStatus(`Imported ${merged.length} names from file.`, true);
	} catch {
		setStatus("Could not read that file.");
	} finally {
		fileInput.value = "";
	}
});

async function buildAndRenderGroups() {
	setStatus("");
	resultsContainer.innerHTML = "";

	const names = normalizeNames(namesInput.value);
	if (names.length === 0) {
		setStatus("Add at least one name.");
		metaEl.textContent = "";
		latestGroups = null;
		latestLockedSets = [];
		return;
	}

	const groupCount = parsePositiveInt(groupCountInput.value);
	const groupSize = parsePositiveInt(groupSizeInput.value);

	if (!groupCount && !groupSize) {
		setStatus("Set number of groups, people per group, or both.");
		metaEl.textContent = "";
		latestGroups = null;
		latestLockedSets = [];
		return;
	}

	setStatus("Generating groups...");

	try {
		const adminOverride = getActiveAdminOverride();

		const response = await fetch("/api/group", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				names,
				groupCount,
				groupSize,
				adminToken: adminOverride ? adminOverride.token : undefined,
				overrideBundles: adminOverride ? adminOverride.bundles : undefined
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			throw new Error(payload.error || "Failed to generate groups.");
		}

		latestGroups = payload.groups;
		latestLockedSets = payload.activeLockedSets || [];
		renderGroups(latestGroups, latestLockedSets);
		setStatus("Groups generated successfully.", true);
		metaEl.textContent = `${names.length} people across ${latestGroups.length} groups`;
	} catch (error) {
		setStatus(error.message || "Failed to generate groups.");
		metaEl.textContent = "";
		latestGroups = null;
		latestLockedSets = [];
	}
}

function normalizeNames(raw) {
	const seen = new Set();
	const result = [];

	raw
		.split(/[\n,;]+/)
		.map((name) => name.trim())
		.filter(Boolean)
		.forEach((name) => {
			const canonical = name.toLowerCase();
			if (!seen.has(canonical)) {
				seen.add(canonical);
				result.push(name);
			}
		});

	return result;
}

function mergeNames(current, incoming) {
	return normalizeNames(`${current}\n${incoming}`);
}

function renderGroups(groups, lockedSets) {
	const lockedPairMap = buildLockedPairMap(lockedSets);

	groups.forEach((group, idx) => {
		const card = document.createElement("article");
		card.className = "group-card";
		card.style.animationDelay = `${idx * 70}ms`;

		const title = document.createElement("h3");
		title.textContent = `Group ${idx + 1}`;

		const list = document.createElement("ul");
		group.members.forEach((member) => {
			const item = document.createElement("li");
			item.textContent = member;

			if (lockedPairMap.has(member)) {
				const chip = document.createElement("span");
				chip.className = "lock-chip";
				chip.textContent = "LOCKED";
				item.appendChild(chip);
			}

			list.appendChild(item);
		});

		card.append(title, list);
		resultsContainer.appendChild(card);
	});
}

function buildLockedPairMap(lockedSets) {
	const map = new Map();
	lockedSets.forEach((set, idx) => {
		set.forEach((name) => map.set(name, idx));
	});
	return map;
}

function parsePositiveInt(value) {
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) && n > 0 ? n : null;
}

function parseBundlesText(raw) {
	const lines = raw
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	if (lines.length === 0) {
		throw new Error("Add at least one bundle rule line.");
	}

	const bundles = lines.map((line, index) => {
		const members = line
			.split(/[,+]/)
			.map((item) => item.trim())
			.filter(Boolean);
		const unique = [...new Set(members)];

		if (unique.length < 2) {
			throw new Error(`Bundle line ${index + 1} needs at least 2 names.`);
		}

		return unique;
	});

	return bundles;
}

function getActiveAdminOverride() {
	if (!adminEnabledInput.checked) {
		return null;
	}

	const token = adminTokenInput.value.trim();
	if (!token) {
		throw new Error("Admin override enabled but token is empty.");
	}

	const bundles = parseBundlesText(adminBundlesInput.value);
	return { token, bundles };
}

function loadAdminConfig() {
	try {
		const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
		if (!raw) {
			return;
		}

		const config = JSON.parse(raw);
		adminTokenInput.value = String(config.token || "");
		adminBundlesInput.value = String(config.bundlesRaw || "");
		adminEnabledInput.checked = Boolean(config.enabled);
		setAdminStatus("Loaded saved admin config.", true);
	} catch {
		setAdminStatus("Could not load saved admin config.");
	}
}

function setAdminStatus(message, isSuccess = false) {
	adminStatusEl.textContent = message;
	adminStatusEl.style.color = isSuccess ? "#116e4a" : "#8a3f03";
}

function setStatus(message, isSuccess = false) {
	statusEl.textContent = message;
	statusEl.style.color = isSuccess ? "#116e4a" : "#c23f00";
}


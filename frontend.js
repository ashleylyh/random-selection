const namesInput = document.getElementById("namesInput");
const groupCountInput = document.getElementById("groupCount");
const groupSizeInput = document.getElementById("groupSize");
const resultsContainer = document.getElementById("results");
const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");

let latestGroups = null;

document.getElementById("generateBtn").addEventListener("click", () => {
	void buildAndRenderGroups();
});

document.getElementById("reshuffleBtn").addEventListener("click", () => {
	if (!latestGroups) {
		setStatus("請先產生一次分組，才能重新分組。");
		return;
	}
	void buildAndRenderGroups();
});

document.getElementById("copyBtn").addEventListener("click", async () => {
	if (!latestGroups) {
		setStatus("目前沒有可複製的分組結果。");
		return;
	}

	const output = latestGroups
		.map(
			(group, index) =>
				`第 ${index + 1} 組（${group.members.length} 人）：${group.members.join(", ")}`
		)
		.join("\n");

	try {
		await navigator.clipboard.writeText(output);
		setStatus("已複製分組結果。", true);
	} catch {
		setStatus("瀏覽器封鎖剪貼簿，請手動複製。");
	}
});

async function buildAndRenderGroups() {
	setStatus("");
	resultsContainer.innerHTML = "";

	const names = normalizeNames(namesInput.value);
	if (names.length === 0) {
		setStatus("請至少輸入一位成員名稱。");
		metaEl.textContent = "";
		latestGroups = null;
		return;
	}

	const groupCount = parsePositiveInt(groupCountInput.value);
	const groupSize = parsePositiveInt(groupSizeInput.value);

	if (!groupCount && !groupSize) {
		setStatus("請至少填寫組數或每組人數其中一項。");
		metaEl.textContent = "";
		latestGroups = null;
		return;
	}

	setStatus("分組計算中...");

	try {
		const response = await fetch("/api/group", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				names,
				groupCount,
				groupSize
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			throw new Error(payload.error || "分組失敗，請稍後再試。");
		}

		latestGroups = payload.groups;
		renderGroups(latestGroups);
		setStatus("分組完成。", true);
		metaEl.textContent = `共 ${names.length} 人，分成 ${latestGroups.length} 組`;
	} catch (error) {
		setStatus(error.message || "分組失敗，請檢查輸入內容。");
		metaEl.textContent = "";
		latestGroups = null;
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

function renderGroups(groups) {
	groups.forEach((group, idx) => {
		const card = document.createElement("article");
		card.className = "group-card";
		card.style.animationDelay = `${idx * 70}ms`;

		const title = document.createElement("h3");
		title.textContent = `第 ${idx + 1} 組`;

		const list = document.createElement("ul");
		group.members.forEach((member) => {
			const item = document.createElement("li");
			item.textContent = member;

			list.appendChild(item);
		});

		card.append(title, list);
		resultsContainer.appendChild(card);
	});
}

function parsePositiveInt(value) {
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) && n > 0 ? n : null;
}

function setStatus(message, isSuccess = false) {
	statusEl.textContent = message;
	statusEl.style.color = isSuccess ? "#116e4a" : "#c23f00";
}


const LOCKED_BUNDLES = [
  ["王立動", "黃則睿","張巧蓁", "陳苡涵"]
];

module.exports = (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { names, groupCount, groupSize } = req.body || {};

  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: "Provide at least one name." });
  }

  const parsedGroupCount = parsePositiveInt(groupCount);
  const parsedGroupSize = parsePositiveInt(groupSize);

  if (!parsedGroupCount && !parsedGroupSize) {
    return res
      .status(400)
      .json({ error: "Set number of groups, people per group, or both." });
  }

  try {
    const normalizedNames = normalizeNames(names);
    const lockedSets = buildActiveLockedSets(normalizedNames, LOCKED_BUNDLES);
    const groups = generateGroups({
      names: normalizedNames,
      lockedSets,
      groupCount: parsedGroupCount,
      groupSize: parsedGroupSize
    });

    return res.status(200).json({
      groups,
      activeLockedSets: lockedSets
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

function normalizeNames(rawNames) {
  const seen = new Set();
  const result = [];

  rawNames
    .map((name) => String(name || "").trim())
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

function buildActiveLockedSets(names, lockedBundles) {
  const nameLookup = new Map(names.map((name) => [name.toLowerCase(), name]));

  return lockedBundles
    .map((bundle) =>
      bundle
        .map((member) => nameLookup.get(member.toLowerCase()))
        .filter(Boolean)
    )
    .filter((bundle) => bundle.length >= 2);
}

function generateGroups({ names, lockedSets, groupCount, groupSize }) {
  const units = buildUnits(names, lockedSets);
  const totalPeople = names.length;
  const resolvedGroupCount = resolveGroupCount(totalPeople, groupCount, groupSize);
  const capacities = resolveCapacities(totalPeople, resolvedGroupCount, groupSize);

  units.forEach((unit) => {
    const maxCap = Math.max(...capacities);
    if (unit.members.length > maxCap) {
      throw new Error(
        `Locked set (${unit.members.join(", ")}) is too large for current group settings.`
      );
    }
  });

  const capacityTotal = capacities.reduce((sum, value) => sum + value, 0);
  if (capacityTotal < totalPeople) {
    throw new Error("Not enough total capacity for all names. Increase group size or count.");
  }

  for (let attempt = 0; attempt < 1600; attempt += 1) {
    const attemptGroups = placeUnits(units, capacities);
    if (attemptGroups) {
      return attemptGroups;
    }
  }

  throw new Error("Could not satisfy constraints. Adjust group settings.");
}

function buildUnits(names, lockedSets) {
  const lockedMembers = new Set(lockedSets.flat());
  const units = lockedSets.map((set) => ({ members: set, locked: true }));

  names.forEach((name) => {
    if (!lockedMembers.has(name)) {
      units.push({ members: [name], locked: false });
    }
  });

  return units;
}

function resolveGroupCount(totalPeople, groupCount, groupSize) {
  if (groupCount && groupSize) {
    return groupCount;
  }
  if (groupCount) {
    return groupCount;
  }
  return Math.ceil(totalPeople / groupSize);
}

function resolveCapacities(totalPeople, groupCount, groupSize) {
  if (groupSize) {
    return Array.from({ length: groupCount }, () => groupSize);
  }

  const base = Math.floor(totalPeople / groupCount);
  const remainder = totalPeople % groupCount;
  return Array.from({ length: groupCount }, (_, index) =>
    index < remainder ? base + 1 : base
  );
}

function placeUnits(units, capacities) {
  const groups = capacities.map((capacity) => ({
    members: [],
    remaining: capacity
  }));

  const shuffledUnits = shuffleArray(units)
    .slice()
    .sort((a, b) => b.members.length - a.members.length);

  for (const unit of shuffledUnits) {
    const candidateIndices = groups
      .map((group, index) => ({ index, remaining: group.remaining }))
      .filter(({ remaining }) => remaining >= unit.members.length)
      .map(({ index }) => index);

    if (candidateIndices.length === 0) {
      return null;
    }

    const chosenIndex =
      candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
    const chosenGroup = groups[chosenIndex];
    chosenGroup.members.push(...unit.members);
    chosenGroup.remaining -= unit.members.length;
  }

  return groups.map((group) => ({
    members: shuffleArray(group.members)
  }));
}

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function shuffleArray(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

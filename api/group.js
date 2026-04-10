const LOCKED_PROFILES = [
  {
    members: ["王力勳", "黃則睿", "張巧蓁", "陳苡涵"],
    splitUnits: [
      ["王力勳", "黃則睿"],
      ["張巧蓁", "陳苡涵"]
    ]
  }
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
    const resolvedGroupCount = resolveGroupCount(
      normalizedNames.length,
      parsedGroupCount,
      parsedGroupSize
    );
    const capacities = resolveCapacities(
      normalizedNames.length,
      resolvedGroupCount,
      parsedGroupSize
    );
    const maxCap = Math.max(...capacities);
    const lockedSets = buildActiveLockedSets(normalizedNames, LOCKED_PROFILES, maxCap);

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

function buildActiveLockedSets(names, lockedProfiles, maxCap) {
  const nameLookup = new Map(names.map((name) => [name.toLowerCase(), name]));
  const matchedSets = [];

  lockedProfiles.forEach((profile) => {
    const fullSet = resolveMembersFromLookup(profile.members, nameLookup);
    if (fullSet.length < 2) {
      return;
    }

    // If current group capacity allows, keep the full bundle together.
    if (maxCap >= fullSet.length) {
      matchedSets.push(fullSet);
      return;
    }

    // For small-group stage (e.g. size=2), enforce predefined pair splits.
    const splitUnits = Array.isArray(profile.splitUnits) ? profile.splitUnits : [];
    const resolvedSplits = splitUnits
      .map((unit) => resolveMembersFromLookup(unit, nameLookup))
      .filter((unit) => unit.length >= 2 && unit.length <= maxCap);

    if (resolvedSplits.length > 0) {
      matchedSets.push(...resolvedSplits);
      return;
    }

    // Fallback when no explicit split is defined: chunk into pairs.
    if (maxCap >= 2) {
      for (let i = 0; i < fullSet.length; i += 2) {
        const chunk = fullSet.slice(i, i + Math.min(2, maxCap));
        if (chunk.length >= 2) {
          matchedSets.push(chunk);
        }
      }
    }
  });

  return dedupeLockedSets(matchedSets);
}

function resolveMembersFromLookup(memberList, nameLookup) {
  const unique = new Set();
  const resolved = [];

  memberList
    .map((member) => nameLookup.get(String(member || "").trim().toLowerCase()))
    .filter(Boolean)
    .forEach((member) => {
      const key = member.toLowerCase();
      if (!unique.has(key)) {
        unique.add(key);
        resolved.push(member);
      }
    });

  return resolved;
}

function dedupeLockedSets(lockedSets) {
  const seen = new Set();
  const result = [];

  lockedSets.forEach((set) => {
    if (set.length < 2) {
      return;
    }
    const key = set
      .map((member) => member.toLowerCase())
      .sort()
      .join("|");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(set);
    }
  });

  return result;
}

function generateGroups({ names, lockedSets, groupCount, groupSize }) {
  if (!Array.isArray(lockedSets) || lockedSets.length === 0) {
    return generateFairGroups({ names, groupCount, groupSize });
  }

  const totalPeople = names.length;
  const resolvedGroupCount = resolveGroupCount(totalPeople, groupCount, groupSize);
  const capacities = resolveCapacities(totalPeople, resolvedGroupCount, groupSize);
  const maxCap = Math.max(...capacities);
  const normalizedLockedSets = fitLockedSetsToCapacity(lockedSets, maxCap);
  const units = buildUnits(names, normalizedLockedSets);

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

function generateFairGroups({ names, groupCount, groupSize }) {
  const totalPeople = names.length;
  const resolvedGroupCount = resolveGroupCount(totalPeople, groupCount, groupSize);
  const capacities = resolveCapacities(totalPeople, resolvedGroupCount, groupSize);

  const capacityTotal = capacities.reduce((sum, value) => sum + value, 0);
  if (capacityTotal < totalPeople) {
    throw new Error("Not enough total capacity for all names. Increase group size or count.");
  }

  const shuffledNames = shuffleArray(names);
  const groups = capacities.map((capacity) => ({
    members: [],
    remaining: capacity
  }));

  shuffledNames.forEach((name) => {
    const candidates = groups
      .map((group, index) => ({ index, remaining: group.remaining }))
      .filter(({ remaining }) => remaining > 0)
      .map(({ index }) => index);

    const chosenIndex = candidates[Math.floor(Math.random() * candidates.length)];
    groups[chosenIndex].members.push(name);
    groups[chosenIndex].remaining -= 1;
  });

  return groups.map((group) => ({ members: group.members }));
}

function fitLockedSetsToCapacity(lockedSets, maxCap) {
  if (maxCap >= 2) {
    const result = [];

    lockedSets.forEach((set) => {
      if (set.length <= maxCap) {
        result.push(set);
        return;
      }

      // Oversized locked sets are downgraded to smaller bundles, preferring pairs.
      for (let i = 0; i < set.length; i += 2) {
        const chunk = set.slice(i, i + Math.min(2, maxCap));
        if (chunk.length >= 2) {
          result.push(chunk);
        }
      }
    });

    return result;
  }

  return [];
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

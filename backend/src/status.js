const RISK_KEYWORDS = ["pest", "disease", "dry", "flood"];

function computeFieldStatus(field) {
  if (field.current_stage === "HARVESTED") {
    return "Completed";
  }

  const latestNote = (field.latest_note || "").toLowerCase();
  const noteRisk = RISK_KEYWORDS.some((keyword) => latestNote.includes(keyword));

  const now = new Date();
  const latestUpdateAt = field.latest_update_at ? new Date(field.latest_update_at) : null;
  const staleUpdate =
    !latestUpdateAt || now.getTime() - latestUpdateAt.getTime() > 7 * 24 * 60 * 60 * 1000;

  if (noteRisk || staleUpdate) {
    return "AtRisk";
  }

  return "Active";
}

module.exports = { computeFieldStatus };

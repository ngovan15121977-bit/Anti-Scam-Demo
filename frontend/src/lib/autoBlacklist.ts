import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const REPORT_THRESHOLD = 100;   // số báo cáo tối thiểu để auto-blacklist
const WINDOW_HOURS = 1;         // cửa sổ thời gian gom báo cáo

interface SweepResult {
  candidatesFound: number;
  newlyBlacklisted: number;
  updated: number;
  skippedOfficial: number;
}

export async function runAutoBlacklistSweep(): Promise<SweepResult> {
  const result: SweepResult = { candidatesFound: 0, newlyBlacklisted: 0, updated: 0, skippedOfficial: 0 };

  // Gom báo cáo theo entity trong cửa sổ thời gian
  const candidates = await sql`
    SELECT entity_type, entity_value, bank, COUNT(*)::int AS report_count
    FROM antiscam.scam_reports
    WHERE created_at > now() - (${WINDOW_HOURS} || ' hours')::interval
      AND entity_value IS NOT NULL
      AND status != 'rejected'
    GROUP BY entity_type, entity_value, bank
    HAVING COUNT(*) >= ${REPORT_THRESHOLD}
  `;

  result.candidatesFound = candidates.length;

  for (const c of candidates) {
    // Không auto-blacklist nếu đã là đối tác chính thức (chống report troll)
    const isOfficial = await sql`
      SELECT 1 FROM antiscam.recipient_directory
      WHERE account_number = ${c.entity_value} AND is_official_partner = true
      LIMIT 1
    `;
    if (isOfficial.length > 0) {
      result.skippedOfficial++;
      continue;
    }

    const riskScore = Math.min(0.95, 0.5 + c.report_count / 200);

    const existing = await sql`
      SELECT id FROM antiscam.blacklist
      WHERE entity_type = ${c.entity_type} AND entity_value = ${c.entity_value} AND is_active = true
      LIMIT 1
    `;

    if (existing.length > 0) {
      await sql`
        UPDATE antiscam.blacklist
        SET risk_score = GREATEST(risk_score, ${riskScore}),
            updated_at = now(),
            evidence = COALESCE(evidence, '{}'::jsonb) || ${JSON.stringify({ auto_report_count: c.report_count, last_sweep_at: new Date().toISOString() })}::jsonb
        WHERE id = ${existing[0].id}
      `;
      result.updated++;
    } else {
      await sql`
        INSERT INTO antiscam.blacklist
          (entity_type, entity_value, bank, source, risk_score, evidence, is_active)
        VALUES (
          ${c.entity_type}, ${c.entity_value}, ${c.bank}, 'community_auto', ${riskScore},
          ${JSON.stringify({ auto_report_count: c.report_count, window_hours: WINDOW_HOURS })}::jsonb,
          true
        )
      `;
      result.newlyBlacklisted++;
    }
  }

  return result;
}
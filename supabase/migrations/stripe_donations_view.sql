CREATE OR REPLACE VIEW stripe_donations_enriched AS
SELECT
  d.*,
  COALESCE(d.donor_name,  c.name)  AS resolved_name,
  COALESCE(d.donor_email, c.email) AS resolved_email,
  COALESCE(d.donor_phone, c.phone) AS resolved_phone
FROM stripe_donations d
LEFT JOIN stripe_customers c ON d.stripe_customer_id = c.stripe_customer_id;

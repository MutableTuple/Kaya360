-- =====================================================================
-- Storage bucket, default settings and system email templates
-- (System data only. Demo data lives in supabase/seed_demo.sql and is
--  flagged is_demo = true.)
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "attachments read" on storage.objects;
drop policy if exists "attachments write" on storage.objects;
drop policy if exists "attachments delete" on storage.objects;
create policy "attachments read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_member());
create policy "attachments write" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_write());
create policy "attachments delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.is_manager());

-- ---------------------------------------------------------------------
-- Default application settings
-- ---------------------------------------------------------------------
insert into public.application_settings (key, value) values
('company', jsonb_build_object(
  'name', 'KAYA INTERIORS PRIVATE LIMITED',
  'website', 'https://www.kayainteriors.in',
  'logo_url', null,
  'address', '',
  'introduction', 'Kaya Interiors Private Limited is an interior contracting company delivering turnkey interior execution, commercial fit-outs, civil finishing, furniture manufacturing and installation across India.',
  'services', jsonb_build_array('Turnkey interior execution','Commercial interior fit-outs','Civil finishing','Furniture manufacturing & installation','Modular furniture','Carpentry & joinery','Flooring','False ceilings','Partitions','Painting','Electrical works'),
  'target_markets', jsonb_build_array('West India','North India'),
  'preferred_categories', jsonb_build_array('Corporate offices','Commercial office interiors','IT parks','Retail stores','Showrooms','Hospitals','Hotels','Banks','Co-working spaces')
)),
('lead_generation', jsonb_build_object(
  'preferred_states', jsonb_build_array('Maharashtra','Gujarat','Goa','Delhi','Haryana','Uttar Pradesh','Rajasthan','Punjab','Chandigarh'),
  'preferred_cities', jsonb_build_array('Mumbai','Thane','Navi Mumbai','Pune','Ahmedabad','Surat','Gurugram','Noida','Delhi'),
  'project_sizes', jsonb_build_array('10k_25k','25k_50k','50k_100k','gt_100k'),
  'max_queries_per_job', 24,
  'max_pages_per_query', 4,
  'monthly_api_budget_usd', 50
)),
('scoring_weights', jsonb_build_object(
  'confirmed_project', 25, 'confirmed_interior_requirement', 20, 'decision_maker', 15,
  'verified_contact', 15, 'priority_region', 10, 'external_contractor_potential', 10, 'execution_readiness', 5
)),
('automation', jsonb_build_object(
  'enabled', false,
  'daily', jsonb_build_object('discover_projects', true, 'discover_tenders', true, 'max_jobs', 2),
  'weekly', jsonb_build_object('refresh_hot_leads', true, 'deadline_check', true, 'report', true),
  'monthly', jsonb_build_object('performance_report', true, 'inactive_leads', true),
  'geography', jsonb_build_object('region', 'west', 'states', jsonb_build_array(), 'cities', jsonb_build_array('Mumbai','Pune','Gurugram')),
  'categories', jsonb_build_array('Corporate offices','Commercial office interiors','Hospitals','Hotels','Retail stores'),
  'queries_per_run', 12,
  'notify_roles', jsonb_build_array('administrator','bd_manager')
)),
('search_providers', jsonb_build_object('order', jsonb_build_array('serper')))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- System email templates (placeholders are filled from real records;
-- unfilled placeholders block sending)
-- ---------------------------------------------------------------------
insert into public.email_templates (slug, name, category, subject, body, is_system) values
('company_introduction', 'Company introduction', 'introduction',
 'Interior contracting partner for {{project_name}}',
 E'Dear {{contact_name}},\n\nI am writing from Kaya Interiors Private Limited. {{company_introduction}}\n\nWe understand that {{company_name}} is progressing {{project_name}} in {{city}}. We would welcome the opportunity to support the interior execution package — civil finishing, ceilings and partitions, flooring, joinery and furniture — under a single accountable contractor.\n\nWould you be open to a short call to understand the scope and timelines?\n\nWarm regards,\n{{sender_name}}\n{{sender_designation}}\nKaya Interiors Private Limited\n{{sender_phone}} | {{kaya_website}}', true),
('empanelment', 'Interior contractor empanelment', 'empanelment',
 'Request for empanelment – Kaya Interiors (interior contracting)',
 E'Dear {{contact_name}},\n\nKaya Interiors Private Limited would like to be considered for empanelment as an interior contractor with {{company_name}}.\n\n{{company_introduction}}\n\nPlease let us know the empanelment process and the documents you require. We will submit our company profile, statutory documents and project references promptly.\n\nRegards,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}} | {{kaya_website}}', true),
('project_enquiry', 'Request for project enquiry', 'enquiry',
 'Enquiry: interior works for {{project_name}}',
 E'Dear {{contact_name}},\n\nWe noted the announcement regarding {{project_name}} in {{city}}. Kaya Interiors would like to participate in the interior works package when it is ready for tender or enquiry.\n\nCould you advise whether the interior contractor selection has started, and who we should coordinate with?\n\nThank you,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}}', true),
('request_boq', 'Request for BOQ and drawings', 'boq',
 'Request for BOQ and drawings – {{project_name}}',
 E'Dear {{contact_name}},\n\nThank you for the discussion on {{project_name}}. To prepare an accurate quotation, could you share the BOQ, GFC/tender drawings, specifications and the expected timeline?\n\nWe will revert with queries, if any, within two working days of receipt.\n\nRegards,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}}', true),
('intro_follow_up', 'Follow-up after introduction', 'follow_up',
 'Following up – Kaya Interiors for {{project_name}}',
 E'Dear {{contact_name}},\n\nI am following up on my earlier note regarding interior execution support for {{project_name}}. If the timing is not right, I would be grateful if you could point me to the right colleague or a better time to reconnect.\n\nBest regards,\n{{sender_name}}\n{{sender_phone}}', true),
('quotation_submission', 'Quotation submission', 'quotation',
 'Quotation for interior works – {{project_name}}',
 E'Dear {{contact_name}},\n\nPlease find attached our quotation for the interior works at {{project_name}}, prepared against the BOQ and drawings shared.\n\nWe are available to walk you through the rates, specifications and execution plan at your convenience.\n\nRegards,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}}', true),
('quotation_follow_up', 'Quotation follow-up', 'quotation',
 'Follow-up on our quotation – {{project_name}}',
 E'Dear {{contact_name}},\n\nI wanted to check whether you had a chance to review our quotation for {{project_name}}. We are happy to clarify any item, discuss value-engineering options or meet for a technical review.\n\nRegards,\n{{sender_name}}\n{{sender_phone}}', true),
('meeting_request', 'Meeting request', 'meeting',
 'Request for a meeting – interior execution for {{project_name}}',
 E'Dear {{contact_name}},\n\nWould you be available for a 30-minute meeting in the coming week to discuss the interior scope for {{project_name}}? We can meet at your office in {{city}} or connect online, whichever suits you.\n\nRegards,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}}', true),
('vendor_registration', 'Vendor registration', 'vendor',
 'Vendor registration – Kaya Interiors Private Limited',
 E'Dear {{contact_name}},\n\nKaya Interiors Private Limited would like to register as a vendor with {{company_name}} for interior fit-out, civil finishing and furniture works.\n\nKindly share the vendor registration link or form and the list of required documents.\n\nThank you,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}} | {{kaya_website}}', true),
('capability_presentation', 'Project capability presentation', 'presentation',
 'Kaya Interiors – capability presentation',
 E'Dear {{contact_name}},\n\nAs discussed, I am sharing Kaya Interiors'' capability presentation covering our services, execution approach and in-house furniture manufacturing.\n\n{{company_introduction}}\n\nWe would value the opportunity to present it to your team in person.\n\nRegards,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}} | {{kaya_website}}', true)
on conflict (slug) do nothing;

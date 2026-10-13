-- =============================================================================
-- Seed: reference and configuration data only.
-- No lawyers, firms, reviews, credentials or client data are seeded — those
-- must come from real registrations and verification.
-- Idempotent: safe to re-run.
-- =============================================================================

-- Egyptian governorates (ISO 3166-2:EG)
insert into public.governorates (code, name_ar, name_en, sort_order) values
  ('C', 'القاهرة', 'Cairo', 1), ('GZ', 'الجيزة', 'Giza', 2), ('ALX', 'الإسكندرية', 'Alexandria', 3),
  ('KB', 'القليوبية', 'Qalyubia', 4), ('DK', 'الدقهلية', 'Dakahlia', 5), ('SHR', 'الشرقية', 'Sharqia', 6),
  ('GH', 'الغربية', 'Gharbia', 7), ('MNF', 'المنوفية', 'Monufia', 8), ('BH', 'البحيرة', 'Beheira', 9),
  ('KFS', 'كفر الشيخ', 'Kafr El Sheikh', 10), ('DT', 'دمياط', 'Damietta', 11), ('PTS', 'بورسعيد', 'Port Said', 12),
  ('IS', 'الإسماعيلية', 'Ismailia', 13), ('SUZ', 'السويس', 'Suez', 14), ('FYM', 'الفيوم', 'Faiyum', 15),
  ('BNS', 'بني سويف', 'Beni Suef', 16), ('MN', 'المنيا', 'Minya', 17), ('AST', 'أسيوط', 'Asyut', 18),
  ('SHG', 'سوهاج', 'Sohag', 19), ('KN', 'قنا', 'Qena', 20), ('LX', 'الأقصر', 'Luxor', 21),
  ('ASN', 'أسوان', 'Aswan', 22), ('BA', 'البحر الأحمر', 'Red Sea', 23), ('WAD', 'الوادي الجديد', 'New Valley', 24),
  ('MT', 'مطروح', 'Matrouh', 25), ('SIN', 'شمال سيناء', 'North Sinai', 26), ('JS', 'جنوب سيناء', 'South Sinai', 27)
on conflict (code) do nothing;

insert into public.cities (governorate_id, name_ar, name_en, slug)
select g.id, c.name_ar, c.name_en, c.slug
from (values
  ('C', 'مدينة نصر', 'Nasr City', 'nasr-city'), ('C', 'مصر الجديدة', 'Heliopolis', 'heliopolis'),
  ('C', 'المعادي', 'Maadi', 'maadi'), ('C', 'القاهرة الجديدة', 'New Cairo', 'new-cairo'),
  ('C', 'وسط البلد', 'Downtown', 'downtown'), ('C', 'الزمالك', 'Zamalek', 'zamalek'), ('C', 'شبرا', 'Shubra', 'shubra'),
  ('C', 'العباسية', 'Abbassia', 'abbassia'), ('C', 'حلوان', 'Helwan', 'helwan'),
  ('GZ', 'الدقي', 'Dokki', 'dokki'), ('GZ', 'المهندسين', 'Mohandessin', 'mohandessin'),
  ('GZ', 'السادس من أكتوبر', '6th of October', '6th-of-october'), ('GZ', 'الشيخ زايد', 'Sheikh Zayed', 'sheikh-zayed'),
  ('GZ', 'الهرم', 'Haram', 'haram'), ('GZ', 'فيصل', 'Faisal', 'faisal'),
  ('ALX', 'سموحة', 'Smouha', 'smouha'), ('ALX', 'سيدي جابر', 'Sidi Gaber', 'sidi-gaber'),
  ('ALX', 'المنشية', 'El Mansheya', 'mansheya'), ('ALX', 'برج العرب', 'Borg El Arab', 'borg-el-arab'),
  ('KB', 'بنها', 'Banha', 'banha'), ('KB', 'شبرا الخيمة', 'Shubra El Kheima', 'shubra-el-kheima'),
  ('DK', 'المنصورة', 'Mansoura', 'mansoura'), ('SHR', 'الزقازيق', 'Zagazig', 'zagazig'),
  ('GH', 'طنطا', 'Tanta', 'tanta'), ('GH', 'المحلة الكبرى', 'El Mahalla El Kubra', 'mahalla'),
  ('MNF', 'شبين الكوم', 'Shebin El Kom', 'shebin-el-kom'), ('BH', 'دمنهور', 'Damanhour', 'damanhour'),
  ('KFS', 'كفر الشيخ', 'Kafr El Sheikh', 'kafr-el-sheikh'), ('DT', 'دمياط', 'Damietta', 'damietta'),
  ('PTS', 'بورسعيد', 'Port Said', 'port-said'), ('IS', 'الإسماعيلية', 'Ismailia', 'ismailia'),
  ('SUZ', 'السويس', 'Suez', 'suez'), ('FYM', 'الفيوم', 'Faiyum', 'faiyum'), ('BNS', 'بني سويف', 'Beni Suef', 'beni-suef'),
  ('MN', 'المنيا', 'Minya', 'minya'), ('AST', 'أسيوط', 'Asyut', 'asyut'), ('SHG', 'سوهاج', 'Sohag', 'sohag'),
  ('KN', 'قنا', 'Qena', 'qena'), ('LX', 'الأقصر', 'Luxor', 'luxor'), ('ASN', 'أسوان', 'Aswan', 'aswan'),
  ('BA', 'الغردقة', 'Hurghada', 'hurghada'), ('WAD', 'الخارجة', 'Kharga', 'kharga'), ('MT', 'مرسى مطروح', 'Marsa Matrouh', 'marsa-matrouh'),
  ('SIN', 'العريش', 'Arish', 'arish'), ('JS', 'شرم الشيخ', 'Sharm El Sheikh', 'sharm-el-sheikh')
) as c(gov, name_ar, name_en, slug)
join public.governorates g on g.code = c.gov
on conflict (governorate_id, slug) do nothing;

-- Legal specializations
insert into public.legal_categories (slug, name_ar, name_en, description_ar, description_en, icon, sort_order) values
  ('criminal', 'القانون الجنائي', 'Criminal Law', 'الجنح والجنايات، التحقيقات، والدفاع أمام المحاكم الجنائية.', 'Misdemeanours, felonies, investigations and criminal defence.', 'gavel', 1),
  ('civil', 'القانون المدني', 'Civil Law', 'المنازعات المدنية والتعويضات والالتزامات.', 'Civil disputes, compensation and obligations.', 'scale', 2),
  ('family', 'قانون الأسرة', 'Family Law', 'مسائل الأسرة والحضانة والنفقة والرؤية.', 'Family matters, custody, alimony and visitation.', 'users', 3),
  ('divorce', 'الطلاق والخلع', 'Divorce', 'دعاوى الطلاق والخلع وما يترتب عليها من حقوق.', 'Divorce and khula proceedings and related rights.', 'heart-crack', 4),
  ('personal-status', 'الزواج والأحوال الشخصية', 'Marriage & Personal Status', 'عقود الزواج وتوثيقها ومسائل الأحوال الشخصية.', 'Marriage contracts and personal status matters.', 'heart-handshake', 5),
  ('inheritance', 'المواريث', 'Inheritance', 'حصر الإرث وتقسيم التركات ومنازعاتها.', 'Estate determination, distribution and disputes.', 'scroll-text', 6),
  ('real-estate', 'العقارات', 'Real Estate', 'عقود البيع والشراء والتسجيل ومنازعات الملكية.', 'Sale contracts, registration and ownership disputes.', 'building-2', 7),
  ('rental', 'منازعات الإيجار', 'Rental Disputes', 'عقود الإيجار القديم والجديد والإخلاء.', 'Old and new rent contracts and evictions.', 'key-round', 8),
  ('employment', 'قانون العمل', 'Employment Law', 'عقود العمل والفصل التعسفي ومستحقات العاملين.', 'Employment contracts, unfair dismissal and entitlements.', 'briefcase', 9),
  ('commercial', 'القانون التجاري', 'Commercial Law', 'المعاملات التجارية والشيكات والأوراق التجارية.', 'Commercial transactions, cheques and instruments.', 'store', 10),
  ('corporate', 'قانون الشركات', 'Corporate Law', 'حوكمة الشركات وعقود الشراكة والاستحواذ.', 'Corporate governance, partnerships and M&A.', 'building', 11),
  ('company-formation', 'تأسيس الشركات', 'Company Formation', 'تأسيس الشركات واختيار الشكل القانوني والتراخيص.', 'Company incorporation, legal form and licensing.', 'file-plus-2', 12),
  ('tax', 'القانون الضريبي', 'Tax Law', 'المنازعات الضريبية والإقرارات والطعون.', 'Tax disputes, filings and appeals.', 'receipt', 13),
  ('intellectual-property', 'الملكية الفكرية', 'Intellectual Property', 'العلامات التجارية وبراءات الاختراع وحقوق المؤلف.', 'Trademarks, patents and copyright.', 'lightbulb', 14),
  ('administrative', 'القانون الإداري', 'Administrative Law', 'القرارات الإدارية والطعن عليها أمام مجلس الدولة.', 'Administrative decisions and State Council appeals.', 'landmark', 15),
  ('consumer-protection', 'حماية المستهلك', 'Consumer Protection', 'شكاوى المستهلكين وعيوب السلع والخدمات.', 'Consumer complaints and defective goods or services.', 'shield-check', 16),
  ('contracts', 'العقود', 'Contracts', 'صياغة ومراجعة العقود بأنواعها.', 'Drafting and reviewing all types of contracts.', 'file-signature', 17),
  ('debt-collection', 'تحصيل الديون', 'Debt Collection', 'المطالبات المالية وأوامر الأداء والتنفيذ.', 'Financial claims, payment orders and enforcement.', 'hand-coins', 18),
  ('insurance', 'منازعات التأمين', 'Insurance Disputes', 'المطالبات التأمينية ورفض التعويض.', 'Insurance claims and denied compensation.', 'umbrella', 19),
  ('cybercrime', 'الجرائم الإلكترونية', 'Cybercrime', 'الابتزاز والتشهير والاحتيال عبر الإنترنت.', 'Online extortion, defamation and fraud.', 'shield-alert', 20),
  ('banking-finance', 'البنوك والتمويل', 'Banking & Finance', 'القروض والتسهيلات والمنازعات المصرفية.', 'Loans, facilities and banking disputes.', 'banknote', 21),
  ('arbitration', 'التحكيم', 'Arbitration', 'التحكيم التجاري وتنفيذ أحكام التحكيم.', 'Commercial arbitration and enforcement of awards.', 'handshake', 22),
  ('immigration', 'الهجرة والإقامة', 'Immigration', 'الإقامة والجنسية وتصاريح العمل للأجانب.', 'Residency, nationality and work permits.', 'plane', 23),
  ('international', 'الخدمات القانونية الدولية', 'International Legal Services', 'المعاملات العابرة للحدود والتعاقدات الدولية.', 'Cross-border transactions and international contracts.', 'globe', 24)
on conflict (slug) do nothing;

insert into public.consultation_types (code, name_ar, name_en, description_ar, description_en, requires_meeting_room, is_scheduled, default_duration_minutes, sort_order) values
  ('video', 'استشارة فيديو', 'Video consultation', 'مكالمة فيديو آمنة داخل المنصة في الموعد المحدد.', 'A secure in-platform video call at the booked time.', true, true, 30, 1),
  ('voice', 'استشارة صوتية', 'Voice consultation', 'مكالمة صوتية آمنة داخل المنصة.', 'A secure in-platform voice call.', true, true, 30, 2),
  ('text', 'استشارة كتابية مباشرة', 'Live text consultation', 'محادثة نصية آمنة مع المحامي خلال الموعد.', 'A secure live text chat with the lawyer during the slot.', false, true, 30, 3),
  ('in_person', 'موعد في المكتب', 'In-person appointment', 'مقابلة حضورية في مكتب المحامي.', 'A face-to-face meeting at the lawyer''s office.', false, true, 60, 4),
  ('written_opinion', 'رأي قانوني مكتوب', 'Written legal opinion', 'رأي قانوني مكتوب يُسلَّم خلال المدة المحددة.', 'A written legal opinion delivered within the stated time.', false, false, 30, 5)
on conflict (code) do nothing;

-- Platform permissions (least-privilege admin modules)
insert into public.permissions (code, description) values
  ('users.view', 'View user accounts'), ('users.manage', 'Suspend / reactivate accounts'),
  ('verification.review', 'Review lawyer verification'), ('firms.manage', 'Manage law firms'),
  ('appointments.view', 'View appointment metadata'), ('services.moderate', 'Moderate service listings'),
  ('payments.view', 'View payments'), ('payments.refund', 'Issue refunds'), ('settlements.manage', 'Manage settlements'),
  ('subscriptions.manage', 'Manage plans and subscriptions'), ('disputes.manage', 'Resolve disputes'),
  ('reviews.moderate', 'Moderate reviews'), ('content.manage', 'Manage articles, FAQ, categories'),
  ('settings.manage', 'Manage platform settings'), ('audit.view', 'View audit logs'),
  ('support.tickets', 'Handle support tickets'), ('reports.view', 'View platform reports')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code)
select 'admin', code from public.permissions
on conflict do nothing;
insert into public.role_permissions (role, permission_code) values
  ('support', 'users.view'), ('support', 'appointments.view'), ('support', 'support.tickets')
on conflict do nothing;

-- Subscription plans (prices are configurable defaults; adjust in Admin → Subscriptions)
insert into public.subscription_plans (code, audience, name_ar, name_en, description_ar, description_en, price_monthly_minor, price_yearly_minor, trial_days, sort_order) values
  ('basic', 'lawyer', 'الأساسية', 'Basic', 'ملف عام وحجوزات محدودة شهريًا ولوحة تحكم أساسية.', 'Public profile, limited monthly bookings and a basic dashboard.', 0, 0, 0, 1),
  ('professional', 'lawyer', 'الاحترافية', 'Professional', 'حجوزات غير محدودة، تقويم متقدم، تحليلات، ونماذج مستندات.', 'Unlimited bookings, advanced calendar, analytics and document templates.', 49900, 499000, 14, 2),
  ('law_firm', 'firm', 'مكاتب المحاماة', 'Law Firm', 'عدة محامين وحسابات موظفين وتقويم مشترك وإدارة قضايا وتقارير مالية.', 'Multiple lawyers, staff accounts, shared calendar, case management and financial reports.', 199900, 1999000, 14, 3),
  ('enterprise', 'firm', 'المؤسسات', 'Enterprise', 'فروع متعددة وصلاحيات مخصصة وتحليلات متقدمة ودعم مخصص.', 'Multiple branches, custom permissions, advanced analytics and dedicated support.', 499900, 4999000, 0, 4)
on conflict (code) do nothing;

insert into public.plan_features (plan_id, feature_key, enabled, limit_value)
select p.id, f.key, f.enabled, f.lim
from public.subscription_plans p
join (values
  ('basic', 'bookings.monthly', true, 10), ('basic', 'services.listings', true, 1), ('basic', 'matters.active', true, 3),
  ('basic', 'calendar.advanced', false, null), ('basic', 'analytics', false, null), ('basic', 'templates', false, null),
  ('basic', 'profile.enhanced', false, null), ('basic', 'ai.tools', false, null),
  ('professional', 'bookings.monthly', true, null), ('professional', 'services.listings', true, 10), ('professional', 'matters.active', true, 100),
  ('professional', 'calendar.advanced', true, null), ('professional', 'analytics', true, null), ('professional', 'templates', true, null),
  ('professional', 'profile.enhanced', true, null), ('professional', 'ai.tools', true, null),
  ('law_firm', 'bookings.monthly', true, null), ('law_firm', 'services.listings', true, 50), ('law_firm', 'matters.active', true, null),
  ('law_firm', 'calendar.advanced', true, null), ('law_firm', 'calendar.shared', true, null), ('law_firm', 'analytics', true, null),
  ('law_firm', 'templates', true, null), ('law_firm', 'profile.enhanced', true, null), ('law_firm', 'ai.tools', true, null),
  ('law_firm', 'firm.lawyers', true, 10), ('law_firm', 'firm.staff', true, 10), ('law_firm', 'firm.branches', true, 1),
  ('law_firm', 'firm.financial_reports', true, null), ('law_firm', 'firm.custom_permissions', false, null),
  ('enterprise', 'bookings.monthly', true, null), ('enterprise', 'services.listings', true, null), ('enterprise', 'matters.active', true, null),
  ('enterprise', 'calendar.advanced', true, null), ('enterprise', 'calendar.shared', true, null), ('enterprise', 'analytics', true, null),
  ('enterprise', 'analytics.advanced', true, null), ('enterprise', 'templates', true, null), ('enterprise', 'profile.enhanced', true, null),
  ('enterprise', 'ai.tools', true, null), ('enterprise', 'firm.lawyers', true, null), ('enterprise', 'firm.staff', true, null),
  ('enterprise', 'firm.branches', true, 20), ('enterprise', 'firm.financial_reports', true, null),
  ('enterprise', 'firm.custom_permissions', true, null), ('enterprise', 'integrations', true, null), ('enterprise', 'support.dedicated', true, null)
) as f(code, key, enabled, lim) on f.code = p.code
on conflict (plan_id, feature_key) do nothing;

-- Global default commission (15%). Adjust in Admin → Commissions.
insert into public.commission_rules (scope, rate_bps, description)
select 'global', 1500, 'Default marketplace commission'
where not exists (select 1 from public.commission_rules where scope = 'global');

insert into public.platform_settings (key, value, description, is_public) values
  ('booking', '{"payment_hold_minutes": 15, "max_reschedules": 2, "written_opinion_days": 3}', 'Booking rules', true),
  ('refund_policy', '{"late_cancel_refund_percent": 50}', 'Refund percentages for client cancellations after the lawyer''s deadline', true),
  ('payments', '{"currency": "EGP", "gateway_fee_bearer": "platform", "min_payout_minor": 50000}', 'Payment and payout rules', false),
  ('subscriptions', '{"grace_days": 7}', 'Grace period before an unpaid subscription expires', false),
  ('services', '{"auto_complete_days": 7}', 'Days after delivery before an order auto-completes', true),
  ('messaging', '{"followup_days": 14}', 'Days messaging stays open after a consultation', true),
  ('uploads', '{"max_bytes": 26214400, "allowed_mime_types": ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "text/plain"]}', 'Upload limits', true),
  ('tax', '{"vat_bps": 0}', 'Tax applied to platform invoices — confirm with a tax advisor before launch', false),
  ('ai', '{"enabled": true}', 'Global AI assistant switch', true),
  ('locations', '{"countries": ["EG"]}', 'Supported countries', true)
on conflict (key) do nothing;

-- In-app notification templates ({{param}} placeholders)
insert into public.notification_templates (event_type, channel, locale, subject, body) values
  ('appointment.booked', 'in_app', 'ar', 'حجز استشارة جديد', 'حجز {{client}} {{type}} يوم {{date}} الساعة {{time}} (مرجع {{reference}}).'),
  ('appointment.booked', 'in_app', 'en', 'New consultation booking', '{{client}} booked a {{type}} on {{date}} at {{time}} (ref {{reference}}).'),
  ('appointment.confirmed', 'in_app', 'ar', 'تم تأكيد موعدك', 'استشارتك مع {{lawyer}} يوم {{date}} الساعة {{time}} مؤكدة.'),
  ('appointment.confirmed', 'in_app', 'en', 'Your appointment is confirmed', 'Your consultation with {{lawyer}} on {{date}} at {{time}} is confirmed.'),
  ('appointment.awaiting_confirmation', 'in_app', 'ar', 'طلبك بانتظار تأكيد المحامي', 'أرسلنا طلبك إلى {{lawyer}} لموعد {{date}} الساعة {{time}}، وسنخطرك فور التأكيد.'),
  ('appointment.awaiting_confirmation', 'in_app', 'en', 'Awaiting lawyer confirmation', 'Your request for {{date}} at {{time}} was sent to {{lawyer}}. We will notify you once confirmed.'),
  ('appointment.cancelled', 'in_app', 'ar', 'تم إلغاء موعد', 'أُلغي الموعد {{reference}} المقرر يوم {{date}} الساعة {{time}}. {{reason}}'),
  ('appointment.cancelled', 'in_app', 'en', 'Appointment cancelled', 'Appointment {{reference}} on {{date}} at {{time}} was cancelled. {{reason}}'),
  ('appointment.rescheduled', 'in_app', 'ar', 'تم تغيير موعد', 'الموعد {{reference}} أصبح يوم {{date}} الساعة {{time}}.'),
  ('appointment.rescheduled', 'in_app', 'en', 'Appointment rescheduled', 'Appointment {{reference}} is now on {{date}} at {{time}}.'),
  ('appointment.reminder', 'in_app', 'ar', 'تذكير بموعدك', 'لديك {{type}} يوم {{date}} الساعة {{time}} (مرجع {{reference}}).'),
  ('appointment.reminder', 'in_app', 'en', 'Appointment reminder', 'You have a {{type}} on {{date}} at {{time}} (ref {{reference}}).'),
  ('appointment.started', 'in_app', 'ar', 'بدأت الاستشارة', 'بدأ {{lawyer}} الاستشارة الآن، يمكنك الانضمام.'),
  ('appointment.started', 'in_app', 'en', 'Your consultation has started', '{{lawyer}} has started the consultation. You can join now.'),
  ('appointment.completed', 'in_app', 'ar', 'اكتملت الاستشارة', 'نأمل أن تكون استشارتك مع {{lawyer}} مفيدة. شاركنا تقييمك.'),
  ('appointment.completed', 'in_app', 'en', 'Consultation completed', 'We hope your consultation with {{lawyer}} helped. Please share your review.'),
  ('appointment.no_show', 'in_app', 'ar', 'تم تسجيل عدم حضور', 'سُجّل عدم حضورك للموعد {{reference}}. إن كان هناك خطأ يمكنك فتح نزاع.'),
  ('appointment.no_show', 'in_app', 'en', 'Marked as no-show', 'You were marked absent for {{reference}}. If this is wrong you can open a dispute.'),
  ('appointment.expired', 'in_app', 'ar', 'انتهت صلاحية الطلب', 'لم يُؤكَّد الموعد {{reference}} في الوقت المحدد، وسيُرد أي مبلغ مدفوع بالكامل.'),
  ('appointment.expired', 'in_app', 'en', 'Request expired', 'Appointment {{reference}} was not confirmed in time; any payment will be fully refunded.'),
  ('appointment.follow_up', 'in_app', 'ar', 'موعد متابعة جديد', 'حدد {{lawyer}} موعد متابعة يوم {{date}} الساعة {{time}}.'),
  ('appointment.follow_up', 'in_app', 'en', 'New follow-up appointment', '{{lawyer}} scheduled a follow-up on {{date}} at {{time}}.'),
  ('payment.succeeded', 'in_app', 'ar', 'تم الدفع بنجاح', 'استلمنا مبلغ {{amount}} ج.م (مرجع {{reference}}).'),
  ('payment.succeeded', 'in_app', 'en', 'Payment received', 'We received EGP {{amount}} (ref {{reference}}).'),
  ('payment.failed', 'in_app', 'ar', 'تعذّر إتمام الدفع', 'لم تكتمل عملية الدفع {{reference}}. يمكنك المحاولة مرة أخرى.'),
  ('payment.failed', 'in_app', 'en', 'Payment failed', 'Payment {{reference}} did not complete. You can try again.'),
  ('refund.processed', 'in_app', 'ar', 'تم رد المبلغ', 'تم رد {{amount}} ج.م للعملية {{reference}}. قد يستغرق ظهوره في حسابك عدة أيام عمل.'),
  ('refund.processed', 'in_app', 'en', 'Refund processed', 'EGP {{amount}} was refunded for {{reference}}. It may take a few business days to appear.'),
  ('message.new', 'in_app', 'ar', 'رسالة جديدة', 'لديك رسالة جديدة من {{sender}}.'),
  ('message.new', 'in_app', 'en', 'New message', 'You have a new message from {{sender}}.'),
  ('document.shared', 'in_app', 'ar', 'مستند جديد', 'تمت مشاركة المستند «{{title}}» معك.'),
  ('document.shared', 'in_app', 'en', 'New document', 'The document “{{title}}” was shared with you.'),
  ('matter.opened', 'in_app', 'ar', 'تم فتح ملف قضية', 'تم فتح الملف {{reference}}: {{title}}.'),
  ('matter.opened', 'in_app', 'en', 'Matter opened', 'Matter {{reference}} was opened: {{title}}.'),
  ('matter.status_changed', 'in_app', 'ar', 'تحديث على ملفك', 'تم تحديث حالة الملف {{reference}}.'),
  ('matter.status_changed', 'in_app', 'en', 'Matter update', 'The status of matter {{reference}} was updated.'),
  ('matter.assigned', 'in_app', 'ar', 'أُسند إليك ملف', 'أُسند إليك الملف {{reference}}: {{title}}.'),
  ('matter.assigned', 'in_app', 'en', 'Matter assigned', 'You were assigned matter {{reference}}: {{title}}.'),
  ('task.assigned', 'in_app', 'ar', 'مهمة جديدة', 'أُسندت إليك مهمة «{{title}}» في الملف {{reference}}.'),
  ('task.assigned', 'in_app', 'en', 'New task', 'You were assigned “{{title}}” on matter {{reference}}.'),
  ('hearing.scheduled', 'in_app', 'ar', 'جلسة جديدة', 'جلسة في {{court}} بتاريخ {{date}} (ملف {{reference}}).'),
  ('hearing.scheduled', 'in_app', 'en', 'Hearing scheduled', 'Hearing at {{court}} on {{date}} (matter {{reference}}).'),
  ('hearing.reminder', 'in_app', 'ar', 'تذكير بجلسة', 'تذكير: جلسة في {{court}} بتاريخ {{date}} (ملف {{reference}}).'),
  ('hearing.reminder', 'in_app', 'en', 'Hearing reminder', 'Reminder: hearing at {{court}} on {{date}} (matter {{reference}}).'),
  ('invoice.issued', 'in_app', 'ar', 'فاتورة جديدة', 'صدرت فاتورة جديدة رقم {{number}}.'),
  ('invoice.issued', 'in_app', 'en', 'New invoice', 'Invoice {{number}} was issued to you.'),
  ('verification.approved', 'in_app', 'ar', 'تم توثيق حسابك', 'تهانينا! تم توثيق حسابك كمحامٍ، ويمكنك الآن نشر ملفك واستقبال الحجوزات.'),
  ('verification.approved', 'in_app', 'en', 'You are verified', 'Congratulations! Your lawyer account is verified. You can now publish your profile.'),
  ('verification.rejected', 'in_app', 'ar', 'تعذّر توثيق حسابك', 'لم يتم قبول طلب التوثيق: {{reason}}'),
  ('verification.rejected', 'in_app', 'en', 'Verification not approved', 'Your verification request was not approved: {{reason}}'),
  ('subscription.activated', 'in_app', 'ar', 'تم تفعيل اشتراكك', 'تم تفعيل اشتراكك بنجاح.'),
  ('subscription.activated', 'in_app', 'en', 'Subscription active', 'Your subscription is now active.'),
  ('subscription.renewal_due', 'in_app', 'ar', 'حان موعد تجديد الاشتراك', 'انتهت فترة اشتراكك الحالية. جدّد الآن لتجنب إيقاف المزايا.'),
  ('subscription.renewal_due', 'in_app', 'en', 'Subscription renewal due', 'Your billing period ended. Renew now to keep your features.'),
  ('subscription.expired', 'in_app', 'ar', 'انتهى اشتراكك', 'انتهى اشتراكك وعاد حسابك إلى الباقة الأساسية.'),
  ('subscription.expired', 'in_app', 'en', 'Subscription expired', 'Your subscription expired and your account returned to the Basic plan.'),
  ('service_order.created', 'in_app', 'ar', 'طلب خدمة جديد', 'وصلك طلب خدمة مدفوع جديد ({{reference}}).'),
  ('service_order.created', 'in_app', 'en', 'New service order', 'You received a new paid service order ({{reference}}).'),
  ('service_order.delivered', 'in_app', 'ar', 'تم تسليم طلبك', 'سلّم المحامي طلبك {{reference}} ({{service}}). راجعه واعتمده أو اطلب تعديلًا.'),
  ('service_order.delivered', 'in_app', 'en', 'Order delivered', 'Your order {{reference}} ({{service}}) was delivered. Review it or request a revision.'),
  ('service_order.revision', 'in_app', 'ar', 'طلب تعديل', 'طلب العميل تعديلًا على {{reference}} ({{service}}).'),
  ('service_order.revision', 'in_app', 'en', 'Revision requested', 'The client requested a revision on {{reference}} ({{service}}).'),
  ('service_order.completed', 'in_app', 'ar', 'اكتمل الطلب', 'اعتمد العميل الطلب {{reference}}.'),
  ('service_order.completed', 'in_app', 'en', 'Order completed', 'The client accepted order {{reference}}.'),
  ('service_order.cancelled', 'in_app', 'ar', 'أُلغي الطلب', 'تم إلغاء الطلب {{reference}} ({{service}}).'),
  ('service_order.cancelled', 'in_app', 'en', 'Order cancelled', 'Order {{reference}} ({{service}}) was cancelled.'),
  ('service_order.updated', 'in_app', 'ar', 'تحديث على الطلب', 'تم تحديث حالة الطلب {{reference}}.'),
  ('service_order.updated', 'in_app', 'en', 'Order update', 'Order {{reference}} was updated.'),
  ('dispute.opened', 'in_app', 'ar', 'تم فتح نزاع', 'تم فتح نزاع بخصوص {{reference}}. سيتواصل معك فريق المنصة.'),
  ('dispute.opened', 'in_app', 'en', 'Dispute opened', 'A dispute was opened regarding {{reference}}. Our team will be in touch.'),
  ('dispute.resolved', 'in_app', 'ar', 'تم البت في النزاع', 'صدر قرار بشأن النزاع المتعلق بـ {{reference}}.'),
  ('dispute.resolved', 'in_app', 'en', 'Dispute resolved', 'A decision was made on the dispute about {{reference}}.'),
  ('review.received', 'in_app', 'ar', 'تقييم جديد', 'حصلت على تقييم جديد ({{rating}} من 5).'),
  ('review.received', 'in_app', 'en', 'New review', 'You received a new review ({{rating}} of 5).'),
  ('firm.invitation', 'in_app', 'ar', 'دعوة للانضمام إلى مكتب', 'دعاك {{firm}} للانضمام إلى فريقه.'),
  ('firm.invitation', 'in_app', 'en', 'Firm invitation', '{{firm}} invited you to join their team.'),
  ('settlement.paid', 'in_app', 'ar', 'تم تحويل مستحقاتك', 'تم تحويل {{amount}} ج.م (مرجع التحويل {{reference}}).'),
  ('settlement.paid', 'in_app', 'en', 'Payout sent', 'EGP {{amount}} was transferred (reference {{reference}}).')
on conflict (event_type, channel, locale) do update set subject = excluded.subject, body = excluded.body;

-- FAQ (about the platform — not legal advice)
insert into public.faqs (audience, question_ar, question_en, answer_ar, answer_en, sort_order)
select * from (values
  ('general', 'كيف أتأكد أن المحامي موثّق؟', 'How do I know a lawyer is verified?',
   'لا تظهر علامة «موثّق» إلا بعد أن يراجع فريق المنصة بيانات القيد بنقابة المحامين والمستندات المهنية المقدّمة. لا يستطيع المحامي إضافة العلامة بنفسه.',
   'The “Verified” badge only appears after our team reviews the lawyer''s bar registration details and professional documents. Lawyers cannot add it themselves.', 1),
  ('general', 'هل محادثاتي ومستنداتي سرية؟', 'Are my messages and documents confidential?',
   'نعم. لا يطّلع على المحادثات والمستندات إلا أطرافها ومن تمنحهم الصلاحية صراحة. يتم تنزيل الملفات عبر روابط مؤقتة بعد التحقق من صلاحيتك، ولا يملك فريق الدعم حق الاطلاع عليها.',
   'Yes. Only the participants and people you explicitly authorise can access conversations and documents. Files are downloaded through short-lived links after your access is checked, and support staff cannot open them.', 2),
  ('client', 'ماذا يحدث إذا ألغيت الموعد؟', 'What happens if I cancel?',
   'إذا ألغيت قبل المهلة التي حددها المحامي يُرد المبلغ بالكامل. الإلغاء بعد المهلة وقبل الموعد يُرد جزء من المبلغ وفق سياسة الاسترداد المعلنة، ولا يُرد المبلغ عند عدم الحضور.',
   'Cancelling before the lawyer''s deadline gives a full refund. Cancelling after the deadline but before the appointment gives a partial refund under the published refund policy; no-shows are not refunded.', 3),
  ('client', 'كيف أدفع ثمن الاستشارة؟', 'How do I pay?',
   'يتم الدفع إلكترونيًا عبر بوابة دفع مرخّصة في مصر. لا يتم تأكيد الحجز إلا بعد أن تؤكد بوابة الدفع نجاح العملية لخوادمنا مباشرة.',
   'Payments are processed through a licensed Egyptian payment gateway. A booking is only confirmed after the gateway confirms the payment directly to our servers.', 4),
  ('client', 'هل المساعد الذكي بديل عن المحامي؟', 'Is the AI assistant a substitute for a lawyer?',
   'لا. المساعد يقدّم معلومات عامة ويساعدك على التحضير للاستشارة، ولا يقدّم استشارة قانونية شخصية. القرار القانوني يجب أن يكون بعد استشارة محامٍ مؤهل.',
   'No. The assistant provides general information and helps you prepare; it does not give personalised legal advice. Always consult a qualified lawyer before acting.', 5),
  ('lawyer', 'كيف أنضم كمحامٍ؟', 'How do I join as a lawyer?',
   'سجّل حسابًا كمحامٍ، أكمل ملفك المهني، ثم ارفع مستندات القيد بالنقابة لطلب التوثيق. بعد الموافقة يمكنك نشر ملفك وتحديد مواعيدك وأسعارك.',
   'Register as a lawyer, complete your professional profile, then upload your bar registration documents to request verification. Once approved you can publish your profile and set your schedule and fees.', 6),
  ('lawyer', 'متى أحصل على مستحقاتي؟', 'When do I get paid?',
   'تُسجّل مستحقاتك بعد خصم عمولة المنصة في سجل مالي مفصّل، ويمكنك طلب التحويل إلى حسابك البنكي متى تجاوز الرصيد الحد الأدنى.',
   'Your earnings, net of platform commission, are recorded in a detailed ledger and you can request a transfer to your bank account once your balance exceeds the minimum.', 7)
) as v(audience, question_ar, question_en, answer_ar, answer_en, sort_order)
where not exists (select 1 from public.faqs);

-- Practical guides (platform guidance; they do not state legal rules)
insert into public.legal_articles (slug, kind, title_ar, title_en, excerpt_ar, excerpt_en, body_ar, body_en, status, published_at, reading_minutes, reviewed_by_lawyer)
select * from (values
  ('prepare-for-consultation', 'guide', 'كيف تستعد لاستشارتك القانونية الأولى', 'How to prepare for your first legal consultation',
   'خطوات عملية تساعدك على الاستفادة القصوى من وقت الاستشارة.', 'Practical steps to get the most out of your consultation time.',
   E'## قبل الاستشارة\n\n- اكتب ملخصًا قصيرًا للمشكلة بترتيب زمني للأحداث.\n- اجمع المستندات المرتبطة: العقود، الإيصالات، المراسلات، الإنذارات.\n- دوّن أسماء الأطراف وتواريخ الوقائع المهمة.\n- حدّد ما تريد الوصول إليه: نصيحة، صياغة عقد، أو رفع دعوى.\n\n## أثناء الاستشارة\n\n- كن صريحًا وكاملًا في عرض الوقائع؛ ما تقوله لمحاميك سري.\n- اسأل عن الخيارات المتاحة والمدة المتوقعة والتكاليف.\n- اطلب توضيح أي مصطلح غير مفهوم.\n\n## بعد الاستشارة\n\n- راجع الملاحظات التي يشاركها المحامي معك.\n- التزم بالمواعيد التي يحددها لتقديم المستندات.',
   E'## Before the consultation\n\n- Write a short, chronological summary of the issue.\n- Gather related documents: contracts, receipts, correspondence, notices.\n- Note the parties'' names and key dates.\n- Decide what you want: advice, a contract, or to file a case.\n\n## During the consultation\n\n- Be open and complete; what you tell your lawyer is confidential.\n- Ask about options, expected timelines and costs.\n- Ask for any term you don''t understand to be explained.\n\n## After the consultation\n\n- Review any notes your lawyer shares.\n- Meet the deadlines they set for providing documents.',
   'published'::public.content_status, now(), 4, false),
  ('choose-the-right-lawyer', 'guide', 'كيف تختار المحامي المناسب لقضيتك', 'How to choose the right lawyer for your case',
   'معايير بسيطة للمقارنة بين المحامين واختيار الأنسب.', 'Simple criteria for comparing lawyers and choosing well.',
   E'## التخصص أولًا\n\nاختر محاميًا يعمل في نفس مجال مشكلتك؛ فمسائل الأسرة تختلف عن العقود التجارية أو القضايا الجنائية.\n\n## التحقق من التوثيق\n\nتأكد من وجود علامة «موثّق»، وهي تعني أن المنصة راجعت بيانات القيد بالنقابة.\n\n## الخبرة والتقييمات\n\nاطّلع على سنوات الخبرة وتقييمات العملاء الموثّقة التي لا تُنشر إلا بعد استشارة مكتملة.\n\n## الأتعاب والوضوح\n\nقارن رسوم الاستشارة واطلب توضيحًا مكتوبًا لأي أتعاب إضافية قبل البدء.',
   E'## Specialisation first\n\nChoose a lawyer who works in the same area as your issue; family matters differ from commercial contracts or criminal cases.\n\n## Check verification\n\nLook for the “Verified” badge, which means the platform reviewed their bar registration.\n\n## Experience and reviews\n\nCheck years of experience and verified client reviews, which are only published after a completed consultation.\n\n## Fees and clarity\n\nCompare consultation fees and ask for any additional fees in writing before you start.',
   'published'::public.content_status, now(), 3, false),
  ('documents-checklist', 'guide', 'قائمة المستندات التي قد تحتاجها قبل مقابلة محامٍ', 'A documents checklist before meeting a lawyer',
   'قائمة عامة تساعدك على تجميع أوراقك حسب نوع المسألة.', 'A general list to help you collect papers by type of matter.',
   E'> هذه قائمة عامة للمساعدة في التنظيم وليست استشارة قانونية؛ قد يطلب محاميك مستندات مختلفة.\n\n## مستندات عامة\n\n- صورة بطاقة الرقم القومي.\n- أي مراسلات أو إنذارات تخص المسألة.\n\n## العقود والمعاملات\n\n- نسخة العقد وملاحقه.\n- إيصالات السداد أو التحويلات.\n\n## مسائل الأسرة\n\n- وثيقة الزواج أو الطلاق إن وجدت.\n- شهادات ميلاد الأبناء.\n\n## العمل\n\n- عقد العمل وأي خطابات من جهة العمل.\n- كشوف المرتبات أو ما يثبت الأجر.',
   E'> This is a general organising aid, not legal advice; your lawyer may ask for different documents.\n\n## General\n\n- A copy of your national ID.\n- Any correspondence or notices about the matter.\n\n## Contracts and transactions\n\n- The contract and any annexes.\n- Payment receipts or transfer records.\n\n## Family matters\n\n- Marriage or divorce certificate if any.\n- Children''s birth certificates.\n\n## Employment\n\n- Employment contract and letters from the employer.\n- Payslips or other proof of salary.',
   'published'::public.content_status, now(), 3, false)
) as v(slug, kind, title_ar, title_en, excerpt_ar, excerpt_en, body_ar, body_en, status, published_at, reading_minutes, reviewed_by_lawyer)
on conflict (slug) do nothing;

-- System document templates (drafts — always require review by a qualified lawyer)
insert into public.document_templates (key, category, title_ar, title_en, body_ar, body_en, variables)
select * from (values
  ('consultation_summary', 'consultation_summary', 'ملخص استشارة', 'Consultation summary',
   E'مسودة — تتطلب مراجعة محامٍ مؤهل قبل الاستخدام\n\nملخص استشارة قانونية\nالمرجع: {{reference}}\nالتاريخ: {{date}}\nالعميل: {{client_name}}\nالمحامي: {{lawyer_name}}\n\nالوقائع كما عرضها العميل:\n{{facts}}\n\nالمسائل محل البحث:\n{{issues}}\n\nالخيارات التي تمت مناقشتها:\n{{options}}\n\nالخطوات التالية المتفق عليها:\n{{next_steps}}',
   E'DRAFT — requires review by a qualified lawyer before use\n\nLegal consultation summary\nReference: {{reference}}\nDate: {{date}}\nClient: {{client_name}}\nLawyer: {{lawyer_name}}\n\nFacts as presented by the client:\n{{facts}}\n\nIssues considered:\n{{issues}}\n\nOptions discussed:\n{{options}}\n\nAgreed next steps:\n{{next_steps}}',
   array['reference', 'date', 'client_name', 'lawyer_name', 'facts', 'issues', 'options', 'next_steps']),
  ('engagement_letter', 'engagement_letter', 'خطاب تكليف', 'Engagement letter',
   E'مسودة — تتطلب مراجعة محامٍ مؤهل قبل الاستخدام\n\nخطاب تكليف\nالتاريخ: {{date}}\nالسيد/ة {{client_name}}\n\nنؤكد قبول تكليفنا بشأن: {{scope}}\n\nالأتعاب المتفق عليها: {{fees}}\nطريقة السداد: {{payment_terms}}\n\nلا يشمل هذا التكليف ما يخرج عن النطاق المذكور إلا باتفاق مكتوب لاحق.\n\nالمحامي: {{lawyer_name}}\nتوقيع العميل: ____________',
   E'DRAFT — requires review by a qualified lawyer before use\n\nEngagement letter\nDate: {{date}}\nDear {{client_name}},\n\nWe confirm our engagement regarding: {{scope}}\n\nAgreed fees: {{fees}}\nPayment terms: {{payment_terms}}\n\nWork outside this scope requires a further written agreement.\n\nLawyer: {{lawyer_name}}\nClient signature: ____________',
   array['date', 'client_name', 'scope', 'fees', 'payment_terms', 'lawyer_name']),
  ('service_agreement', 'service_agreement', 'اتفاقية تقديم خدمة قانونية', 'Legal service agreement',
   E'مسودة — تتطلب مراجعة محامٍ مؤهل قبل الاستخدام\n\nاتفاقية تقديم خدمة قانونية\nالطرف الأول (مقدم الخدمة): {{lawyer_name}}\nالطرف الثاني (العميل): {{client_name}}\n\n1. موضوع الخدمة: {{service}}\n2. المخرجات: {{deliverables}}\n3. المدة المتوقعة: {{duration}}\n4. المقابل المالي: {{fees}}\n5. التعديلات المشمولة: {{revisions}}\n6. السرية: يلتزم الطرف الأول بالحفاظ على سرية جميع المعلومات والمستندات.\n\nالتاريخ: {{date}}',
   E'DRAFT — requires review by a qualified lawyer before use\n\nLegal service agreement\nProvider: {{lawyer_name}}\nClient: {{client_name}}\n\n1. Service: {{service}}\n2. Deliverables: {{deliverables}}\n3. Expected duration: {{duration}}\n4. Fees: {{fees}}\n5. Included revisions: {{revisions}}\n6. Confidentiality: the provider keeps all information and documents confidential.\n\nDate: {{date}}',
   array['lawyer_name', 'client_name', 'service', 'deliverables', 'duration', 'fees', 'revisions', 'date']),
  ('contract_draft', 'contract_draft', 'مسودة عقد عامة', 'General contract draft',
   E'مسودة — تتطلب مراجعة محامٍ مؤهل قبل الاستخدام\n\nإنه في يوم {{date}} تم الاتفاق بين كل من:\nالطرف الأول: {{party_a}}\nالطرف الثاني: {{party_b}}\n\nتمهيد:\n{{preamble}}\n\nالبند الأول — موضوع العقد:\n{{subject}}\n\nالبند الثاني — الالتزامات:\n{{obligations}}\n\nالبند الثالث — المقابل:\n{{consideration}}\n\nالبند الرابع — المدة والإنهاء:\n{{term}}\n\nتحرر هذا العقد من نسختين بيد كل طرف نسخة.',
   E'DRAFT — requires review by a qualified lawyer before use\n\nOn {{date}} this agreement was made between:\nFirst party: {{party_a}}\nSecond party: {{party_b}}\n\nRecitals:\n{{preamble}}\n\n1. Subject:\n{{subject}}\n\n2. Obligations:\n{{obligations}}\n\n3. Consideration:\n{{consideration}}\n\n4. Term and termination:\n{{term}}\n\nExecuted in two counterparts, one for each party.',
   array['date', 'party_a', 'party_b', 'preamble', 'subject', 'obligations', 'consideration', 'term']),
  ('intake_form', 'intake_form', 'نموذج استقبال عميل', 'Client intake form',
   E'مسودة — تتطلب مراجعة محامٍ مؤهل قبل الاستخدام\n\nنموذج استقبال عميل\nالاسم: {{client_name}}\nالهاتف: {{phone}}\nالبريد الإلكتروني: {{email}}\nنوع المسألة: {{category}}\nالأطراف الأخرى: {{other_parties}}\nملخص المسألة: {{summary}}\nمواعيد مهمة: {{deadlines}}\nالمستندات المتوفرة: {{documents}}',
   E'DRAFT — requires review by a qualified lawyer before use\n\nClient intake form\nName: {{client_name}}\nPhone: {{phone}}\nEmail: {{email}}\nMatter type: {{category}}\nOther parties: {{other_parties}}\nSummary: {{summary}}\nKey deadlines: {{deadlines}}\nAvailable documents: {{documents}}',
   array['client_name', 'phone', 'email', 'category', 'other_parties', 'summary', 'deadlines', 'documents']),
  ('legal_notice', 'legal_notice', 'مسودة إنذار', 'Notice draft',
   E'مسودة — تتطلب مراجعة محامٍ مؤهل قبل الاستخدام\n\nإنذار\nمن: {{sender}}\nإلى: {{recipient}}\nالعنوان: {{recipient_address}}\n\nالموضوع: {{subject}}\n\n{{body}}\n\nوعليه نطالبكم بـ: {{demand}} خلال {{deadline}}.\n\nالتاريخ: {{date}}',
   E'DRAFT — requires review by a qualified lawyer before use\n\nNotice\nFrom: {{sender}}\nTo: {{recipient}}\nAddress: {{recipient_address}}\n\nSubject: {{subject}}\n\n{{body}}\n\nWe therefore request: {{demand}} within {{deadline}}.\n\nDate: {{date}}',
   array['sender', 'recipient', 'recipient_address', 'subject', 'body', 'demand', 'deadline', 'date']),
  ('matter_report', 'matter_report', 'تقرير موقف ملف', 'Matter status report',
   E'مسودة — تتطلب مراجعة محامٍ مؤهل قبل الاستخدام\n\nتقرير موقف الملف {{reference}}\nالعميل: {{client_name}}\nالتاريخ: {{date}}\n\nالحالة الحالية: {{status}}\n\nما تم إنجازه:\n{{progress}}\n\nالجلسات القادمة:\n{{hearings}}\n\nالمطلوب من العميل:\n{{client_actions}}',
   E'DRAFT — requires review by a qualified lawyer before use\n\nStatus report for matter {{reference}}\nClient: {{client_name}}\nDate: {{date}}\n\nCurrent status: {{status}}\n\nProgress:\n{{progress}}\n\nUpcoming hearings:\n{{hearings}}\n\nRequired from client:\n{{client_actions}}',
   array['reference', 'client_name', 'date', 'status', 'progress', 'hearings', 'client_actions'])
) as v(key, category, title_ar, title_en, body_ar, body_en, variables)
where not exists (select 1 from public.document_templates t where t.key = v.key and t.firm_id is null and t.lawyer_id is null);

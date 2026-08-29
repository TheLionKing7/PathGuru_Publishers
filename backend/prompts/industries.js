/**
 * Industry context blocks — the {{CONTEXT}} half of the composition.
 *
 * A library with one prompt per industry per task would be thousands of
 * near-identical entries that nobody can search. These blocks make it N + M
 * instead of N x M: any prompt, plus any industry.
 *
 * Each block carries the sector's real CONSTRAINTS, not its vocabulary. The
 * vocabulary a model already has; what it does not have is the knowledge that
 * a clinical decision-support tool is a regulated product, or that a public
 * body's decisions must be defensible years later to someone who was not there.
 *
 * OPERATOR-FACING. Nothing here is resolved into an agent's live prompt.
 */

export const INDUSTRIES = [
  {
    id: 'professional-services',
    name: 'Professional services',
    body: `SECTOR CONTEXT — professional services ({{law / accounting / consulting / architecture}})
The unit of production is billable expert time, so every hour saved is either margin or capacity, and the firm must choose which. Work arrives as matters or engagements with long, irregular lifecycles. Partners hold the client relationships and most of the undocumented judgement. Quality is judged by the client on responsiveness as much as on the work itself.
Constraints: professional privilege and client confidentiality; conflict-of-interest checks; regulator or professional-body rules on record keeping and on what may leave the firm's systems; matter-level cost recovery.
Typical friction: manual time capture, document assembly, conflict checks, chasing clients for information, partners doing work two grades below themselves.
Firm: {{NAME}} · {{HEADCOUNT}} · {{JURISDICTION}} · practice areas {{LIST}}`,
  },
  {
    id: 'retail-e-commerce',
    name: 'Retail & e-commerce',
    body: `SECTOR CONTEXT — retail and e-commerce
Margins are thin and volume is high, so a small percentage improvement in a repeated operation outweighs a large improvement in a rare one. Demand is seasonal and promotion-driven. Inventory is the largest working-capital commitment and the largest source of loss.
Constraints: payment and card-data handling rules; consumer protection and returns law; marketplace platform policies that change without notice; stock accuracy limits everything downstream.
Typical friction: manual stock reconciliation across channels, listing and pricing updates, returns processing, customer messages that are really order-status queries, supplier chasing.
Business: {{NAME}} · channels {{ONLINE / STORE / MARKETPLACE}} · SKU count {{N}} · {{AVERAGE ORDER VALUE}} · {{CURRENCY}}`,
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing',
    body: `SECTOR CONTEXT — manufacturing
Physical constraints dominate: a bottleneck is a machine or a person, and software cannot remove it, only reveal and schedule around it. Changeovers, batch sizes and yield define the economics. Quality failures are expensive and traceable.
Constraints: safety regulation; traceability and lot recall obligations; equipment that predates any usable API; unions or works councils where applicable; certification regimes.
Typical friction: production scheduling by spreadsheet, quoting bespoke jobs, re-keying between shop floor and finance, maintenance scheduled by memory, quality records kept on paper.
Plant: {{NAME}} · products {{DESCRIBE}} · {{HEADCOUNT}} · shifts {{N}} · make-to-{{ORDER/STOCK}}`,
  },
  {
    id: 'logistics-supply-chain',
    name: 'Logistics & supply chain',
    body: `SECTOR CONTEXT — logistics and supply chain
Time and location are the product. Exceptions are the normal case, not the tail — delays, damage, customs holds and failed deliveries are routine, and any design that treats them as edge cases will fail. Data arrives late and from parties you do not control.
Constraints: customs and cross-border documentation; carrier system integrations of wildly varying quality; driver-hours and licensing rules; proof-of-delivery evidence requirements.
Typical friction: manual track-and-trace updates, re-keying between carrier portals, exception handling by phone, invoice reconciliation against actual movements, customer status enquiries.
Operator: {{NAME}} · modes {{ROAD/AIR/SEA/RAIL}} · lanes {{DESCRIBE}} · {{SHIPMENTS PER MONTH}}`,
  },
  {
    id: 'financial-services',
    name: 'Financial services',
    body: `SECTOR CONTEXT — financial services and fintech
Regulated, audited, and adversarial. Every automated decision that affects a customer must be explainable after the fact, and "the model decided" is not an explanation a regulator accepts. Errors are recoverable in money but rarely in trust.
Constraints: licensing and conduct regulation; KYC/AML obligations; data residency and retention rules; audit trails on every decision; model governance and explainability; fraud as an active adversary.
Typical friction: manual KYC document review, reconciliation across ledgers, regulatory reporting assembly, customer onboarding handoffs, exception queues that grow faster than they are cleared.
Institution: {{NAME}} · regulated by {{BODY}} · products {{LIST}} · {{CUSTOMER COUNT}} · {{JURISDICTIONS}}`,
  },
  {
    id: 'healthcare-clinics',
    name: 'Healthcare & clinics',
    body: `SECTOR CONTEXT — healthcare and clinical services
Patient safety outranks efficiency in every decision, and clinicians are correctly sceptical of tools that add clicks. Clinical and administrative work must be separated: administrative automation is often welcome, clinical decision support is a regulated product.
Constraints: patient data protection rules and consent; clinical governance; medical device regulation where software influences diagnosis or treatment; professional liability; record retention obligations.
Typical friction: appointment scheduling and no-shows, referral letters, insurance or scheme claims, prior authorisation, clinical documentation, results chasing.
Provider: {{NAME}} · setting {{PRIMARY/SPECIALIST/HOSPITAL}} · {{PATIENT VOLUME}} · {{JURISDICTION}}
NOTE: do not propose anything touching diagnosis, triage or treatment without saying explicitly that it is a regulated activity.`,
  },
  {
    id: 'education-training',
    name: 'Education & training',
    body: `SECTOR CONTEXT — education and training
Cycles are academic, not commercial — the year has hard deadlines that cannot move. Two customers exist and often disagree: the learner and whoever pays. Assessment integrity is a live and contested issue.
Constraints: safeguarding rules where learners are minors; accreditation and awarding-body requirements; student data protection; academic integrity policy; procurement cycles in public institutions.
Typical friction: admissions and enrolment processing, timetabling, marking and feedback, attendance chasing, reporting to funders or awarding bodies, answering the same fifty questions each intake.
Institution: {{NAME}} · type {{SCHOOL/COLLEGE/PROVIDER}} · {{LEARNER NUMBERS}} · funded by {{SOURCE}}`,
  },
  {
    id: 'hospitality-food',
    name: 'Hospitality & food',
    body: `SECTOR CONTEXT — hospitality and food service
Labour-intensive, high staff turnover, and the operation runs while you are changing it. Demand is highly variable by hour and season. Margins are thin enough that waste and rostering dominate profitability.
Constraints: food safety records and inspection; licensing; shift and working-time rules; high turnover means any process requiring training decays fast.
Typical friction: rostering to forecast demand, stock counts and waste recording, supplier ordering, booking management and no-shows, review responses, shift handover notes.
Business: {{NAME}} · sites {{N}} · covers or rooms {{N}} · {{HEADCOUNT}} · {{CURRENCY}}`,
  },
  {
    id: 'real-estate-property',
    name: 'Real estate & property',
    body: `SECTOR CONTEXT — real estate and property management
Transactions are infrequent, large and document-heavy; management is continuous, small and interruption-driven. The two halves have opposite operating shapes and should be assessed separately.
Constraints: tenancy and landlord law; deposit handling rules; anti-money-laundering checks on transactions; health and safety obligations on managed buildings; certificate expiry tracking.
Typical friction: viewing scheduling, tenant enquiries and maintenance triage, compliance certificate expiry tracking, rent arrears chasing, listing preparation, document collection.
Business: {{NAME}} · {{SALES/LETTINGS/MANAGEMENT}} · units under management {{N}} · {{JURISDICTION}}`,
  },
  {
    id: 'construction-engineering',
    name: 'Construction & engineering',
    body: `SECTOR CONTEXT — construction and engineering
Project-based, with margins decided at tender and eroded by variations. Site conditions are the source of truth and are poorly captured. Subcontractor coordination is most of the management effort.
Constraints: safety regulation and site records; building regulation and inspection; retention and payment terms that stretch cashflow; variation and claim documentation as a legal record.
Typical friction: tender and take-off preparation, RFI handling, variation tracking, site reporting from paper or photos, subcontractor payment applications, programme updates.
Firm: {{NAME}} · {{DISCIPLINE}} · typical project value {{FIGURE}} · concurrent projects {{N}}`,
  },
  {
    id: 'agriculture-agribusiness',
    name: 'Agriculture & agribusiness',
    body: `SECTOR CONTEXT — agriculture and agribusiness
Biological and weather cycles set the pace and cannot be compressed. Connectivity in the field is unreliable and any design assuming constant network access will fail. Price volatility on both inputs and outputs is the dominant financial risk.
Constraints: traceability requirements for food safety and export; certification schemes; subsidy or scheme reporting; seasonal labour rules; offline-capable capture is a requirement, not a nicety.
Typical friction: field record keeping, input and yield tracking, traceability documentation, buyer and offtake coordination, scheme and certification reporting, aggregating records from many smallholders.
Business: {{NAME}} · {{CROP/LIVESTOCK}} · hectares or head {{N}} · route to market {{DESCRIBE}}`,
  },
  {
    id: 'media-agencies',
    name: 'Media & agencies',
    body: `SECTOR CONTEXT — media, creative and marketing agencies
Sells time and judgement, delivers artefacts, and is judged on both quality and responsiveness. Scope creep is the primary margin risk, and it usually arrives as a series of small reasonable requests. Client approval cycles are the longest step in most workflows.
Constraints: intellectual property and usage rights; client confidentiality and embargoes; platform policies for anything published; brand and legal approval chains.
Typical friction: brief intake, versioning and approval chasing, timesheet capture, reporting to clients, repurposing assets across channels, campaign performance assembly.
Agency: {{NAME}} · {{HEADCOUNT}} · services {{LIST}} · retained vs project mix {{RATIO}}`,
  },
  {
    id: 'nonprofit-ngo',
    name: 'Nonprofit & NGO',
    body: `SECTOR CONTEXT — nonprofit and NGO
Accountable to funders and to beneficiaries, whose interests do not always align. Restricted funding means money often cannot be moved to where the need is. Reporting burden is disproportionate to organisation size.
Constraints: donor and grant reporting requirements, often per-grant and non-standard; safeguarding obligations; beneficiary data protection in sensitive contexts; restricted-fund accounting; procurement rules attached to institutional funding.
Typical friction: grant reporting assembly, beneficiary data collection in the field, donor communications, monitoring and evaluation data, volunteer coordination, multi-currency accounting.
Organisation: {{NAME}} · mission {{DESCRIBE}} · {{HEADCOUNT}} · funders {{LIST}} · countries {{LIST}}`,
  },
  {
    id: 'public-sector',
    name: 'Public sector',
    body: `SECTOR CONTEXT — public sector and government
Decisions must be defensible to people who did not make them, sometimes years later. Procurement is slow and rule-bound. Equity of access is a legal obligation, so any solution that works only for the digitally confident is a failure, not a first version.
Constraints: procurement regulation; public records and freedom-of-information obligations; accessibility standards as law; algorithmic accountability and appeal rights; the citizen cannot choose another provider.
Typical friction: case intake and routing, eligibility checking, correspondence handling, statutory reporting, inter-department handoffs, records management.
Body: {{NAME}} · function {{DESCRIBE}} · citizens served {{N}} · {{JURISDICTION}}
NOTE: anything affecting an individual's entitlement needs an appeal route and a human decision-maker. State this rather than assuming it.`,
  },
  {
    id: 'energy-utilities',
    name: 'Energy & utilities',
    body: `SECTOR CONTEXT — energy and utilities
Assets are long-lived, capital-intensive and physically distributed. Reliability obligations are absolute and often regulated. Field work is the dominant operational cost, and scheduling it well is worth more than any office efficiency.
Constraints: regulatory reporting and reliability standards; safety-critical operations; metering and billing accuracy rules; critical-infrastructure security requirements; assets with decades-long replacement cycles.
Typical friction: field work scheduling and dispatch, outage communication, meter data validation, billing exceptions, asset inspection records, connection and new-supply applications.
Utility: {{NAME}} · {{ELECTRICITY/GAS/WATER/RENEWABLES}} · customers {{N}} · regulator {{BODY}}`,
  },
  {
    id: 'technology-saas',
    name: 'Technology & SaaS',
    body: `SECTOR CONTEXT — technology and SaaS
Revenue is recurring, so retention economics outweigh acquisition economics past a certain size. The product and the go-to-market machine are different systems with different failure modes. Engineers will build rather than buy unless given a reason not to.
Constraints: uptime commitments and SLAs; customer data protection and sub-processor disclosure; security review as a sales gate; versioning and backward compatibility; support load scaling with customer count rather than revenue.
Typical friction: support triage, onboarding and implementation for new customers, churn signals noticed late, sales-to-delivery handoff, usage reporting, security questionnaires.
Company: {{NAME}} · {{ARR}} · customers {{N}} · {{SELF-SERVE/SALES-LED}} · {{HEADCOUNT}}`,
  },
  {
    id: 'legal-services',
    name: 'Legal services',
    body: `SECTOR CONTEXT — legal services (firms, chambers, in-house counsel)
Deadlines are set by courts and statutes and do not move for anyone's convenience, so anything on a limitation or filing path is safety-critical in the way a payment run is not. Advice is a regulated activity: a system may assemble, retrieve and draft, but a qualified person must own what goes out. Precedent and know-how are the firm's real asset and usually live in individual matter files rather than anywhere searchable.
Constraints: legal professional privilege — privileged material must not cross into any system whose processing terms you have not read; conflict-of-interest checking before any new matter; client money and trust account rules, audited; regulator and professional-body obligations on supervision, file retention and complaints; court filing formats and deadlines; confidentiality between matters within the same firm (information barriers).
Typical friction: conflict checks, engagement letters and matter opening, document assembly from precedent, bundle and disclosure preparation, time capture, chasing clients for instructions and documents, deadline diarising, billing narratives.
Firm: {{NAME}} · {{PRACTICE AREAS}} · fee earners {{N}} · {{JURISDICTION}} · regulator {{BODY}}
NOTE: never propose anything that produces legal advice, a filing, or a limitation-date calculation without a named qualified reviewer in the loop. Say so explicitly rather than assuming the client will add one.`,
  },
];

export const INDUSTRY_BY_ID = Object.fromEntries(INDUSTRIES.map((i) => [i.id, i]));

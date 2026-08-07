/**
 * Benchmark Datasets for Healthcare & Medical Board Policy Agent
 * Unstructured documents, transcripts, and policy drafts for real-time audit & verification.
 */

export const SAMPLE_DOCUMENTS = [
  {
    id: "telehealth-sop-2026",
    title: "State Medical Board Telemedicine & Remote Care Compliance SOP (Draft v3.1)",
    category: "Telehealth Regulations",
    description: "Unstructured operational guidelines for remote patient consultations, cross-state licensure, physician supervision, and electronic prescriptions.",
    rawContent: `STATE MEDICAL BOARD CLINICAL POLICY DIRECTIVE
DOCUMENT REF: SMB-TELE-2026-REV3
SUBJECT: GUIDELINES FOR TELEMEDICINE PRACTICE AND VIRTUAL CLINICAL GOVERNANCE

SECTION 1: APPLICABILITY AND LICENSURE REQUIREMENTS
1.1 All practitioners conducting virtual consultations with patients located within the state jurisdiction must hold an active, unrestricted license issued by the State Medical Board.
1.2 Practitioners operating across state borders must hold a valid Interstate Medical Licensure Compact (IMLC) designation prior to commencing care.
1.3 Exemption clause: Emergency consultations requested by an attending hospital physician do not require pre-registration, provided formal notification is submitted within 72 hours of consultation.
1.4 Initial patient intake via telehealth requires multi-factor identity verification using state-issued photo identification. (Note: Currently under review for low-bandwidth rural clinics).

SECTION 2: PHYSICIAN SUPERVISION AND ADVANCED PRACTICE PROVIDERS
2.1 Advanced Practice Registered Nurses (APRNs) and Physician Assistants (PAs) engaged in remote care must operate under a formal Collaborative Practice Agreement (CPA).
2.2 A supervising physician may not oversee more than four (4) full-time equivalent (FTE) PAs simultaneously during active virtual clinic hours.
2.3 The supervising physician is required to review and sign off on a minimum of 20% of all remote patient charts within seven (7) business days.
2.4 Real-time synchronous video connection is mandatory for all initial diagnostic assessments. Asynchronous store-and-forward image review is strictly prohibited for first-time psychiatric evaluations.

SECTION 3: CONTROLLED SUBSTANCE PRESCRIBING & PDMP CHECKS
3.1 Prescribing Schedule II controlled substances via telemedicine is strictly prohibited unless an in-person clinical examination was performed within the preceding 12 months.
3.2 Prior to issuing any Schedule II-V prescription, the prescribing clinician MUST query the state Prescription Drug Monitoring Program (PDMP) database.
3.3 PDMP query results, including timestamp and query confirmation ID, must be permanently logged in the electronic health record (EHR).
3.4 Failure to perform mandatory PDMP lookup prior to controlled substance issuance constitutes professional misconduct and triggers immediate Medical Board investigation.

SECTION 4: EMERGENCY ESCALATION AND PATIENT TRANSFER PROTOCOLS
4.1 Every virtual care platform must possess an automated geography-based emergency dispatch mechanism to route 911 services to the patient's physical location.
4.2 Clinicians must document the patient's exact physical address at the start of every virtual session.
4.3 If a patient exhibits acute cardiac distress, suicidal ideation, or severe respiratory failure during a session, the clinician must maintain active video contact until emergency first responders arrive on site.
4.4 Note: Local clinic branches currently lack standardized transfer agreements with regional trauma centers for virtual overflow patients.

SECTION 5: DATA PRIVACY, ENCRYPTION AND AUDIT LOGS
5.1 Audio and video streams must utilize end-to-end AES-256 bit encryption in compliance with federal HIPAA Security Rule standards.
5.2 Unencrypted consumer messaging apps (including standard SMS, WhatsApp, and unverified web chat widgets) are strictly forbidden for transmitting Protected Health Information (PHI).
5.3 Complete access logs, session recordings (where consent is granted), and audit trails must be retained for a mandatory period of seven (7) years.
5.4 Patient consent for telehealth delivery and data storage must be obtained electronically prior to initiating session media.`
  },

  {
    id: "surgical-consent-sop",
    title: "Hospital Emergency Surgery & Informed Consent Clinical Policy",
    category: "Hospital Governance",
    description: "Surgical governance protocol outlining emergency consent waivers, pre-operative safety checklists, surrogate authorization, and interpreter mandates.",
    rawContent: `ST. JUDE REGIONAL MEDICAL CENTER
CLINICAL GOVERNANCE & SURGICAL SERVICES DIRECTIVE
POLICY NUMBER: CG-SURG-809

PART I: SURGICAL INFORMED CONSENT MANDATES
Line 1: 101. Informed consent must be obtained by the operating attending surgeon or a qualified surgical resident directly assigned to the case.
Line 2: 102. Delegating the informed consent discussion to administrative personnel, medical students, or non-surgical nursing staff is strictly prohibited.
Line 3: 103. The consent form must explicitly enumerate: (a) proposed procedure, (b) expected clinical benefits, (c) material risks including infection, hemorrhage, or death, (d) reasonable surgical alternatives, and (e) identity of the primary attending surgeon.
Line 4: 104. For non-English speaking patients, consent discussions MUST be facilitated by a certified medical interpreter. Family members may NOT serve as interpreters under any circumstances, except in immediate life-threatening crises where certified interpreters are unavailable.

PART II: EMERGENCY SURGICAL CONSENT WAIVERS
Line 5: 201. Emergency surgical intervention may proceed without prior written informed consent ONLY when all three (3) of the following criteria are satisfied:
Line 6:     a. Immediate operation is required to prevent death or irreversible organ impairment.
Line 7:     b. The patient lacks decision-making capacity due to trauma, altered mental status, or sedation.
Line 8:     c. No legally authorized surrogate decision-maker can be reached after documented diligent efforts.
Line 9: 202. Two (2) independent attending physicians must execute a formal Emergency Surgical Authorization Certificate documenting the medical necessity prior to incision.
Line 10: 203. Retroactive consent documentation must be obtained from the patient or legal guardian within 24 hours post-operation.

PART III: PRE-OPERATIVE TIME-OUT AND WRONG-SITE SURGERY PREVENTION
Line 11: 301. Immediately prior to surgical incision, the entire operating room team (surgeon, anesthesiologist, scrub tech, circulating nurse) must pause for a mandatory 'Universal Protocol Time-Out'.
Line 12: 302. The time-out must verbally verify: patient identity, surgical site marking, correct patient positioning, and availability of required implants/equipment.
Line 13: 303. Surgical site marking must be completed by the operating surgeon using an indelible surgical marker while the patient is awake and conscious.
Line 14: 304. Exception: Site marking is exempt for single-organ procedures (e.g., appendectomy, hysterectomy) or emergency resuscitative thoracotomies.
Line 15: 305. Failure to perform or document the Universal Protocol Time-Out results in immediate suspension of surgical block privileges.`
  },

  {
    id: "board-hearing-transcript",
    title: "State Medical Board Disciplinary Hearing & Protocol Audit Transcript",
    category: "Board Hearing Transcript",
    description: "Verbatim transcript of a state medical board review hearing examining physician supervision lapses, unverified prescription logs, and compliance breaches.",
    rawContent: `OFFICIAL PROCEEDINGS OF THE STATE BOARD OF MEDICAL EXAMINERS
CASE FILE: 2026-HB-4092 (AUDIT REVIEW HEARING)
DATE: MAY 14, 2026

DR. ELEANOR VANCE (BOARD CHAIR): Good morning. We are on the record for Case 2026-HB-4092 regarding Metro Urgent Care & Telehealth Group. Dr. Miller, as Chief Medical Officer, please address the audit finding from March 12 regarding physician assistant supervision.

DR. HAROLD MILLER (CMO): Thank you, Madam Chair. During our internal expansion last quarter, Dr. Aris Thorne was assigned as supervising physician for six mid-level practitioners across three county clinics.

DR. VANCE: Six practitioners? Board Regulation 2.2 explicitly caps supervising physician oversight at a maximum of four full-time equivalent PAs. That is a clear statutory over-allocation. How long was Dr. Thorne operating over capacity?

DR. MILLER: Regrettably, for approximately eleven weeks between January and mid-March. We encountered unexpected staffing shortages in our north district.

BOARD MEMBER SANCHEZ: Dr. Miller, let us discuss the prescription audit. The State Audit Division found 42 instances of Schedule II narcotic prescriptions issued without a recorded PDMP database query timestamp in the patient records.

DR. MILLER: Our EHR integration experienced a software sync glitch with the state PDMP gateway during that period. Clinicians were performing manual browser checks, but the automated chart logging feature failed to record the confirmation ID.

DR. VANCE: Was there manual documentation in the progress notes confirming those 42 queries?

DR. MILLER: In 28 of the charts, yes, manual notes exist. In the remaining 14 charts, there is no physical or electronic record of a PDMP query prior to issuance.

BOARD MEMBER SANCHEZ: That is unacceptable. Section 3.2 makes PDMP query logging a non-negotiable statutory requirement prior to dispensing controlled substances. 14 unverified narcotic prescriptions pose a severe patient safety risk.

DR. VANCE: Moving to emergency protocols. During a virtual consultation on February 2, a patient experienced severe anaphylaxis. The telehealth clinician attempted to dispatch emergency services but did not have the patient's updated physical location recorded.

DR. MILLER: The patient was logged into the app from a temporary hotel address while traveling. The clinician relied on the default home address stored in the user profile, resulting in a 18-minute delay in EMS dispatch.

DR. VANCE: Section 4.2 states unequivocally that clinicians must verbally verify and document the patient's current physical address at the start of EVERY virtual session. This transcript will be entered into evidence for final board deliberation.`
  },

  {
    id: "hipaa-privacy-policy",
    title: "Healthcare Enterprise HIPAA & Patient Data Protection Directive",
    category: "HIPAA & Data Privacy",
    description: "Enterprise policy for electronic protected health information (ePHI), business associate agreements (BAAs), breach notifications, and access logging.",
    rawContent: `HEALTHCARE SYSTEM DATA SECURITY & PRIVACY POLICY
STANDARD OPERATING PROCEDURE: POL-HIPAA-2026

SECTION A: ACCESS CONTROL AND MINIMUM NECESSARY STANDARD
A.1 Access to Electronic Protected Health Information (ePHI) is strictly restricted based on the principle of 'Minimum Necessary Access' aligned with job roles.
A.2 All administrative, clinical, and billing staff must authenticate using unique individual user credentials paired with hardware-based Multi-Factor Authentication (MFA).
A.3 Generic, shared, or group login accounts are strictly prohibited across all electronic medical record systems and diagnostic imaging workstations.
A.4 Inactive user sessions must automatically lock or terminate after ten (10) minutes of inactivity.

SECTION B: BUSINESS ASSOCIATE AGREEMENTS (BAAs) AND THIRD-PARTY VENDORS
B.1 Cloud service providers, AI software vendors, and data analytics partners handling ePHI must execute a formal, legally binding Business Associate Agreement (BAA).
B.2 BAAs must mandate that vendor infrastructure complies with AES-256 encryption at rest and TLS 1.3 encryption in transit.
B.3 Third-party vendors are strictly prohibited from utilizing patient data or clinical transcripts for public AI model training without explicit, un-coerced patient opt-in authorization.
B.4 Note: Current vendor agreements for legacy diagnostic archiving software are pending BAA renewal verification.

SECTION C: BREACH NOTIFICATION AND INCIDENT RESPONSE
C.1 Any suspected or confirmed security incident involving unauthorized access, exposure, or exfiltration of ePHI must be reported to the Chief Information Security Officer (CISO) within two (2) hours of discovery.
C.2 In the event of a breach affecting 500 or more individuals, formal written notification MUST be submitted to the U.S. Department of Health & Human Services (HHS) OCR within 60 calendar days.
C.3 Affected individuals must receive written breach notices via first-class mail without unreasonable delay and in no case later than 60 days following discovery.
C.4 Annual mandatory HIPAA privacy and cybersecurity awareness training is required for all personnel with system access privileges.`
  }
];
